import { XMLParser } from 'fast-xml-parser';
import { fetchSource } from './fetch';
import { businessDate } from './time';
import type { Metric } from './types';
export type Observation = {
  metric: string;
  value: number;
  previous: number | null;
  unit: string;
  date: string;
  at: string | null;
  source: string;
  url: string;
  cadence: Metric['cadence'];
};
export type SourceResult = { key: string; ok: boolean; accepted: number; detail: string; observations: Observation[] };
export const MARKET_SOURCES = [
  'treasury',
  'vix',
  'SPX',
  'NDX',
  'RUT',
  'DJI',
  'SX5E',
  'GOLD',
  'SILVER',
  'WTI',
  'BRENT',
  'BTC',
] as const;
const TREASURY =
  'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=';
const VIX = 'https://cdn-api.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';
const symbols: Record<string, string> = {
  SPX: '^GSPC',
  NDX: '^NDX',
  RUT: '^RUT',
  DJI: '^DJI',
  GOLD: 'GC=F',
  SILVER: 'SI=F',
  WTI: 'CL=F',
  SX5E: '^STOXX50E',
  BRENT: 'BZ=F',
  BTC: 'BTC-USD',
};
const scalar = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>)['#text'] : x);
export function parseTreasury(text: string, year: string): Observation[] {
  const p = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(text);
  const raw = p.feed?.entry;
  const entries = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const rows = entries
    .map((e: Record<string, unknown>) => {
      const c = e.content as Record<string, unknown> | undefined;
      return c?.['m:properties'] as Record<string, unknown> | undefined;
    })
    .filter((x: Record<string, unknown> | undefined) => !!x)
    .map((x: Record<string, unknown>) => ({
      date: String(scalar(x['d:NEW_DATE']) ?? '').slice(0, 10),
      two: Number(scalar(x['d:BC_2YEAR'])),
      ten: Number(scalar(x['d:BC_10YEAR'])),
    }))
    .filter(
      (x: { date: string; two: number; ten: number }) =>
        /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
        Number.isFinite(x.two) &&
        Number.isFinite(x.ten) &&
        x.two >= 0 &&
        x.ten >= 0,
    )
    .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date));
  const last = rows.at(-1),
    before = rows.at(-2);
  if (!last) throw new Error('SOURCE_SCHEMA');
  return [
    {
      metric: 'UST2Y',
      value: last.two,
      previous: before?.two ?? null,
      unit: 'yield',
      date: last.date,
      at: null,
      source: 'US Treasury',
      url: TREASURY + year,
      cadence: 'daily',
    },
    {
      metric: 'UST10Y',
      value: last.ten,
      previous: before?.ten ?? null,
      unit: 'yield',
      date: last.date,
      at: null,
      source: 'US Treasury',
      url: TREASURY + year,
      cadence: 'daily',
    },
  ];
}
export function parseVix(text: string): Observation[] {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(','))
    .filter((r) => r.length === 5 && /^\d{2}\/\d{2}\/\d{4}$/.test(r[0]) && Number.isFinite(Number(r[4])))
    .map((r) => ({ date: r[0].slice(6) + '-' + r[0].slice(0, 2) + '-' + r[0].slice(3, 5), value: Number(r[4]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = rows.at(-1);
  if (!last || last.value <= 0) throw new Error('SOURCE_SCHEMA');
  return [
    {
      metric: 'VIX',
      value: last.value,
      previous: rows.at(-2)?.value ?? null,
      unit: 'level',
      date: last.date,
      at: null,
      source: 'Cboe daily close',
      url: VIX,
      cadence: 'daily',
    },
  ];
}
export function parseYahoo(text: string, key: string, url: string): Observation[] {
  const quotes: Record<string, unknown>[] = [];
  const symbol = symbols[key];
  if (!symbol) throw new Error('SOURCE_NOT_CONFIGURED');
  const walk = (v: unknown, depth: number) => {
    if (depth > 30) return;
    if (typeof v === 'string' && /^[\s]*[\[{]/.test(v)) {
      try {
        walk(JSON.parse(v), depth + 1);
      } catch {}
      return;
    }
    if (Array.isArray(v)) v.slice(0, 5000).forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.symbol === symbol && o.regularMarketPrice != null && o.regularMarketTime != null) quotes.push(o);
      else
        Object.values(o)
          .slice(0, 5000)
          .forEach((x) => walk(x, depth + 1));
    }
  };
  for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1]);
      walk(typeof parsed === 'string' ? JSON.parse(parsed) : parsed, 0);
    } catch {}
  }
  if (!quotes.length) throw new Error('SOURCE_SCHEMA');
  const records = quotes.map((o) => ({
    value: Number((o.regularMarketPrice as Record<string, unknown>)?.raw ?? o.regularMarketPrice),
    seconds: Number((o.regularMarketTime as Record<string, unknown>)?.raw ?? o.regularMarketTime),
    previous: Number(
      (o.regularMarketPreviousClose as Record<string, unknown>)?.raw ??
        o.regularMarketPreviousClose ??
        o.previousClose ??
        o.chartPreviousClose,
    ),
    complete: o.regularMarketPreviousClose != null,
  }));
  records.sort((a, b) => b.seconds - a.seconds || Number(b.complete) - Number(a.complete));
  const quote = records[0];
  if (records.some((r) => r.seconds === quote.seconds && r.value.toFixed(2) !== quote.value.toFixed(2)))
    throw new Error('SOURCE_CONFLICT');
  if (
    !Number.isFinite(quote.value) ||
    quote.value <= 0 ||
    !Number.isFinite(quote.seconds) ||
    quote.seconds < 1600000000
  )
    throw new Error('SOURCE_SCHEMA');
  const at = new Date(quote.seconds * 1000).toISOString();
  return [
    {
      metric: key,
      value: quote.value,
      previous: Number.isFinite(quote.previous) && quote.previous > 0 ? quote.previous : null,
      unit: ['GOLD', 'SILVER'].includes(key)
        ? 'USD/oz'
        : ['WTI', 'BRENT'].includes(key)
          ? 'USD/barrel'
          : key === 'BTC'
            ? 'USD'
            : 'index',
      date: businessDate(new Date(at)),
      at,
      source: 'Yahoo Finance public quote (delayed)',
      url,
      cadence: 'delayed',
    },
  ];
}
export async function collectMarket(key: string, signal: AbortSignal, now = new Date()): Promise<SourceResult> {
  try {
    let observations: Observation[];
    if (key === 'treasury') {
      const year = businessDate(now).slice(0, 4);
      const r = await fetchSource(TREASURY + year, signal);
      observations = parseTreasury(r.text, year);
    } else if (key === 'vix') {
      const r = await fetchSource(VIX, signal);
      observations = parseVix(r.text);
    } else {
      if (!symbols[key]) throw new Error('SOURCE_NOT_CONFIGURED');
      const url = 'https://finance.yahoo.com/quote/' + encodeURIComponent(symbols[key]) + '/';
      const r = await fetchSource(url, signal, true);
      observations = parseYahoo(r.text, key, r.url);
    }
    observations = observations.filter(
      (o) => o.date <= businessDate(now) && (!o.at || Date.parse(o.at) <= now.getTime()),
    );
    if (!observations.length) throw new Error('SOURCE_FUTURE');
    const today = observations.some((o) => o.date === businessDate(now));
    return {
      key,
      ok: true,
      accepted: observations.length,
      detail: today
        ? 'Source observation belongs to this US session.'
        : 'Source has not published an observation for this US session.',
      observations,
    };
  } catch (e) {
    if (signal.aborted) throw new Error('JOB_TIMEOUT');
    return {
      key,
      ok: false,
      accepted: 0,
      detail: e instanceof Error && /^SOURCE_[A-Z0-9_]+$/.test(e.message) ? e.message : 'SOURCE_UNAVAILABLE',
      observations: [],
    };
  }
}
