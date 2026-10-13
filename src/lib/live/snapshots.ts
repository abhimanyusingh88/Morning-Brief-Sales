import type { Db } from '../db/types';
import { businessDate } from './time';
import {
  calendarFor,
  getCalendar,
  getSeries,
  getSeriesForDay,
  OVERNIGHT,
  type Calendar,
  type Series,
} from './intraday';
// Public market panels are saved as fetched, keyed by business day, so charts and the calendar can be shown for a
// past brief and when a live source is down. Only public symbols are stored, never client names or positions.
export type MarketPanel = { overnight: Series[]; movers: Series[]; calendar: Calendar | null };
async function save(db: Db, date: string, key: string, payload: Series | Calendar, source: string) {
  await db
    .asService((q) =>
      q(
        'insert into live_market_snapshots(business_date,key,payload,source,fetched_at) values($1,$2,$3::jsonb,$4,now()) on conflict(business_date,key) do update set payload=excluded.payload,source=excluded.source,fetched_at=now()',
        [date, key, JSON.stringify(payload), source],
      ),
    )
    .catch(() => console.warn('[snapshots] save_failed'));
}
/** The saved panels for one day; a missing key simply has no snapshot. */
export async function storedPanels(
  db: Db,
  profileId: string,
  date: string,
  keys: string[],
  maxAgeSeconds?: number,
): Promise<Map<string, Series | Calendar>> {
  if (!keys.length) return new Map();
  const rows = await db.asUser(profileId, (q) =>
    q(
      'select key,payload from live_market_snapshots where business_date=$1 and key=any($2::text[]) and ($3::int is null or fetched_at>now()-make_interval(secs=>$3::int))',
      [date, keys, maxAgeSeconds ?? null],
    ),
  );
  return new Map(rows.map((r) => [String(r.key), r.payload as Series | Calendar]));
}
async function fetchAndSave(db: Db, list: string[], date: string, now: Date) {
  const [overnight, movers, calendar] = await Promise.all([
    Promise.all(OVERNIGHT.map((o) => getSeries(o.symbol, o.label, '1d', '5m'))),
    Promise.all(list.map((s) => getSeries(s, s, '1d', '15m'))),
    getCalendar(now, db),
  ]);
  await Promise.all([
    ...overnight.map((s, i) => s && save(db, date, 'overnight:' + OVERNIGHT[i].symbol, s, s.source)),
    ...movers.map((s, i) => s && save(db, date, 'mover:' + list[i], s, s.source)),
    calendar && save(db, date, 'calendar', calendar, calendar.source),
  ]);
  return { overnight, movers, calendar };
}
const FRESH_SECONDS = 180,
  STALE_SECONDS = 600;
const keysFor = (symbols: string[]) => ({
  overnight: OVERNIGHT.map((o) => 'overnight:' + o.symbol),
  movers: symbols.map((s) => 'mover:' + s),
});
/** Today's panels: fetched live and saved; any source that fails falls back to today's last saved copy. */
export async function livePanels(
  db: Db,
  profileId: string,
  symbols: string[],
  now = new Date(),
  later?: (work: () => Promise<unknown>) => void,
): Promise<MarketPanel> {
  const date = businessDate(now),
    list = [...new Set(symbols)].slice(0, 40);
  // Charts are five- and fifteen-minute bars, so a copy saved in the last few minutes is as current as a new fetch.
  // Opening the page then costs one database read instead of a request per chart; Refresh always saves new copies.
  const k = keysFor(list),
    wanted = [...k.overnight, ...k.movers, 'calendar'];
  const from = (m: Map<string, Series | Calendar>) => ({
    overnight: k.overnight.map((x) => m.get(x) as Series),
    movers: k.movers.map((x) => m.get(x) as Series),
    calendar: calendarFor(m.get('calendar') as Calendar, date),
  });
  const read = (seconds: number) =>
    storedPanels(db, profileId, date, wanted, seconds).catch(() => new Map<string, Series | Calendar>());
  const recent = await read(FRESH_SECONDS);
  if (wanted.every((x) => recent.has(x))) return from(recent);
  // A complete copy from the last few bars is shown at once, each chart with its own "last" time, while new copies
  // are fetched and saved after the response. Anything older, or incomplete, is fetched before the page is shown.
  if (later) {
    const usable = await read(STALE_SECONDS);
    if (wanted.every((x) => usable.has(x))) {
      later(() => fetchAndSave(db, list, date, new Date()).catch(() => console.warn('[snapshots] refresh_failed')));
      return from(usable);
    }
  }
  const { overnight, movers, calendar } = await fetchAndSave(db, list, date, now);
  const missing = [
    ...overnight.flatMap((s, i) => (s ? [] : ['overnight:' + OVERNIGHT[i].symbol])),
    ...movers.flatMap((s, i) => (s ? [] : ['mover:' + list[i]])),
    ...(calendar ? [] : ['calendar']),
  ];
  const saved = await storedPanels(db, profileId, date, missing).catch(() => new Map<string, Series | Calendar>());
  return {
    overnight: overnight
      .map((s, i) => s ?? (saved.get('overnight:' + OVERNIGHT[i].symbol) as Series | undefined))
      .filter((s): s is Series => !!s),
    movers: movers
      .map((s, i) => s ?? (saved.get('mover:' + list[i]) as Series | undefined))
      .filter((s): s is Series => !!s),
    calendar: calendarFor(calendar ?? (saved.get('calendar') as Calendar | undefined) ?? null, date),
  };
}
/** A past day's panels exactly as last saved that day. */
export async function pastPanels(db: Db, profileId: string, symbols: string[], date: string): Promise<MarketPanel> {
  const k = keysFor([...new Set(symbols)].slice(0, 40)),
    saved = await storedPanels(db, profileId, date, [...k.overnight, ...k.movers, 'calendar']);
  return {
    overnight: k.overnight.flatMap((x) => (saved.has(x) ? [saved.get(x) as Series] : [])),
    movers: k.movers.flatMap((x) => (saved.has(x) ? [saved.get(x) as Series] : [])),
    calendar: calendarFor((saved.get('calendar') as Calendar | undefined) ?? null, date),
  };
}
/** Pipeline capture: saves today's panels for the whole book even if nobody opens the brief. */
export async function capturePanels(db: Db, now = new Date()) {
  const rows = await db.asService((q) =>
    q<{ symbol: string }>(
      'select distinct h.symbol from live_holdings h join live_accounts a on a.id=h.account_id join live_clients c on c.id=a.client_id where h.active and a.active and c.active order by h.symbol',
    ),
  );
  const date = businessDate(now),
    list = rows.map((r) => r.symbol).slice(0, 40);
  const { overnight, movers, calendar } = await fetchAndSave(db, list, date, now);
  return { saved: overnight.filter(Boolean).length + movers.filter(Boolean).length + (calendar ? 1 : 0) };
}
/**
 * Backfill: saves a past day's futures and holding charts from the provider's history for the given symbols, only
 * where no snapshot exists. The calendar feed covers only the current week, so a past day's calendar is saved when it is still in that feed.
 */
export async function backfillPanels(db: Db, date: string, symbols: string[]): Promise<number> {
  const list = [...new Set(symbols)].slice(0, 40),
    want = [
      ...OVERNIGHT.map((o) => ({
        key: 'overnight:' + o.symbol,
        symbol: o.symbol,
        label: o.label,
        interval: '5m' as const,
      })),
      ...list.map((s) => ({ key: 'mover:' + s, symbol: s, label: s, interval: '15m' as const })),
    ];
  const have = new Set(
    (await db.asService((q) => q('select key from live_market_snapshots where business_date=$1', [date]))).map((r) =>
      String(r.key),
    ),
  );
  let saved = 0;
  for (const w of want.filter((w) => !have.has(w.key))) {
    const s = await getSeriesForDay(w.symbol, w.label, date, w.interval);
    if (s) {
      await save(db, date, w.key, s, s.source);
      saved++;
    }
  }
  if (!have.has('calendar')) {
    const c = await getCalendar(new Date(date + 'T16:00:00Z'), db).catch(() => null);
    if (c && c.scope === 'today' && c.events.length) {
      await save(db, date, 'calendar', c, c.source);
      saved++;
    }
  }
  return saved;
}
