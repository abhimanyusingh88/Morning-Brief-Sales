import type { Db } from '../db/types';
import { fetchSource } from './fetch';
import { focusCoverage, getCoverage, getFocus } from './reports';
import { businessDate } from './time';
import type { Holding } from './types';

/**
 * Week-over-week client moves. Every price is a public Yahoo Finance daily close (the latest session uses the
 * provider's delayed regular-market price). Positions are the recorded quantities, so each client's move is real
 * price action applied to the book as recorded: P&L = direction × quantity × (latest − close five sessions ago).
 */
export const SESSIONS = 5;
export type DailySeries = {
  symbol: string;
  closes: { date: string; close: number }[];
  at: string;
  source: string;
  url: string;
};
export type PositionMove = {
  holdingId: string;
  clientId: string;
  client: string;
  fund: string;
  account: string;
  symbol: string;
  direction: Holding['direction'];
  quantity: number;
  base: number;
  last: number;
  /** The stock's own price change over the window, in percent. */
  pricePct: number;
  /** The position's return in percent: the price change, sign-flipped for a short. */
  positionPct: number;
  /** USD gained or lost on the recorded quantity. */
  pnl: number;
};
export type ClientMove = {
  clientId: string;
  name: string;
  pnl: number;
  exposure: number;
  pct: number;
  /** Cumulative percent move at each session close of the window (first point is zero). */
  path: { date: string; pct: number }[];
  positions: PositionMove[];
  unpriced: string[];
};
export type WeeklyBook = {
  from: string;
  to: string;
  dates: string[];
  clients: ClientMove[];
  positions: PositionMove[];
  up: ClientMove[];
  down: ClientMove[];
  total: { pnl: number; exposure: number; pct: number; path: { date: string; pct: number }[] };
  unpriced: string[];
  asOf: string | null;
  sources: { symbol: string; url: string }[];
  narrative: string[];
};

export function parseDaily(text: string, symbol: string, url: string): DailySeries {
  const r = JSON.parse(text)?.chart?.result?.[0];
  if (!r?.meta || !Array.isArray(r.timestamp)) throw new Error('SOURCE_SCHEMA');
  const close: unknown[] = r.indicators?.quote?.[0]?.close ?? [];
  const byDate = new Map<string, number>();
  r.timestamp.forEach((t: number, i: number) => {
    const v = Number(close[i]);
    if (Number.isFinite(t) && t > 0 && Number.isFinite(v) && v > 0) byDate.set(businessDate(new Date(t * 1000)), v);
  });
  const price = Number(r.meta.regularMarketPrice),
    seconds = Number(r.meta.regularMarketTime);
  let at: string | null = null;
  if (Number.isFinite(price) && price > 0 && Number.isFinite(seconds) && seconds > 1600000000) {
    // The provider's latest regular-session price supersedes that session's bar, which can lag intraday.
    const day = businessDate(new Date(seconds * 1000));
    const latest = [...byDate.keys()].sort().at(-1);
    if (!latest || day >= latest) byDate.set(day, price);
    at = new Date(seconds * 1000).toISOString();
  }
  const closes = [...byDate.entries()]
    .map(([date, c]) => ({ date, close: c }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!closes.length) throw new Error('SOURCE_SCHEMA');
  return {
    symbol,
    closes,
    at: at ?? closes.at(-1)!.date + 'T21:00:00.000Z',
    source: 'Yahoo Finance daily close (delayed)',
    url,
  };
}

const cache = new Map<string, { at: number; value: DailySeries }>();
const TTL = 10 * 60000;
/** One month of daily closes for a listed symbol. Failures are not cached, so the next load retries. */
export async function getDaily(symbol: string): Promise<DailySeries | null> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=1mo&interval=1d';
  try {
    const r = await fetchSource(url, AbortSignal.timeout(8000));
    const value = parseDaily(r.text, symbol, url);
    cache.set(symbol, { at: Date.now(), value });
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    return value;
  } catch {
    return null;
  }
}
/** Fetches a set of symbols a few at a time, so a large book never bursts the provider. */
export async function getDailyMany(symbols: string[], parallel = 10): Promise<Map<string, DailySeries>> {
  const list = [...new Set(symbols)],
    out = new Map<string, DailySeries>();
  for (let i = 0; i < list.length; i += parallel) {
    const got = await Promise.all(list.slice(i, i + parallel).map((s) => getDaily(s)));
    got.forEach((s) => s && out.set(s.symbol, s));
  }
  return out;
}

/** The close on a session, or the most recent one before it (a symbol that did not print that day). */
function closeOn(s: DailySeries, date: string): number | null {
  let v: number | null = null;
  for (const c of s.closes) {
    if (c.date > date) break;
    v = c.close;
  }
  return v;
}
/** Drops the internal daily P&L path from a position. */
function strip(p: PositionMove & { daily: number[] }): PositionMove {
  const {
    holdingId,
    clientId,
    client,
    fund,
    account,
    symbol,
    direction,
    quantity,
    base,
    last,
    pricePct,
    positionPct,
    pnl,
  } = p;
  return {
    holdingId,
    clientId,
    client,
    fund,
    account,
    symbol,
    direction,
    quantity,
    base,
    last,
    pricePct,
    positionPct,
    pnl,
  };
}
export const signed = (direction: Holding['direction']) => (direction === 'Short' ? -1 : 1);

export function fmtPct(v: number, digits = 2): string {
  const r = Number(v.toFixed(digits));
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(digits) + '%';
}
export function fmtUsd(v: number, signedOut = true): string {
  const a = Math.abs(v),
    s = signedOut ? (Math.round(a) === 0 ? '' : v > 0 ? '+' : '−') : v < 0 ? '−' : '';
  if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'K';
  return s + '$' + a.toFixed(0);
}
const shortDay = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Pure: the week's moves for a book, given each symbol's daily closes. */
export function computeWeekly(holdings: Holding[], series: Map<string, DailySeries>): WeeklyBook {
  const allDates = [...new Set([...series.values()].flatMap((s) => s.closes.map((c) => c.date)))].sort();
  const dates = allDates.slice(-(SESSIONS + 1));
  const empty: WeeklyBook = {
    from: dates[0] ?? '',
    to: dates.at(-1) ?? '',
    dates,
    clients: [],
    positions: [],
    up: [],
    down: [],
    total: { pnl: 0, exposure: 0, pct: 0, path: [] },
    unpriced: [...new Set(holdings.map((h) => h.symbol))].sort(),
    asOf: null,
    sources: [],
    narrative: [],
  };
  if (dates.length < 2) return empty;
  const from = dates[0];
  const positions: (PositionMove & { daily: number[] })[] = [];
  const unpriced = new Set<string>();
  for (const h of holdings) {
    const s = series.get(h.symbol),
      qty = Math.abs(Number(h.quantity));
    const base = s ? closeOn(s, from) : null;
    const daily = s ? dates.map((d) => closeOn(s, d)) : [];
    if (!s || base == null || !Number.isFinite(qty) || qty <= 0 || daily.some((v) => v == null)) {
      unpriced.add(h.symbol);
      continue;
    }
    const k = signed(h.direction),
      last = daily.at(-1)!;
    positions.push({
      holdingId: h.id,
      clientId: h.clientId,
      client: h.client,
      fund: h.fund,
      account: h.account,
      symbol: h.symbol,
      direction: h.direction,
      quantity: qty,
      base,
      last,
      pricePct: (last / base - 1) * 100,
      positionPct: k * (last / base - 1) * 100,
      pnl: k * qty * (last - base),
      daily: daily.map((v) => k * qty * (v! - base)),
    });
  }
  const clientIds = [...new Set(holdings.map((h) => h.clientId))];
  const clients: ClientMove[] = clientIds
    .map((id) => {
      const mine = positions.filter((p) => p.clientId === id);
      const name = holdings.find((h) => h.clientId === id)!.client;
      const exposure = mine.reduce((a, p) => a + p.quantity * p.base, 0);
      const pnl = mine.reduce((a, p) => a + p.pnl, 0);
      return {
        clientId: id,
        name,
        pnl,
        exposure,
        pct: exposure ? (pnl / exposure) * 100 : 0,
        path: dates.map((d, i) => ({
          date: d,
          pct: exposure ? (mine.reduce((a, p) => a + p.daily[i], 0) / exposure) * 100 : 0,
        })),
        positions: mine.map(strip).sort((a, b) => b.pnl - a.pnl),
        unpriced: [
          ...new Set(holdings.filter((h) => h.clientId === id && unpriced.has(h.symbol)).map((h) => h.symbol)),
        ].sort(),
      };
    })
    .filter((c) => c.positions.length)
    .sort((a, b) => b.pct - a.pct);
  const exposure = positions.reduce((a, p) => a + p.quantity * p.base, 0);
  const pnl = positions.reduce((a, p) => a + p.pnl, 0);
  const total = {
    pnl,
    exposure,
    pct: exposure ? (pnl / exposure) * 100 : 0,
    path: dates.map((d, i) => ({
      date: d,
      pct: exposure ? (positions.reduce((a, p) => a + p.daily[i], 0) / exposure) * 100 : 0,
    })),
  };
  const up = clients.filter((c) => c.pct > 0).slice(0, 3);
  const down = clients
    .filter((c) => c.pct < 0)
    .reverse()
    .slice(0, 3);
  const used = [...new Set(positions.map((p) => p.symbol))].sort();
  const stamps = used.map((s) => series.get(s)!.at).sort();
  const book: WeeklyBook = {
    from,
    to: dates.at(-1)!,
    dates,
    clients,
    positions: positions.map(strip).sort((a, b) => b.pnl - a.pnl),
    up,
    down,
    total,
    unpriced: [...unpriced].sort(),
    asOf: stamps.at(-1) ?? null,
    sources: used.map((s) => ({ symbol: s, url: series.get(s)!.url })),
    narrative: [],
  };
  book.narrative = narrate(book);
  return book;
}

/** Plain-language summary written by code from the computed figures (no model involved). */
export function narrate(b: WeeklyBook): string[] {
  if (!b.clients.length) return [];
  const span = shortDay(b.from) + ' to ' + shortDay(b.to);
  const ups = b.clients.filter((c) => c.pct > 0).length,
    downs = b.clients.filter((c) => c.pct < 0).length;
  const lines = [
    'From the ' +
      shortDay(b.from) +
      ' close to ' +
      shortDay(b.to) +
      ', the book moved ' +
      fmtPct(b.total.pct) +
      ' (' +
      fmtUsd(b.total.pnl) +
      ' on ' +
      fmtUsd(b.total.exposure, false) +
      ' of gross exposure). ' +
      ups +
      ' of ' +
      b.clients.length +
      ' clients gained and ' +
      downs +
      ' lost over ' +
      span +
      '.',
  ];
  const driver = (c: ClientMove, best: boolean) => {
    const p = best ? c.positions[0] : c.positions.at(-1)!;
    return p.symbol + ' ' + p.direction.toLowerCase() + ' ' + fmtPct(p.positionPct) + ' (' + fmtUsd(p.pnl) + ')';
  };
  const top = b.up[0];
  if (top)
    lines.push(
      top.name + ' led, ' + fmtPct(top.pct) + ' (' + fmtUsd(top.pnl) + '), driven by ' + driver(top, true) + '.',
    );
  const low = b.down[0];
  if (low)
    lines.push(
      low.name +
        ' lagged, ' +
        fmtPct(low.pct) +
        ' (' +
        fmtUsd(low.pnl) +
        '), weighed on by ' +
        driver(low, false) +
        '.',
    );
  const sorted = [...b.positions].sort((x, y) => y.pricePct - x.pricePct);
  const best = sorted[0],
    worst = sorted.at(-1);
  if (best && worst && best.symbol !== worst.symbol)
    lines.push(
      'Across the book, ' +
        best.symbol +
        ' was the strongest stock (' +
        fmtPct(best.pricePct) +
        ') and ' +
        worst.symbol +
        ' the weakest (' +
        fmtPct(worst.pricePct) +
        ').',
    );
  if (b.unpriced.length)
    lines.push('No price was available for ' + b.unpriced.join(', ') + '; those positions are left out of the totals.');
  return lines;
}

/** The week for a salesperson's book as the brief shows it (Brief setup client choice applied). */
export async function getWeekly(db: Db, profileId: string): Promise<{ book: WeeklyBook; clients: number }> {
  const all = await getCoverage(db, profileId);
  const book = focusCoverage(all, await getFocus(db, profileId));
  const series = await getDailyMany(book.holdings.map((h) => h.symbol));
  return { book: computeWeekly(book.holdings, series), clients: all.clients.length };
}
