import type { Q } from "../db/types";
import type { ClientInfo, EventInfo, InstrumentInfo, QuoteInfo, Snapshot } from "./types";

const num = (x: unknown) => Number(x);
const iso = (x: unknown) => (x instanceof Date ? x.toISOString() : String(x));
const day = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10));

/** Loads everything the matcher needs in a handful of round trips. Pipeline-only: runs with service access. */
export async function loadSnapshot(q: Q, businessDate: string): Promise<Snapshot> {
  const [inst, quotes, clients, cov, pos, ints, last, fus, trades, evs, restricted, prefs] = await Promise.all([
    q(`select id, symbol, name, sector, asset_class, unit, (meta->>'vol')::float8 vol from instruments`),
    q(`select instrument_id, last, prev_close, chg, as_of, source from market_quotes`),
    q(`select id, name, short_name, segment, tier, aum_usd_mn, status from clients`),
    q(`select client_id, profile_id from coverage`),
    q(`select client_id, instrument_id, notional_usd from positions`),
    q(`select client_id, tag from client_interests order by weight desc`),
    q(`select distinct on (client_id) client_id, kind, subject, note, ($1::date - (occurred_at at time zone 'America/New_York')::date) as days_ago
         from interactions order by client_id, occurred_at desc`, [businessDate]),
    q(`select client_id, id, due_on, text from followups where status = 'open'`),
    q(`select client_id, instrument_id, side, notional_usd, ($1::date - (traded_at at time zone 'America/New_York')::date) as days_ago
         from trades where traded_at > $1::date - 30`, [businessDate]),
    q(`select id, kind, title, summary, occurred_at, business_date, instrument_id, sector, tags, severity, simulated, source_label
         from events where entitlement = 'public' and business_date between $1::date and $1::date + 1`, [businessDate]),
    q(`select distinct instrument_id from events where entitlement = 'restricted_ib' and instrument_id is not null and business_date >= $1::date - 5`, [businessDate]),
    q(`select profile_id, max_cards from preferences`),
  ]);

  const instruments = new Map<string, InstrumentInfo>(
    inst.map((r) => [String(r.id), { id: String(r.id), symbol: String(r.symbol), name: String(r.name), sector: (r.sector as string) ?? null, assetClass: r.asset_class as InstrumentInfo["assetClass"], unit: r.unit as InstrumentInfo["unit"], vol: num(r.vol) }]),
  );
  const quoteMap = new Map<string, QuoteInfo>(
    quotes.map((r) => [String(r.instrument_id), { last: num(r.last), prevClose: num(r.prev_close), chg: num(r.chg), asOf: iso(r.as_of), source: String(r.source) }]),
  );
  const clientMap = new Map<string, ClientInfo>(
    clients.map((r) => [String(r.id), { id: String(r.id), name: String(r.name), shortName: String(r.short_name), segment: String(r.segment), tier: num(r.tier) as 1 | 2 | 3, aumUsdMn: num(r.aum_usd_mn), status: r.status as ClientInfo["status"] }]),
  );

  const coverage = new Map<string, string[]>();
  for (const r of cov) coverage.set(String(r.client_id), [...(coverage.get(String(r.client_id)) ?? []), String(r.profile_id)]);
  const positions = new Map<string, { instrumentId: string; notionalUsd: number }[]>();
  for (const r of pos) positions.set(String(r.client_id), [...(positions.get(String(r.client_id)) ?? []), { instrumentId: String(r.instrument_id), notionalUsd: num(r.notional_usd) }]);
  const interests = new Map<string, string[]>();
  for (const r of ints) interests.set(String(r.client_id), [...(interests.get(String(r.client_id)) ?? []), String(r.tag)]);

  return {
    businessDate,
    instruments,
    quotes: quoteMap,
    clients: clientMap,
    coverage,
    positions,
    interests,
    lastContact: new Map(last.map((r) => [String(r.client_id), { daysAgo: num(r.days_ago), kind: String(r.kind), subject: String(r.subject), note: String(r.note) }])),
    followups: new Map(fus.map((r) => [String(r.client_id), { id: String(r.id), dueOn: day(r.due_on), text: String(r.text) }])),
    trades: trades.map((r) => ({ clientId: String(r.client_id), instrumentId: String(r.instrument_id), side: r.side as "buy" | "sell", notionalUsd: num(r.notional_usd), daysAgo: num(r.days_ago) })),
    events: evs.map((r): EventInfo => ({
      id: String(r.id), kind: r.kind as EventInfo["kind"], title: String(r.title), summary: String(r.summary),
      occurredAt: iso(r.occurred_at), businessDate: day(r.business_date), instrumentId: (r.instrument_id as string) ?? null,
      sector: (r.sector as string) ?? null, tags: (r.tags as string[]) ?? [], severity: num(r.severity) as 1 | 2 | 3,
      simulated: Boolean(r.simulated), sourceLabel: String(r.source_label),
    })),
    restrictedInstrumentIds: new Set(restricted.map((r) => String(r.instrument_id))),
    prefs: new Map(prefs.map((r) => [String(r.profile_id), { maxCards: num(r.max_cards) }])),
  };
}
