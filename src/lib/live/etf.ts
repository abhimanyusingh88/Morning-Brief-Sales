import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import type { Db, Q } from '../db/types';
import { FactBook } from '../ai/facts';
import { validateText } from '../ai/validator';
import { fetchSource } from './fetch';
import { businessDate, etOffset } from './time';
import { parseDaily, type DailySeries } from './weekly';

/**
 * Leveraged ETF commentary. Creations and redemptions (CR/RD) are read from each issuer's own daily files:
 * flow = change in shares outstanding × NAV, and target exposure = flow × the fund's daily leverage (negative for
 * inverse funds). Every figure is computed by code from those files; a model may only write prose around tokens.
 */
export type GroupKey = 'semis' | 'ndx' | 'spx';
export type Fund = {
  ticker: string;
  name: string;
  issuer: 'ProShares' | 'Direxion';
  group: GroupKey;
  leverage: number;
};
export const GROUPS: Record<GroupKey, { label: string; noun: string; index: string; indexLabel: string }> = {
  semis: { label: 'Semiconductors', noun: 'semiconductor', index: '^SOX', indexLabel: 'PHLX Semiconductor index' },
  ndx: { label: 'Nasdaq-100', noun: 'Nasdaq', index: '^NDX', indexLabel: 'Nasdaq-100' },
  spx: { label: 'S&P 500', noun: 'S&P 500', index: '^GSPC', indexLabel: 'S&P 500' },
};
export const FUNDS: Fund[] = [
  { ticker: 'SOXL', name: 'Direxion Daily Semiconductor Bull 3X', issuer: 'Direxion', group: 'semis', leverage: 3 },
  { ticker: 'SOXS', name: 'Direxion Daily Semiconductor Bear 3X', issuer: 'Direxion', group: 'semis', leverage: -3 },
  { ticker: 'USD', name: 'ProShares Ultra Semiconductors', issuer: 'ProShares', group: 'semis', leverage: 2 },
  { ticker: 'SSG', name: 'ProShares UltraShort Semiconductors', issuer: 'ProShares', group: 'semis', leverage: -2 },
  { ticker: 'TQQQ', name: 'ProShares UltraPro QQQ', issuer: 'ProShares', group: 'ndx', leverage: 3 },
  { ticker: 'SQQQ', name: 'ProShares UltraPro Short QQQ', issuer: 'ProShares', group: 'ndx', leverage: -3 },
  { ticker: 'QLD', name: 'ProShares Ultra QQQ', issuer: 'ProShares', group: 'ndx', leverage: 2 },
  { ticker: 'UPRO', name: 'ProShares UltraPro S&P500', issuer: 'ProShares', group: 'spx', leverage: 3 },
  { ticker: 'SPXU', name: 'ProShares UltraPro Short S&P500', issuer: 'ProShares', group: 'spx', leverage: -3 },
];
export const fundUrl = (f: Fund) =>
  f.issuer === 'ProShares'
    ? 'https://accounts.profunds.com/etfdata/ByFund/' + f.ticker + '-historical_nav.csv'
    : 'https://www.direxion.com/holdings/' + f.ticker + '.csv';
export const WEEK = 5;

export type ShareRow = { ticker: string; asOf: string; shares: number; nav: number; source: string; url: string };

const usDate = (s: string) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s.trim().replace(/^"/, ''));
  return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : null;
};
const cells = (line: string) =>
  (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').trim());

/** ProShares daily history: one row per session with NAV and shares outstanding (in thousands). */
export function parseProShares(text: string, ticker: string, url: string): ShareRow[] {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = cells(lines[0] ?? '').map((h) => h.toLowerCase());
  const iDate = head.indexOf('date'),
    iTicker = head.indexOf('ticker'),
    iNav = head.indexOf('nav'),
    iShares = head.findIndex((h) => h.startsWith('shares outstanding'));
  if (iDate < 0 || iTicker < 0 || iNav < 0 || iShares < 0) throw new Error('SOURCE_SCHEMA');
  const thousands = /\(000\)/.test(head[iShares]) ? 1000 : 1;
  const rows: ShareRow[] = [];
  for (const line of lines.slice(1)) {
    const c = cells(line);
    const asOf = usDate(c[iDate] ?? ''),
      nav = Number(c[iNav]),
      shares = Number(c[iShares]) * thousands;
    if (!asOf || c[iTicker] !== ticker || !(nav > 0) || !(shares >= 0) || !Number.isFinite(shares)) continue;
    rows.push({ ticker, asOf, shares, nav, source: 'ProShares daily NAV and shares outstanding', url });
  }
  if (!rows.length) throw new Error('SOURCE_SCHEMA');
  const byDate = new Map(rows.map((r) => [r.asOf, r]));
  return [...byDate.values()].sort((a, b) => a.asOf.localeCompare(b.asOf)).slice(-60);
}

/** Direxion's daily holdings file: shares outstanding for the stated trade date's opening book. */
export function parseDirexion(text: string, ticker: string): { shares: number; tradeDate: string } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (!lines.slice(0, 4).some((l) => l.trim() === ticker)) throw new Error('SOURCE_SCHEMA');
  const so = lines.map((l) => /^Shares Outstanding:\s*([\d,]+)/i.exec(l.trim())).find(Boolean);
  const shares = so ? Number(so[1].replace(/,/g, '')) : NaN;
  const head = lines.findIndex((l) => /TradeDate/i.test(l));
  const first = head >= 0 ? cells(lines[head + 1] ?? '') : [];
  const tradeDate = usDate(first[0] ?? '');
  if (!Number.isFinite(shares) || shares < 0 || !tradeDate || first[1] !== ticker) throw new Error('SOURCE_SCHEMA');
  return { shares, tradeDate };
}

const closesCache = new Map<string, { at: number; value: DailySeries }>();
/** Daily closes from Yahoo Finance (delayed); the last point is the provider's latest regular-session price. */
export async function getCloses(symbol: string, range: '1mo' | '3mo' = '3mo'): Promise<DailySeries | null> {
  const k = symbol + range,
    hit = closesCache.get(k);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.value;
  const url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) +
    '?range=' +
    range +
    '&interval=1d';
  try {
    const r = await fetchSource(url, AbortSignal.timeout(8000));
    const value = parseDaily(r.text, symbol, url);
    closesCache.set(k, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

/** One fund's latest rows from its issuer. Direxion NAV is that session's official closing price on Yahoo Finance. */
export async function collectFund(f: Fund, signal: AbortSignal): Promise<ShareRow[]> {
  const url = fundUrl(f);
  const r = await fetchSource(url, signal);
  if (f.issuer === 'ProShares') return parseProShares(r.text, f.ticker, url);
  const { shares, tradeDate } = parseDirexion(r.text, f.ticker);
  const px = await getCloses(f.ticker, '1mo');
  // The file opens the trade date's book, so its share count is the position after the previous session's close.
  const prior = px?.closes.filter((c) => c.date < tradeDate).at(-1);
  if (!prior) throw new Error('SOURCE_PRICE_UNAVAILABLE');
  return [
    {
      ticker: f.ticker,
      asOf: prior.date,
      shares,
      nav: prior.close,
      source: 'Direxion daily holdings file (shares outstanding); NAV is the Yahoo Finance closing price',
      url,
    },
  ];
}

async function check(q: Q, key: string, ok: boolean, accepted: number, detail: string) {
  await q(
    'insert into live_source_checks(source_key,checked_at,succeeded,accepted,detail) values($1,now(),$2,$3,$4) on conflict(source_key) do update set checked_at=excluded.checked_at,succeeded=excluded.succeeded,accepted=excluded.accepted,detail=excluded.detail',
    [key, ok, accepted, detail],
  );
}
/** Fetches every fund and stores what each issuer published. A failed issuer keeps its earlier rows. */
export async function collectEtfData(db: Db, signal = AbortSignal.timeout(40000)) {
  const results = await Promise.all(
    FUNDS.map(async (f) => {
      try {
        return { f, rows: await collectFund(f, signal), error: null as string | null };
      } catch (e) {
        return {
          f,
          rows: [] as ShareRow[],
          error: e instanceof Error && /^SOURCE_/.test(e.message) ? e.message : 'SOURCE_UNAVAILABLE',
        };
      }
    }),
  );
  await db.asService(async (q) => {
    const rows = results
      .flatMap((r) => r.rows)
      .map((r) => ({
        ticker: r.ticker,
        as_of: r.asOf,
        shares: r.shares,
        nav: r.nav,
        source: r.source,
        source_url: r.url,
      }));
    if (rows.length)
      await q(
        'insert into live_etf_shares(ticker,as_of,shares,nav,source,source_url) select ticker,as_of,shares,nav,source,source_url from jsonb_to_recordset($1::jsonb) as x(ticker text,as_of date,shares numeric,nav numeric,source text,source_url text) on conflict(ticker,as_of) do update set shares=excluded.shares,nav=excluded.nav,source=excluded.source,source_url=excluded.source_url,fetched_at=now()',
        [JSON.stringify(rows)],
      );
    for (const r of results)
      await check(q, 'etf:' + r.f.ticker, !r.error, r.rows.length, r.error ?? 'Issuer file read.');
  });
  return { ok: results.filter((r) => !r.error).length, failed: results.filter((r) => r.error).map((r) => r.f.ticker) };
}
export async function loadEtfRows(q: Q): Promise<ShareRow[]> {
  const rows = await q(
    "select ticker,as_of,shares,nav,source,source_url from live_etf_shares where as_of>=current_date-interval '60 days' order by ticker,as_of",
  );
  return rows.map((r) => ({
    ticker: String(r.ticker),
    asOf: (r.as_of instanceof Date ? r.as_of.toISOString() : String(r.as_of)).slice(0, 10),
    shares: Number(r.shares),
    nav: Number(r.nav),
    source: String(r.source),
    url: String(r.source_url),
  }));
}

// ---------- computation ----------
export type Flow = { date: string; prev: string; flow: number; exposure: number; shares: number; nav: number };
export type FundView = Fund & {
  latest: Flow | null;
  week: { flow: number; exposure: number; sessions: number } | null;
  aum: number | null;
  shares: number | null;
  nav: number | null;
  asOf: string | null;
  source: string;
  url: string;
  history: Flow[];
};
export type Side = { flow: number; exposure: number; funds: string[] };
export type GroupView = {
  key: GroupKey;
  label: string;
  period: 'latest' | 'week';
  bull: Side;
  bear: Side;
  /** Σ flow × leverage: positive is a shift toward long exposure. */
  net: number;
  gross: number;
  complete: boolean;
};
export type IndexMove = { symbol: string; label: string; day: number | null; week: number | null };
export type Vol = {
  vixNow: number;
  vixPrev: number | null;
  vixAt: string;
  rvNow: number | null;
  rvPrev: number | null;
  premiumNow: number | null;
  premiumPrev: number | null;
};
export type EtfBook = {
  latest: string;
  weekFrom: string;
  sessions: string[];
  funds: FundView[];
  groups: { latest: GroupView[]; week: GroupView[] };
  daily: { date: string; semis: number; ndx: number; spx: number }[];
  vol: Vol | null;
  indices: IndexMove[];
  partial: string[];
};

/** Annualised realized volatility in percent from the last `n` daily log returns of a close series. */
export function realizedVol(closes: number[], n = 21): number | null {
  if (closes.length < n + 1) return null;
  const s = closes.slice(-(n + 1));
  const r = s.slice(1).map((v, i) => Math.log(v / s[i]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}
/** The last session whose close is final: today's bar is dropped while the US cash session is still open. */
export function completedCloses(s: DailySeries, now = new Date()): { date: string; close: number }[] {
  const today = businessDate(now);
  const close = Date.parse(today + 'T16:00:00' + etOffset(new Date(today + 'T16:00:00Z')));
  return s.closes.filter((c) => c.date < today || (c.date === today && now.getTime() >= close));
}

export function computeEtf(
  rows: ShareRow[],
  ctx: { vix?: DailySeries | null; spx?: DailySeries | null; index?: Record<string, DailySeries | null> } = {},
  now = new Date(),
): EtfBook | null {
  const byTicker = new Map<string, ShareRow[]>();
  for (const r of rows) byTicker.set(r.ticker, [...(byTicker.get(r.ticker) ?? []), r]);
  byTicker.forEach((v) => v.sort((a, b) => a.asOf.localeCompare(b.asOf)));
  // Session calendar from the issuer that publishes every session (ProShares), falling back to all dates.
  const daily = [
    ...new Set(rows.filter((r) => FUNDS.find((f) => f.ticker === r.ticker)?.issuer === 'ProShares').map((r) => r.asOf)),
  ].sort();
  const sessions = daily.length >= 2 ? daily : [...new Set(rows.map((r) => r.asOf))].sort();
  if (sessions.length < 2) return null;
  const idx = new Map(sessions.map((d, i) => [d, i]));
  const latest = sessions.at(-1)!;
  const window = sessions.slice(-WEEK);
  const winStart = idx.get(window[0])!;
  const funds: FundView[] = FUNDS.map((f) => {
    const s = byTicker.get(f.ticker) ?? [];
    const history: Flow[] = s.slice(1).map((r, i) => {
      const flow = (r.shares - s[i].shares) * r.nav;
      return {
        date: r.asOf,
        prev: s[i].asOf,
        flow,
        exposure: flow * f.leverage,
        shares: r.shares - s[i].shares,
        nav: r.nav,
      };
    });
    // A flow belongs to a single session only when the previous row is the session immediately before it.
    const contiguous = (x: Flow) => idx.has(x.date) && idx.has(x.prev) && idx.get(x.date)! - idx.get(x.prev)! === 1;
    const lf = history.find((x) => x.date === latest && contiguous(x)) ?? null;
    const inWeek = history.filter(
      (x) => idx.has(x.date) && idx.get(x.date)! >= winStart && idx.has(x.prev) && idx.get(x.prev)! >= winStart - 1,
    );
    const sessionsCovered = inWeek.reduce((a, x) => a + (idx.get(x.date)! - idx.get(x.prev)!), 0);
    const last = s.at(-1);
    return {
      ...f,
      latest: lf,
      week: inWeek.length
        ? {
            flow: inWeek.reduce((a, x) => a + x.flow, 0),
            exposure: inWeek.reduce((a, x) => a + x.exposure, 0),
            sessions: sessionsCovered,
          }
        : null,
      aum: last ? last.shares * last.nav : null,
      shares: last?.shares ?? null,
      nav: last?.nav ?? null,
      asOf: last?.asOf ?? null,
      source:
        last?.source ??
        (f.issuer === 'ProShares' ? 'ProShares daily NAV and shares outstanding' : 'Direxion daily holdings file'),
      url: last?.url ?? fundUrl(f),
      history: history.filter(contiguous).slice(-10),
    };
  });
  const group = (key: GroupKey, period: 'latest' | 'week'): GroupView => {
    const mine = funds.filter((f) => f.group === key);
    const val = (f: FundView) => (period === 'latest' ? f.latest : f.week);
    const side = (bull: boolean): Side => {
      const list = mine.filter((f) => f.leverage > 0 === bull && val(f));
      return {
        flow: list.reduce((a, f) => a + val(f)!.flow, 0),
        exposure: list.reduce((a, f) => a + val(f)!.exposure, 0),
        // Only funds that actually moved are named in the commentary.
        funds: list.filter((f) => Math.abs(val(f)!.flow) >= 0.5e6).map((f) => f.ticker),
      };
    };
    const bull = side(true),
      bear = side(false);
    const complete = mine.every((f) => {
      const v = val(f);
      return v && (period === 'latest' || (v as { sessions: number }).sessions >= WEEK);
    });
    return {
      key,
      label: GROUPS[key].label,
      period,
      bull,
      bear,
      net: bull.exposure + bear.exposure,
      gross: mine.reduce((a, f) => a + Math.abs(val(f)?.exposure ?? 0), 0),
      complete,
    };
  };
  const keys: GroupKey[] = ['semis', 'ndx', 'spx'];
  const dailyRows = sessions.slice(-10).map((d) => {
    const net = (k: GroupKey) =>
      funds.filter((f) => f.group === k).reduce((a, f) => a + (f.history.find((x) => x.date === d)?.exposure ?? 0), 0);
    return { date: d, semis: net('semis'), ndx: net('ndx'), spx: net('spx') };
  });
  let vol: Vol | null = null;
  if (ctx.vix?.closes.length) {
    const v = ctx.vix.closes;
    const done = ctx.spx ? completedCloses(ctx.spx, now).map((c) => c.close) : [];
    const vixDone = completedCloses(ctx.vix, now);
    const vixNow = v.at(-1)!.close;
    const vixPrev = (v.at(-1)!.date === vixDone.at(-1)?.date ? vixDone.at(-2) : vixDone.at(-1))?.close ?? null;
    const rvNow = realizedVol(done),
      rvPrev = realizedVol(done.slice(0, -1));
    vol = {
      vixNow,
      vixPrev,
      vixAt: ctx.vix.at,
      rvNow,
      rvPrev,
      premiumNow: rvNow == null ? null : vixNow - rvNow,
      premiumPrev: rvPrev == null || vixPrev == null ? null : vixPrev - rvPrev,
    };
  }
  const indices: IndexMove[] = keys.map((k) => {
    const s = ctx.index?.[GROUPS[k].index];
    const at = (d: string) => s?.closes.find((c) => c.date === d)?.close;
    const before = (d: string) => s?.closes.filter((c) => c.date < d).at(-1)?.close;
    const cur = at(latest),
      prev = before(latest),
      start = before(window[0]);
    return {
      symbol: GROUPS[k].index,
      label: GROUPS[k].indexLabel,
      day: cur && prev ? (cur / prev - 1) * 100 : null,
      week: cur && start ? (cur / start - 1) * 100 : null,
    };
  });
  return {
    latest,
    weekFrom: window[0],
    sessions,
    funds,
    groups: { latest: keys.map((k) => group(k, 'latest')), week: keys.map((k) => group(k, 'week')) },
    daily: dailyRows,
    vol,
    indices,
    partial: funds.filter((f) => !f.latest).map((f) => f.ticker),
  };
}

// ---------- formatting and commentary ----------
export function money(v: number, signed = true): string {
  const a = Math.abs(v),
    s = signed ? (a < 0.5e6 ? '' : v > 0 ? '+' : '−') : '';
  if (a >= 999.5e6) return s + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 999.5e3) return s + '$' + Math.round(a / 1e6) + 'M';
  if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'K';
  return '$0';
}
export const pct = (v: number, d = 2) => {
  const r = Number(v.toFixed(d));
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(d) + '%';
};
export const weekday = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
export const dayName = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const short = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export type FlowLine = { ticker: string; flow: number; exposure: number; effect: 'long' | 'short'; text: string };
export type GroupLines = {
  key: GroupKey;
  label: string;
  lines: FlowLine[];
  combined: { net: number; text: string } | null;
};
/** The CR/RD block, one line per fund with a flow, in the desk's own wording. Effect is the move in net exposure. */
export function flowLines(book: EtfBook, period: 'latest' | 'week'): GroupLines[] {
  return book.groups[period].map((g) => {
    const noun = GROUPS[g.key].noun;
    const lines: FlowLine[] = book.funds
      .filter((f) => f.group === g.key)
      .flatMap((f) => {
        const v = period === 'latest' ? f.latest : f.week;
        if (!v || Math.abs(v.flow) < 0.5e6) return [];
        const bull = f.leverage > 0,
          x = Math.abs(v.exposure),
          created = v.flow > 0;
        const text =
          f.ticker +
          ': ' +
          money(v.flow) +
          ' → ' +
          (bull
            ? created
              ? 'approximately ' + money(x, false) + ' of new ' + noun + '-long target exposure'
              : 'removed approximately ' + money(x, false) + ' of ' + noun + '-long exposure'
            : created
              ? 'approximately ' + money(x, false) + ' of new ' + noun + '-short target exposure'
              : 'removed approximately ' + money(x, false) + ' of ' + noun + ' shorts') +
          (period === 'week' && f.week && f.week.sessions < WEEK
            ? ' (' + f.week.sessions + ' of ' + WEEK + ' sessions reported)'
            : '') +
          '.';
        return [
          { ticker: f.ticker, flow: v.flow, exposure: v.exposure, effect: v.exposure >= 0 ? 'long' : 'short', text },
        ];
      });
    const combined =
      lines.length > 1
        ? {
            net: g.net,
            text:
              'Combined ' +
              noun +
              ' shift: approximately ' +
              money(Math.abs(g.net), false) +
              ' toward ' +
              (g.net >= 0 ? 'long' : 'short') +
              ' exposure' +
              (g.bull.flow > 0 && g.bear.flow > 0 ? ', on ' + money(g.gross, false) + ' of new gross exposure' : '') +
              '.',
          }
        : null;
    return { key: g.key, label: g.label, lines, combined };
  });
}

function describe(g: GroupView): string | null {
  const noun = GROUPS[g.key].noun,
    bulls = g.bull.funds.join(' and '),
    bears = g.bear.funds.join(' and ');
  const b = g.bull.flow,
    s = g.bear.flow,
    small = 0.5e6;
  if (Math.abs(b) < small && Math.abs(s) < small) return null;
  const tilt = g.net >= 0 ? 'long' : 'short';
  if (b >= small && s <= -small)
    return (
      'investors added to ' +
      bulls +
      ' while redeeming ' +
      bears +
      ', a ' +
      money(Math.abs(g.net), false) +
      ' shift toward long ' +
      noun +
      ' exposure'
    );
  if (b <= -small && s >= small)
    return (
      'investors redeemed ' +
      bulls +
      ' and created ' +
      bears +
      ', a ' +
      money(Math.abs(g.net), false) +
      ' shift toward short ' +
      noun +
      ' exposure'
    );
  if (b >= small && s >= small)
    return (
      'investors created both ' +
      bulls +
      ' and ' +
      bears +
      ', adding ' +
      money(g.gross, false) +
      ' of gross ' +
      noun +
      ' exposure with a ' +
      money(Math.abs(g.net), false) +
      ' net-' +
      tilt +
      ' tilt'
    );
  if (b <= -small && s <= -small)
    return (
      'both sides were redeemed (' +
      bulls +
      ' and ' +
      bears +
      '), cutting gross ' +
      noun +
      ' exposure by ' +
      money(g.gross, false) +
      ' with a ' +
      money(Math.abs(g.net), false) +
      ' net-' +
      tilt +
      ' tilt'
    );
  const lone = Math.abs(b) >= small ? { funds: bulls, flow: b } : { funds: bears, flow: s };
  return (
    (lone.flow > 0 ? 'creations in ' : 'redemptions in ') +
    lone.funds +
    ' moved net ' +
    noun +
    ' exposure ' +
    money(Math.abs(g.net), false) +
    ' toward ' +
    tilt
  );
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Below this net and gross size a group's flow is noise and is not narrated. */
export const MATERIAL = 25e6;
const material = (g: GroupView) => Math.abs(g.net) >= MATERIAL || g.gross >= MATERIAL;
const size = (g: GroupView) => Math.max(Math.abs(g.net), g.gross);
/** How the flow sat against the underlying index over the same window. */
function character(net: number, move: number | null | undefined): string | null {
  if (move == null || Math.abs(move) < 0.25) return null;
  if (net > 0 && move < 0) return 'dip-buying, not capitulation';
  if (net < 0 && move < 0) return 'de-risking alongside the decline';
  if (net > 0 && move > 0) return 'chasing the strength';
  return 'fading the rally';
}
const moveOf = (book: EtfBook, k: GroupKey, p: 'day' | 'week') =>
  book.indices.find((i) => i.symbol === GROUPS[k].index)?.[p];
function sentence(book: EtfBook, g: GroupView, lead: string): string | null {
  const d = describe(g);
  if (!d) return null;
  const move = moveOf(book, g.key, g.period === 'latest' ? 'day' : 'week');
  const ctx =
    move != null
      ? ', as the ' +
        GROUPS[g.key].indexLabel +
        (move >= 0 ? ' rose ' : ' fell ') +
        pct(Math.abs(move)).replace('+', '')
      : '';
  const ch = character(g.net, move);
  return lead + ctx + ', ' + d + (ch ? '; ' + ch : '') + '.';
}

export type Commentary = {
  /** One-line takeaway a salesperson can read in seconds. */
  headline: string;
  bottomLine: string;
  volatility: string | null;
  interpretation: string[];
};

/** The takeaway for the lead group, in desk language, without figures. */
function thesis(book: EtfBook, g: GroupView): string {
  const noun = GROUPS[g.key].noun;
  if (g.bull.flow > 0 && g.bear.flow > 0) return 'Both sides are building ' + noun + ' leverage';
  if (g.bull.flow < 0 && g.bear.flow < 0) return 'Leverage is coming off on both sides of ' + noun;
  const move = moveOf(book, g.key, 'week');
  if (move != null && Math.abs(move) >= 0.25) {
    if (g.net > 0 && move < 0) return 'The selloff did not clear bullish leverage';
    if (g.net > 0) return 'Investors are chasing the rally with leverage';
    if (move < 0) return 'Leverage is being cut into the decline';
    return 'Investors are fading the rally with leverage';
  }
  return g.net >= 0 ? 'Leveraged positioning tilted long' : 'Leveraged positioning tilted short';
}

/** Code-written commentary: every figure comes straight from the computed book. Largest material groups lead. */
export function templateCommentary(book: EtfBook): Commentary {
  const span = short(book.weekFrom) + '–' + short(book.latest);
  const week = book.groups.week.filter(material).sort((a, b) => size(b) - size(a));
  const latest = book.groups.latest.filter(material).sort((a, b) => size(b) - size(a));
  const lead = week[0];
  const leadDay = lead && book.groups.latest.find((g) => g.key === lead.key);
  const day = cap(dayName(book.latest));
  let headline: string, bottomLine: string;
  if (lead) {
    const tilt = (n: number) => (n >= 0 ? 'long' : 'short');
    headline =
      thesis(book, lead) +
      ': ' +
      lead.label +
      ' ' +
      money(Math.abs(lead.net), false) +
      ' toward ' +
      tilt(lead.net) +
      ' over ' +
      WEEK +
      ' sessions' +
      (leadDay && material(leadDay)
        ? Math.sign(leadDay.net) === Math.sign(lead.net)
          ? ', ' + day + ' added ' + money(Math.abs(leadDay.net), false) + ' more.'
          : ', but ' + day + ' reversed ' + money(Math.abs(leadDay.net), false) + ' toward ' + tilt(leadDay.net) + '.'
        : '.');
    const parts = [sentence(book, lead, 'Over the past ' + WEEK + ' sessions (' + span + ')')!];
    const top = latest[0];
    if (top && top.key === lead.key)
      parts.push(
        day +
          (Math.sign(top.net) === Math.sign(lead.net)
            ? ' extended that tilt with another '
            : ' cut against it, with ') +
          money(Math.abs(top.net), false) +
          ' toward ' +
          tilt(top.net) +
          '.',
      );
    else if (top) parts.push(day + "'s largest move was in " + top.label + ': ' + describe(top) + '.');
    bottomLine = parts.join(' ');
  } else {
    headline =
      'Quiet leveraged flows: no group moved more than ' + money(MATERIAL, false) + ' over ' + WEEK + ' sessions.';
    bottomLine =
      'Disclosed creations and redemptions were light across the tracked leveraged funds (' +
      span +
      '), so positioning was little changed.';
  }
  let volatility: string | null = null;
  const v = book.vol;
  if (v) {
    volatility =
      'VIX is ~' +
      v.vixNow.toFixed(2) +
      (v.vixPrev != null ? ' versus the prior close of ' + v.vixPrev.toFixed(2) : '') +
      (v.rvNow != null ? ' and ' + v.rvNow.toFixed(1) + '% 21-day realized on the S&P 500' : '') +
      '.';
    if (v.premiumNow != null && v.premiumPrev != null) {
      const moved = v.premiumNow - v.premiumPrev;
      volatility +=
        ' The implied-versus-realized premium has ' +
        (Math.abs(moved) < 0.1
          ? 'held near ' + v.premiumNow.toFixed(1) + ' points'
          : (Math.abs(v.premiumNow) < Math.abs(v.premiumPrev) ? 'narrowed' : 'widened') +
            ' from ' +
            v.premiumPrev.toFixed(1) +
            ' to ' +
            v.premiumNow.toFixed(1) +
            ' points') +
        '.';
    }
  }
  const interpretation: string[] = [];
  for (const g of week.slice(1)) {
    const s = sentence(book, g, 'In the ' + g.label + ' funds');
    if (s) interpretation.push(s);
  }
  for (const g of book.groups.week)
    if (g.bull.flow > 0 && g.bear.flow > 0 && g.gross >= MATERIAL)
      interpretation.push(
        'Both ' +
          GROUPS[g.key].noun +
          ' sides created into the move, adding ' +
          money(g.gross, false) +
          ' of gross exposure: investors increased the size of the hedge problem rather than reducing it, with ' +
          (g.net >= 0 ? g.bull.funds.join(', ') : g.bear.funds.join(', ')) +
          ' setting the net-' +
          (g.net >= 0 ? 'long' : 'short') +
          ' tilt.',
      );
  // Other groups that moved in the latest session (one already named in the bottom line is skipped).
  const named = lead && latest[0] && latest[0].key !== lead.key ? latest[0] : null;
  for (const g of latest.filter((g) => g.key !== lead?.key && g !== named)) {
    const d = describe(g);
    if (d) interpretation.push('Also on ' + day + ', in ' + g.label + ', ' + d + '.');
  }
  const quiet = book.groups.week.filter((g) => !material(g)).map((g) => g.label);
  if (quiet.length && quiet.length < 3)
    interpretation.push(
      quiet.join(' and ') +
        ' flow was light over the window (under ' +
        money(MATERIAL, false) +
        ' of target exposure).',
    );
  if (book.partial.length)
    interpretation.push(
      book.partial.join(', ') +
        ' had no issuer figure for the latest session yet, so ' +
        (book.partial.length > 1 ? 'they are' : 'it is') +
        ' left out of the totals above.',
    );
  return { headline, bottomLine, volatility, interpretation };
}

/** The note as plain text, in the desk's chat format, ready to paste into Bloomberg IB or a message. */
export function plainNote(book: EtfBook, note: Commentary, latest: GroupLines[], week: GroupLines[]): string {
  const block = (title: string, groups: GroupLines[]) => {
    const lines = groups.flatMap((g) => [
      ...g.lines.map((l) => '- ' + l.text),
      ...(g.combined ? ['- ' + g.combined.text] : []),
    ]);
    return lines.length ? title + ':\n' + lines.join('\n') : '';
  };
  return [
    'Leveraged ETF color – ' + weekday(book.latest),
    note.headline,
    'Bottom line: ' + note.bottomLine,
    note.volatility ?? '',
    block(dayName(book.latest) + ' CR/RD', latest),
    block('Past ' + WEEK + ' sessions CR/RD (' + short(book.weekFrom) + '–' + short(book.latest) + ')', week),
    ...note.interpretation,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Facts for the model: it writes prose around these tokens and never types a number itself. */
export function etfFacts(book: EtfBook, materialOnly = false): FactBook {
  const fb = new FactBook(),
    at = book.latest + 'T21:00:00.000Z';
  const add = (key: string, label: string, display: string, hint?: string) =>
    fb.add({
      key,
      label,
      value: null,
      display,
      unit: 'text',
      source: 'Issuer files and Yahoo Finance',
      asOf: at,
      hint,
    });
  const keep = (g: GroupView) => !materialOnly || material(g);
  const groupOf = (k: GroupKey, p: 'latest' | 'week') => book.groups[p].find((g) => g.key === k)!;
  add('date.latest', 'latest session', weekday(book.latest));
  add('date.week_from', 'first session of the five-session window', short(book.weekFrom));
  add('name.ndx', 'Nasdaq-100 name', 'Nasdaq-100');
  add('name.spx', 'S&P 500 name', 'S&P 500');
  add('name.rv', 'realized volatility window', '21-day');
  add('name.sessions', 'number of sessions in the window', 'five');
  for (const f of book.funds) {
    if (f.latest && Math.abs(f.latest.flow) >= 0.5e6 && keep(groupOf(f.group, 'latest'))) {
      add(
        'f.' + f.ticker + '.d',
        f.ticker + ' latest-session flow (signed USD)',
        money(f.latest.flow),
        f.latest.flow > 0 ? 'creation' : 'redemption',
      );
      add(
        'f.' + f.ticker + '.dx',
        f.ticker + ' latest-session target exposure (absolute USD)',
        money(Math.abs(f.latest.exposure), false),
      );
    }
    if (f.week && Math.abs(f.week.flow) >= 0.5e6 && keep(groupOf(f.group, 'week'))) {
      add(
        'f.' + f.ticker + '.w',
        f.ticker + ' five-session flow (signed USD)',
        money(f.week.flow),
        f.week.flow > 0 ? 'net creation' : 'net redemption',
      );
      add(
        'f.' + f.ticker + '.wx',
        f.ticker + ' five-session target exposure (absolute USD)',
        money(Math.abs(f.week.exposure), false),
      );
    }
  }
  for (const p of ['latest', 'week'] as const)
    for (const g of book.groups[p].filter(keep)) {
      const k = 'g.' + g.key + '.' + (p === 'latest' ? 'd' : 'w');
      add(
        k + '.net',
        g.label + ' ' + p + ' net exposure shift (absolute USD)',
        money(Math.abs(g.net), false),
        g.net >= 0 ? 'toward long' : 'toward short',
      );
      add(k + '.gross', g.label + ' ' + p + ' gross exposure change (absolute USD)', money(g.gross, false));
    }
  for (const i of book.indices) {
    const k = i.symbol.replace('^', '').toLowerCase();
    if (i.day != null) {
      add('idx.' + k + '.d', i.label + ' latest-session move (signed)', pct(i.day), i.day >= 0 ? 'rose' : 'fell');
      add(
        'idx.' + k + '.d_abs',
        i.label + ' latest-session move (size only, pair with rose/fell)',
        pct(Math.abs(i.day)).replace('+', ''),
        i.day >= 0 ? 'rose' : 'fell',
      );
    }
    if (i.week != null) {
      add('idx.' + k + '.w', i.label + ' five-session move (signed)', pct(i.week), i.week >= 0 ? 'rose' : 'fell');
      add(
        'idx.' + k + '.w_abs',
        i.label + ' five-session move (size only, pair with rose/fell)',
        pct(Math.abs(i.week)).replace('+', ''),
        i.week >= 0 ? 'rose' : 'fell',
      );
    }
  }
  const v = materialOnly ? null : book.vol;
  if (v) {
    add('vix.now', 'VIX now', v.vixNow.toFixed(2));
    if (v.vixPrev != null) add('vix.prev', 'VIX prior close', v.vixPrev.toFixed(2));
    if (v.rvNow != null) add('rv.now', 'S&P 500 realized volatility', v.rvNow.toFixed(1) + '%');
    if (v.premiumNow != null) add('prem.now', 'implied minus realized now (points)', v.premiumNow.toFixed(1));
    if (v.premiumPrev != null)
      add('prem.prev', 'implied minus realized at prior close (points)', v.premiumPrev.toFixed(1));
    if (v.premiumNow != null && v.premiumPrev != null)
      add(
        'prem.dir',
        'premium change since prior close (word)',
        Math.abs(v.premiumNow - v.premiumPrev) < 0.1
          ? 'held steady'
          : Math.abs(v.premiumNow) < Math.abs(v.premiumPrev)
            ? 'narrowed'
            : 'widened',
      );
  }
  return fb;
}

/** Code-derived reading of each material group, so the model narrates facts rather than inferring them. */
export function etfStories(book: EtfBook) {
  return (['week', 'latest'] as const).flatMap((p) =>
    book.groups[p]
      .filter(material)
      .sort((a, b) => size(b) - size(a))
      .map((g) => {
        const k = 'g.' + g.key + '.' + (p === 'latest' ? 'd' : 'w');
        const idx = GROUPS[g.key].index.replace('^', '').toLowerCase();
        const move = moveOf(book, g.key, p === 'latest' ? 'day' : 'week');
        const sfx = p === 'latest' ? '.d' : '.w';
        const v = (f: FundView) => (p === 'latest' ? f.latest : f.week);
        const fundsBy = (pred: (f: FundView) => boolean) =>
          book.funds
            .filter((f) => f.group === g.key && pred(f))
            .map((f) => ({
              ticker: f.ticker,
              side: f.leverage > 0 ? 'long fund' : 'inverse fund',
              flow_token: '{{f.' + f.ticker + sfx + '}}',
              exposure_token: '{{f.' + f.ticker + sfx + 'x}}',
            }));
        return {
          period:
            p === 'latest'
              ? 'latest session ({{date.latest}})'
              : 'five sessions ({{date.week_from}} to {{date.latest}})',
          group: g.label,
          net_shift_token: '{{' + k + '.net}}',
          net_direction: g.net >= 0 ? 'toward long' : 'toward short',
          gross_token: '{{' + k + '.gross}}',
          created: fundsBy((f) => (v(f)?.flow ?? 0) >= 0.5e6),
          redeemed: fundsBy((f) => (v(f)?.flow ?? 0) <= -0.5e6),
          index_move_token: move == null ? null : '{{idx.' + idx + (p === 'latest' ? '.d_abs' : '.w_abs') + '}}',
          index_direction: move == null ? null : move >= 0 ? 'rose' : 'fell',
          reading: character(g.net, move),
        };
      }),
  );
}

const SYSTEM =
  'You are the leveraged-ETF flow strategist on an institutional equity desk writing the daily "Leveraged ETF color" note that salespeople forward to traders, in the voice of a Bloomberg IB chat from a desk strategist: terse, specific, interpretive, figures in every sentence. ' +
  'Structure. headline (one line, under twenty-five words): the takeaway first in plain desk language (for example "The selloff did not clear bullish leverage"), then a colon and the lead group with its net shift token and direction over the window, and whether the latest session added to it. ' +
  'bottom_line (at most two sentences, no more than about fifty words): lead with the largest five-session story: which funds were created and which redeemed, the net shift token and its direction, and the index move (for example "as the {{name.ndx}} fell {{idx.ndx.w_abs}}"), then the supplied reading (dip-buying, de-risking, chasing, fading, both sides creating). Then say whether the latest session extended or cut against that tilt, with its net shift token. ' +
  'interpretation (two or three short paragraphs): the other material groups and the fund-level detail that matters (largest single creations or redemptions with their exposure tokens), and what the positioning implies for hedging and rebalancing flows into the close, without predicting prices. ' +
  'Rules. Write the reading as your own desk view; never say "supplied", "facts", "token" or "story". Name the funds (TQQQ, SQQQ) rather than "long funds". Use ONLY the supplied facts and stories. Every number, dollar amount, percentage, level or date must be an exact {{token}}; names with digits must use {{name.*}} tokens; no digits, number words or unit symbols outside tokens. Signed tokens already carry + or -; with a size-only token always say rose or fell. Never state a direction or size without its token. Do not mention groups or funds absent from the stories. No recommendations, no price predictions, no guarantees.';
export async function writeEtfWithModel(book: EtfBook, signal: AbortSignal): Promise<Commentary | null> {
  const facts = etfFacts(book, true);
  const stories = etfStories(book);
  if (!stories.length) return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 60000 });
  const response = await client.responses.create(
    {
      model: process.env.OPENAI_MODEL || 'gpt-6-luna',
      reasoning: { effort: 'medium' },
      store: false,
      max_output_tokens: 3000,
      text: {
        format: {
          type: 'json_schema',
          name: 'etf_color',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              headline: { type: 'string' },
              bottom_line: { type: 'string' },
              interpretation: { type: 'array', items: { type: 'string' } },
            },
            required: ['headline', 'bottom_line', 'interpretation'],
            additionalProperties: false,
          },
        },
      },
      input: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            facts: facts.all().map((x) => ({ token: '{{' + x.key + '}}', label: x.label, direction: x.hint ?? null })),
            stories,
          }),
        },
      ],
    },
    { signal },
  );
  let p: { headline: string; bottom_line: string; interpretation: string[] };
  try {
    p = JSON.parse(response.output_text);
  } catch {
    return null;
  }
  const keys = new Set(facts.keys());
  const tokens = (x: string) => (x.match(/\{\{[A-Za-z0-9_.:-]+\}\}/g) ?? []).length;
  const clean = (t: string, min = 1) => {
    const x = facts.tokenize(t.trim());
    return x && tokens(x) >= min && validateText(x, { allowedKeys: keys, maxLength: 1400 }).ok ? facts.render(x) : null;
  };
  // Quality gate: a bottom line without real figures is not a desk note; the code-written one is used instead.
  const bottomLine = clean(p.bottom_line, 3);
  if (!bottomLine) return null;
  const interpretation = p.interpretation
    .map((t) => clean(t))
    .filter((x): x is string => !!x)
    .slice(0, 4);
  // The headline must carry at least one figure; otherwise the code-written one is used.
  const headline = clean(p.headline, 1) ?? templateCommentary(book).headline;
  return { headline, bottomLine, volatility: null, interpretation };
}

// ---------- assembly ----------
export type EtfNote = Commentary & { method: 'model' | 'template'; fingerprint: string; generatedAt: string };
export const fingerprintOf = (b: EtfBook) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        'v2', // bump when the note format changes, so older stored notes are not reused
        b.latest,
        b.funds.map((f) => [f.ticker, f.latest?.flow ?? null, f.week?.flow ?? null]),
        b.indices.map((i) => [i.day?.toFixed(2) ?? null, i.week?.toFixed(2) ?? null]),
      ]),
    )
    .digest('hex')
    .slice(0, 24);

export async function marketContext() {
  const [vix, spx, sox, ndx] = await Promise.all([
    getCloses('^VIX'),
    getCloses('^GSPC'),
    getCloses('^SOX'),
    getCloses('^NDX'),
  ]);
  return { vix, spx, index: { '^SOX': sox, '^NDX': ndx, '^GSPC': spx } };
}
export async function getEtfBook(db: Db, now = new Date()): Promise<EtfBook | null> {
  const [rows, ctx] = await Promise.all([db.asService((q) => loadEtfRows(q)), marketContext()]);
  return computeEtf(rows, ctx, now);
}
async function latestNote(q: Q): Promise<EtfNote | null> {
  const [r] = await q('select payload from live_etf_notes order by created_at desc limit 1');
  return r ? (r.payload as EtfNote) : null;
}

/** Same shared daily budget as the rest of the brief (live_model_budget, NEWS_DAILY_CALL_LIMIT). */
async function reserveModelCall(db: Db, date: string): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY) return false;
  const raw = Number(process.env.NEWS_DAILY_CALL_LIMIT || 48);
  const limit = Math.max(1, Math.min(96, Number.isFinite(raw) ? raw : 48));
  const rows = await db.asService((q) =>
    q(
      'insert into live_model_budget(day,calls) values($1,1) on conflict(day) do update set calls=live_model_budget.calls+1 where live_model_budget.calls<$2 returning calls',
      [date, limit],
    ),
  );
  return rows.length > 0;
}
const inflight = globalThis as unknown as { __mbEtf?: Promise<EtfNote | null> | null };
/**
 * Refreshes issuer data when it is older than `maxAgeMs`, then writes a model note when the figures changed
 * (budgeted per attempt). Called by the refresh cycle; safe to call concurrently.
 */
export async function prepareEtf(db: Db, opts: { maxAgeMs?: number; modelMs?: number; now?: Date } = {}) {
  if (inflight.__mbEtf) return inflight.__mbEtf;
  const run = (async () => {
    const now = opts.now ?? new Date();
    const [fresh] = await db.asService((q) => q('select max(fetched_at) at from live_etf_shares'));
    const age = fresh?.at ? now.getTime() - new Date(String(fresh.at)).getTime() : Infinity;
    if (age > (opts.maxAgeMs ?? 30 * 60000)) await collectEtfData(db);
    const book = await getEtfBook(db, now);
    if (!book) return null;
    const fp = fingerprintOf(book);
    const last = await db.asService(latestNote);
    // Same figures: keep the model note, and after a failed attempt wait two hours before spending budget again.
    if (
      last?.fingerprint === fp &&
      (last.method === 'model' || now.getTime() - Date.parse(last.generatedAt) < 2 * 3600000)
    )
      return last;
    let c: Commentary | null = null;
    const until = Date.now() + (opts.modelMs ?? 0);
    // Up to two attempts, each counted against the shared daily budget. A draft that fails the number guard or the
    // quality gate is discarded, never shown.
    for (let i = 0; i < 2 && !c && until - Date.now() > 15000 && (await reserveModelCall(db, businessDate(now))); i++)
      c = await writeEtfWithModel(book, AbortSignal.timeout(until - Date.now())).catch(() => null);
    const note: EtfNote = {
      ...(c ?? templateCommentary(book)),
      method: c ? 'model' : 'template',
      fingerprint: fp,
      generatedAt: now.toISOString(),
    };
    await db.asService(async (q) => {
      await q("delete from live_etf_notes where created_at < now() - interval '30 days'");
      await q('insert into live_etf_notes(business_date,fingerprint,payload) values($1,$2,$3::jsonb)', [
        book.latest,
        fp,
        JSON.stringify(note),
      ]);
    });
    return note;
  })();
  inflight.__mbEtf = run;
  try {
    return await run;
  } finally {
    inflight.__mbEtf = null;
  }
}

/** What the page shows: live figures, plus the stored model note only when it was written from these figures. */
export async function getEtfView(db: Db, now = new Date()) {
  let book = await getEtfBook(db, now);
  if (!book) {
    // First run on an empty database: read the issuers once, inline, so the page is never blank.
    await collectEtfData(db, AbortSignal.timeout(25000)).catch(() => undefined);
    book = await getEtfBook(db, now);
  }
  if (!book) return null;
  const fp = fingerprintOf(book);
  const stored = await db.asService(latestNote);
  const t = templateCommentary(book);
  const note: EtfNote =
    stored && stored.fingerprint === fp
      ? { ...stored, headline: stored.headline || t.headline, volatility: t.volatility }
      : { ...t, method: 'template', fingerprint: fp, generatedAt: now.toISOString() };
  return { book, note, latest: flowLines(book, 'latest'), week: flowLines(book, 'week') };
}
