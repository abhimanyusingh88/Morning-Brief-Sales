import type { Db, Q } from "../db/types";
import { defaultScenarios, scenarioByKey } from "../market/scenarios";
import { ingestMarket } from "../pipeline/ingest";
import { SECTOR_INDEX_MEMBERS, SECTOR_INDEX_SECTORS, specSectorOf } from "../brief/spec";
import { uid } from "../util/id";
import { rngFor } from "../util/rng";
import { etClock, etInstant, weekOf, weekdayShort } from "../util/time";
import { ECON_BANK, FED_SPEAKERS, FED_TOPICS, INDEX_EVENTS, pickNews } from "./content";
import { FEEDS, FEED_BY_KEY, SECTION_FEEDS, type FeedDef } from "./registry";

export type FeedStatus = "running" | "ok" | "delayed" | "down";
export type Outage = "down" | "delayed";

export interface FeedState {
  feedKey: string;
  status: FeedStatus;
  startedAt: string;
  finishedAt: string | null;
  rows: number;
  latencyMs: number | null;
  asOf: string | null;
  detail: Record<string, unknown>;
  sample: unknown[];
  log: string[];
}

interface ConnOut { rows: number; asOf: Date; sample: unknown[]; detail?: Record<string, unknown>; store?: string }
interface ConnCtx { q: Q; date: string; scenarios: string[]; def: FeedDef; rng: ReturnType<typeof rngFor> }
type Connector = (c: ConnCtx) => Promise<ConnOut>;

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const uniform = (r: ReturnType<typeof rngFor>, [a, b]: [number, number]) => a + (b - a) * r.next();

interface EventRow {
  id: string; kind: string; title: string; summary: string; at: string; instrumentId?: string | null; sector?: string | null;
  tags?: string[]; severity?: number; source: string; payload?: Record<string, unknown>; products?: string[]; feedKey: string; entitlement?: string;
  /** business date when it differs from the run date (e.g. earnings later in the week) */
  bd?: string;
}
async function insertEvents(q: Q, date: string, rows: EventRow[]) {
  if (!rows.length) return;
  await q(
    `insert into events (id, business_date, kind, title, summary, occurred_at, instrument_id, sector, tags, severity, entitlement, simulated, source_label, payload, products, feed_key)
     select (x->>'id')::uuid, coalesce((x->>'bd')::date, $2::date), x->>'kind', x->>'title', x->>'summary', (x->>'at')::timestamptz, nullif(x->>'instrumentId','')::uuid, nullif(x->>'sector',''),
            array(select jsonb_array_elements_text(x->'tags')), coalesce((x->>'severity')::smallint, 1), coalesce(x->>'entitlement','public'), true, x->>'source', coalesce(x->'payload','{}'::jsonb),
            array(select jsonb_array_elements_text(x->'products')), x->>'feedKey'
       from jsonb_array_elements($1::jsonb) x
     on conflict (id) do update set title = excluded.title, summary = excluded.summary, occurred_at = excluded.occurred_at, sector = excluded.sector, tags = excluded.tags,
            severity = excluded.severity, payload = excluded.payload, products = excluded.products, feed_key = excluded.feed_key`,
    [JSON.stringify(rows.map((r) => ({ ...r, tags: r.tags ?? [], products: r.products ?? [], payload: r.payload ?? {}, bd: r.bd }))), date],
  );
}

interface Eq { id: string; symbol: string; name: string; sector: string | null; chg: number | null }
async function loadEquities(q: Q): Promise<Eq[]> {
  const rows = await q(`select i.id, i.symbol, i.name, i.sector, m.chg from instruments i left join market_quotes m on m.instrument_id = i.id where i.asset_class = 'equity' order by i.symbol`);
  return rows.map((r) => ({ id: String(r.id), symbol: String(r.symbol), name: String(r.name), sector: (r.sector as string) ?? null, chg: r.chg == null ? null : Number(r.chg) }));
}

async function upsertExtras(q: Q, date: string, feedKey: string, source: string, asOf: Date, rows: { key: string; label: string; value?: number | null; text?: string | null; unit: string }[]) {
  await q(
    `insert into market_extras (business_date, key, label, value, text_value, unit, as_of, source, feed_key)
     select $1::date, x->>'key', x->>'label', (x->>'value')::numeric, x->>'text', x->>'unit', $2::timestamptz, $3, $4 from jsonb_array_elements($5::jsonb) x
     on conflict (business_date, key) do update set label = excluded.label, value = excluded.value, text_value = excluded.text_value, unit = excluded.unit, as_of = excluded.as_of, source = excluded.source, feed_key = excluded.feed_key`,
    [date, asOf.toISOString(), source, feedKey, JSON.stringify(rows)],
  );
}

const SRC = (k: string) => `${FEED_BY_KEY.get(k)?.name ?? k} (simulated)`;

const CONNECTORS: Record<string, Connector> = {
  async mkt_snapshot({ q, date, scenarios }) {
    const r = await ingestMarket(q, date, scenarios);
    const sample = await q(`select i.symbol, m.last, m.prev_close, m.chg, i.unit from market_quotes m join instruments i on i.id = m.instrument_id where i.symbol in ('SPX','NDX','UST10Y') order by i.symbol`);
    const asOf = (await q<{ a: string }>(`select max(as_of) a from market_quotes`))[0].a;
    return { rows: r.rows, asOf: new Date(asOf), sample, detail: { moversBeyondRange: r.moverCount, leaders: r.movers }, store: "market_quotes" };
  },

  async idx_history({ q, date }) {
    const bars = await q<{ d: string; close: string }>(
      `select b.d::text d, b.close from market_bars b join instruments i on i.id = b.instrument_id where i.symbol = 'SPX' and b.d < $1::date order by b.d desc limit 12`, [date]);
    if (bars.length < 10) throw new Error(`only ${bars.length} sessions returned, ten required`);
    const last = bars[0];
    return { rows: bars.length, asOf: etInstant(last.d, 16, 0), sample: bars.slice(0, 3).map((b) => ({ date: b.d, close: Number(b.close) })), detail: { sessions: bars.length, latestSession: last.d }, store: "market_bars (read)" };
  },

  async sector_perf({ q, date, rng }) {
    const eq = await loadEquities(q);
    const mkt = (await q<{ chg: number }>(`select m.chg from market_quotes m join instruments i on i.id = m.instrument_id where i.symbol = 'SPX'`))[0]?.chg ?? 0;
    const asOf = etInstant(date, 4, 0, 40);
    const rows = SECTOR_INDEX_SECTORS.map((sector) => {
      const members = eq.filter((e) => e.sector && SECTOR_INDEX_MEMBERS[sector].includes(e.sector) && e.chg != null);
      const avg = members.length ? members.reduce((a, b) => a + (b.chg ?? 0), 0) / members.length : Number(mkt) * 0.9;
      const noise = (rng.normal() * 0.18);
      return { sector, chg: round(members.length ? avg * 0.8 + noise : avg + noise * 2, 2) };
    });
    await q(
      `insert into sector_perf (business_date, sector, chg, as_of, source) select $1::date, x->>'sector', (x->>'chg')::numeric, $2::timestamptz, $3 from jsonb_array_elements($4::jsonb) x
       on conflict (business_date, sector) do update set chg = excluded.chg, as_of = excluded.as_of, source = excluded.source`,
      [date, asOf.toISOString(), SRC("sector_perf"), JSON.stringify(rows)]);
    return { rows: rows.length, asOf, sample: rows.slice(0, 3), store: "sector_perf" };
  },

  async equity_ref({ q }) {
    const eq = await loadEquities(q);
    const unmapped = eq.filter((e) => !specSectorOf(e.sector) && e.sector !== "Utilities");
    return {
      rows: eq.length, asOf: new Date(), sample: eq.slice(0, 3).map((e) => ({ ticker: e.symbol, name: e.name, sector: e.sector, specSector: specSectorOf(e.sector), products: ["Equities", "Options", "Equity swaps"] })),
      detail: { unmapped: unmapped.length, sectors: new Set(eq.map((e) => specSectorOf(e.sector) ?? e.sector)).size }, store: "instruments (read)",
    };
  },

  async futures_rates({ q, date, rng }) {
    const eq = await loadEquities(q);
    const idx = Object.fromEntries((await q<{ symbol: string; chg: number }>(`select i.symbol, m.chg from market_quotes m join instruments i on i.id = m.instrument_id where i.symbol in ('SPX','NDX','RTY','VIX')`)).map((r) => [r.symbol, Number(r.chg)]));
    const asOf = etInstant(date, 4, 0, 25);
    const up = eq.filter((e) => (e.chg ?? 0) > 0).length / Math.max(1, eq.filter((e) => e.chg != null).length);
    const rows = [
      { key: "fut.spx", label: "Large-cap index futures vs. fair value", value: round((idx.SPX ?? 0) * 0.9 + rng.normal() * 0.05, 2), unit: "pct" },
      { key: "fut.ndx", label: "Tech-growth index futures vs. fair value", value: round((idx.NDX ?? 0) * 0.9 + rng.normal() * 0.06, 2), unit: "pct" },
      { key: "fut.rty", label: "Small-cap index futures vs. fair value", value: round((idx.RTY ?? 0) * 0.9 + rng.normal() * 0.08, 2), unit: "pct" },
      { key: "breadth.up_share", label: "Share of index members indicated higher", value: Math.round(up * 100), unit: "pct" },
      { key: "breadth.top_share", label: "Share of index gains from the ten largest names", value: Math.round(uniform(rng, [58, 86])), unit: "pct" },
      { key: "sent.putcall", label: "Equity put/call ratio", value: round(uniform(rng, [0.72, 1.12]), 2), unit: "level" },
    ];
    await upsertExtras(q, date, "futures_rates", SRC("futures_rates"), asOf, rows);
    return { rows: rows.length, asOf, sample: rows.slice(0, 3), store: "market_extras" };
  },

  async earnings_cal({ q, date, rng }) {
    const week = weekOf(date).filter((d) => d >= date);
    const have = await q<{ id: string; instrument_id: string | null; business_date: string; occurred_at: string }>(
      `select id, instrument_id, business_date::text business_date, occurred_at from events where kind = 'earnings' and entitlement = 'public' and business_date = any($1::date[])`, [week]);
    const eq = await loadEquities(q);
    const taken = new Set(have.map((h) => h.instrument_id));
    const add: EventRow[] = [];
    const pool = eq.filter((e) => !taken.has(e.id)).map((e) => ({ e, k: rng.next() })).sort((a, b) => a.k - b.k).map((x) => x.e);
    const want = Math.max(0, 9 - have.length);
    pool.slice(0, want).forEach((e, n) => {
      const day = week[1 + (n % Math.max(1, week.length - 1))] ?? week[week.length - 1];
      const bmo = rng.next() < 0.45;
      add.push({
        id: uid(`earn:${date}:${e.id}`), kind: "earnings", title: `${e.name} reports quarterly results`, summary: "Scheduled quarterly results. Consensus drivers and positioning to be reviewed ahead of the print.",
        at: etInstant(day, bmo ? 6 : 16, bmo ? 30 : 15).toISOString(), instrumentId: e.id, sector: e.sector, tags: [e.symbol, e.sector ?? "", "earnings"].filter(Boolean), severity: 2,
        source: SRC("earnings_cal"), feedKey: "earnings_cal", products: ["Equities", "Options"], payload: { timing: bmo ? "bmo" : "amc" },
      });
      add[add.length - 1].bd = day;
    });
    await insertEvents(q, date, add);
    // enrich the calendar rows already present (timing, products, provenance)
    await q(
      `update events set feed_key = 'earnings_cal', products = '{Equities,Options}',
              payload = payload || jsonb_build_object('timing', case when extract(hour from occurred_at at time zone 'America/New_York') < 12 then 'bmo' else 'amc' end)
        where kind = 'earnings' and entitlement = 'public' and business_date = any($1::date[]) and feed_key is distinct from 'earnings_cal'`, [week]);
    const rows = await q(`select e.title, e.business_date::text d, e.payload->>'timing' timing from events e where kind = 'earnings' and entitlement = 'public' and business_date = any($1::date[]) order by e.business_date limit 3`, [week]);
    const total = (await q<{ n: number }>(`select count(*)::int n from events where kind = 'earnings' and entitlement = 'public' and business_date = any($1::date[])`, [week]))[0].n;
    return { rows: total, asOf: etInstant(date, 4, 0, 18), sample: rows, detail: { window: `${week[0]} to ${week[week.length - 1]}`, added: add.length }, store: "events (kind=earnings)" };
  },

  async econ_cal({ q, date, rng }) {
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const seeded = await q<{ id: string; title: string }>(`select id, title from events where kind = 'macro' and business_date = $1 and source_label = 'Simulated calendar'`, [date]);
    const unitOf = (t: string): "pct" | "level" | "thousand" => (/price index|retail|durable|factory|producer/i.test(t) ? "pct" : /payroll|claims|starts|jolts/i.test(t) ? "thousand" : "level");
    const range = (t: string): { est: [number, number]; prior: [number, number] } => {
      const b = ECON_BANK.find((x) => x.title.toLowerCase() === t.toLowerCase());
      if (b) return { est: b.est, prior: b.prior };
      const u = unitOf(t);
      return u === "pct" ? { est: [0.1, 0.5], prior: [0.0, 0.5] } : u === "thousand" ? { est: [120, 240], prior: [110, 240] } : { est: [49, 56], prior: [49, 56] };
    };
    let releases = 0;
    for (const s of seeded) {
      const group = /auction/i.test(s.title) ? "supply" : /minutes/i.test(s.title) ? "fed" : "release";
      const u = unitOf(s.title);
      const rg = range(s.title);
      const est = u === "thousand" ? Math.round(uniform(rng, rg.est)) : round(uniform(rng, rg.est), 1);
      const prior = u === "thousand" ? Math.round(uniform(rng, rg.prior)) : round(uniform(rng, rg.prior), 1);
      await q(`update events set feed_key = 'econ_cal', products = '{Fixed income,Futures,FX}', payload = payload || $2::jsonb where id = $1`, [s.id, JSON.stringify({ group, unit: u, est: group === "release" ? est : null, prior: group === "release" ? prior : null })]);
      if (group === "release") releases += 1;
    }
    const add: EventRow[] = [];
    const used = new Set(seeded.map((s) => s.title.toLowerCase()));
    for (const t of ECON_BANK.filter((e) => e.weekdays.includes(dow) && !used.has(e.title.toLowerCase()))) {
      if (releases + add.length >= 3) break;
      const est = t.unit === "thousand" ? Math.round(uniform(rng, t.est)) : round(uniform(rng, t.est), 1);
      const prior = t.unit === "thousand" ? Math.round(uniform(rng, t.prior)) : round(uniform(rng, t.prior), 1);
      const [hh, mm] = t.time.split(":").map(Number);
      add.push({
        id: uid(`econ:${date}:${t.title}`), kind: "macro", title: t.title, summary: `Scheduled release: ${t.title.toLowerCase()}. Consensus estimate and prior value shown.`, at: etInstant(date, hh, mm).toISOString(),
        tags: ["macro", "rates"], severity: 2, source: SRC("econ_cal"), feedKey: "econ_cal", products: ["Fixed income", "Futures", "FX"], payload: { group: "release", unit: t.unit, est, prior },
      });
    }
    await insertEvents(q, date, add);
    const rows = await q(`select title, occurred_at, payload from events where kind = 'macro' and business_date = $1 and feed_key = 'econ_cal' order by occurred_at limit 3`, [date]);
    const n = (await q<{ n: number }>(`select count(*)::int n from events where kind = 'macro' and business_date = $1 and feed_key = 'econ_cal'`, [date]))[0].n;
    return { rows: n, asOf: etInstant(date, 4, 0, 22), sample: rows, store: "events (kind=macro)" };
  },

  async fed_cal({ q, date, rng }) {
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const asOf = etInstant(date, 4, 0, 30);
    const rows: EventRow[] = [];
    const n = dow === 5 ? 1 : 1 + (rng.next() < 0.5 ? 1 : 0);
    const used = new Set<string>();
    for (let i = 0; i < n; i++) {
      let sp = rng.pick(FED_SPEAKERS);
      while (used.has(sp)) sp = rng.pick(FED_SPEAKERS);
      used.add(sp);
      const hour = 9 + Math.floor(rng.next() * 6);
      const topic = rng.pick(FED_TOPICS);
      rows.push({
        id: uid(`fed:${date}:${sp}`), kind: "macro", title: `${sp} speaks on ${topic}`, summary: `Scheduled public remarks by ${sp}. Markets will parse the tone on the path of policy.`, at: etInstant(date, hour, 0).toISOString(),
        tags: ["central_banks", "rates"], severity: 2, source: SRC("fed_cal"), feedKey: "fed_cal", products: ["Fixed income", "Futures", "FX"], payload: { group: "fed", subtype: "speaker" },
      });
    }
    // the next data point ahead of a key release: weekly claims ahead of Friday's payrolls
    const week = weekOf(date);
    const thu = week[3] >= date ? week[3] : weekOf(new Date(new Date(`${date}T12:00:00Z`).getTime() + 7 * 864e5).toISOString().slice(0, 10))[3];
    rows.push({
      id: uid(`fedahead:${date}`), kind: "macro", title: "Weekly jobless claims, ahead of Friday's payrolls print", summary: "The last labor-market read before the monthly employment report.", at: etInstant(thu, 8, 30).toISOString(),
      tags: ["labor", "rates"], severity: 1, source: SRC("fed_cal"), feedKey: "fed_cal", products: ["Fixed income", "Futures"], payload: { group: "fed", subtype: "ahead", day: weekdayShort(thu), bd: thu },
    });
    rows[rows.length - 1].bd = thu;
    await insertEvents(q, date, rows);
    const FOMC = [["2026-10-28", "Oct 27–28"], ["2026-12-09", "Dec 8–9"], ["2027-01-27", "Jan 26–27"]];
    const next = FOMC.find(([end]) => end >= date) ?? FOMC[FOMC.length - 1];
    const odds = Math.round(uniform(rng, [58, 91]));
    await upsertExtras(q, date, "fed_cal", SRC("fed_cal"), asOf, [
      { key: "fed.next_fomc", label: "Next policy meeting", text: next[1], unit: "text" },
      { key: "fed.hold_odds", label: "Market-implied odds of a hold at the next meeting", value: odds, unit: "pct" },
    ]);
    return { rows: rows.length + 2, asOf, sample: rows.slice(0, 2).map((r) => ({ title: r.title, at: r.at })), detail: { nextMeeting: next[1] }, store: "events + market_extras" };
  },

  async news_agg({ q, date, scenarios, rng }) {
    const eq = await loadEquities(q);
    await q(`delete from events where business_date = $1 and feed_key = 'news_agg'`, [date]);
    const rows: EventRow[] = [];
    // storylines for the day (these drive the call list as well)
    let idx = 0;
    for (const key of scenarios.length ? scenarios : defaultScenarios(date)) {
      const sc = scenarioByKey(key);
      if (!sc) continue;
      for (const e of sc.events) {
        const hh = e.hour, mm = (idx * 17 + 5) % 60;
        rows.push({
          id: uid(`news:${date}:${key}:${idx}`), kind: e.kind, title: e.title, summary: e.summary, at: etInstant(date, hh, mm).toISOString(), sector: e.sector ?? null,
          tags: e.tags, severity: e.severity, source: "Simulated newswire", feedKey: "news_agg", products: e.kind === "macro" ? ["Fixed income", "Futures", "FX"] : ["Equities", "Options"],
        });
        idx += 1;
      }
    }
    // the rest of the overnight tape: headlines across sectors and products
    pickNews(date).forEach((t, n) => {
      const cands = t.sector ? eq.filter((e) => e.sector === t.sector) : [];
      const tk = cands.length && rng.next() < 0.6 ? cands[Math.floor(rng.next() * cands.length)] : null;
      // spread the timestamps across the overnight session (late evening to pre-market)
      const hour = 1 + Math.floor(rng.next() * 5);
      rows.push({
        id: uid(`wire:${date}:${n}:${t.title}`), kind: "news", title: t.title, summary: "Headline from the simulated news aggregator. Not attributed to a publisher.", at: etInstant(date, hour, Math.floor(rng.next() * 60)).toISOString(),
        instrumentId: tk?.id ?? null, sector: t.sector, tags: [...t.tags, ...(tk ? [tk.symbol] : [])], severity: t.severity, source: "Simulated newswire", feedKey: "news_agg", products: t.products,
      });
    });
    // the aggregator tags most items; a few arrive untagged and are tagged in stage two
    rows.forEach((r, i) => { if (!r.instrumentId && r.sector && i % 5 === 0) { r.payload = { untagged: true }; } });
    await insertEvents(q, date, rows);
    return { rows: rows.length, asOf: etInstant(date, 4, 0, 8), sample: rows.slice(0, 3).map((r) => ({ title: r.title, sector: r.sector, products: r.products })), detail: { storylines: scenarios }, store: "events (kind=news|macro|flow)" };
  },

  async corp_actions({ q, date, rng }) {
    const eq = await loadEquities(q);
    await q(`delete from events where business_date = $1 and feed_key = 'corp_actions'`, [date]);
    const prefer = ["Financials", "Real estate", "Utilities", "Consumer Staples", "Energy", "Healthcare", "Industrials", "Technology"];
    const picks = prefer.map((s) => { const c = eq.filter((e) => e.sector === s); return c[Math.floor(rng.next() * c.length)]; }).filter(Boolean).slice(0, 5);
    const rows: EventRow[] = picks.map((e, n) => {
      const amount = round(uniform(rng, [0.18, 0.96]), 2);
      const grew = rng.next() < 0.78;
      const prior = grew ? round(amount * uniform(rng, [0.88, 0.97]), 2) : amount;
      return {
        id: uid(`div:${date}:${e.id}`), kind: "corporate_action", title: `${e.name} declares quarterly dividend`, summary: grew ? "Dividend raised from the prior quarter." : "Dividend unchanged from the prior quarter.",
        at: etInstant(date, 4, 0, 5 + n).toISOString(), instrumentId: e.id, sector: e.sector, tags: [e.symbol, "dividend"], severity: 1, source: SRC("corp_actions"), feedKey: "corp_actions",
        products: ["Equities", "Options", "Equity swaps"], payload: { type: "dividend", amount, prior, frequency: "quarterly" },
      };
    });
    await insertEvents(q, date, rows);
    return { rows: rows.length, asOf: etInstant(date, 4, 0, 14), sample: rows.slice(0, 3).map((r) => ({ company: r.title, ...(r.payload as object) })), store: "events (kind=corporate_action)" };
  },

  async index_cal({ q, date, rng }) {
    await q(`delete from events where business_date = $1 and feed_key = 'index_cal'`, [date]);
    const pick = INDEX_EVENTS.map((e) => ({ e, k: rng.next() })).sort((a, b) => a.k - b.k).slice(0, 1 + (rng.next() < 0.4 ? 1 : 0)).map((x) => x.e);
    const week = weekOf(date);
    const eff = week[4] >= date ? week[4] : date;
    const rows: EventRow[] = pick.map((p, n) => ({
      id: uid(`idx:${date}:${p.index}`), kind: "corporate_action", title: `${p.index} ${p.kind} effective ${weekdayShort(eff)} close`, summary: p.note, at: etInstant(date, 4, 0, 9 + n).toISOString(),
      tags: ["index_event"], severity: 1, source: SRC("index_cal"), feedKey: "index_cal", products: ["Equities", "Levered ETFs", "Futures"], payload: { type: "index_rebalance", index: p.index, effective: eff },
    }));
    await insertEvents(q, date, rows);
    return { rows: rows.length, asOf: etInstant(date, 4, 0, 12), sample: rows.map((r) => ({ title: r.title, effective: eff })), store: "events (kind=corporate_action)" };
  },

  async crm_book({ q, date }) {
    const c = (await q<{ clients: number; positions: number; trades: number; interactions: number; coverage: number }>(
      `select (select count(*) from clients)::int clients, (select count(*) from positions)::int positions, (select count(*) from trades)::int trades, (select count(*) from interactions)::int interactions, (select count(*) from coverage)::int coverage`))[0];
    return {
      rows: c.positions, asOf: etInstant(date, 2, 0, 11),
      sample: [{ table: "clients", rows: c.clients }, { table: "coverage", rows: c.coverage }, { table: "positions", rows: c.positions }, { table: "trades", rows: c.trades }, { table: "interactions", rows: c.interactions }],
      detail: { ...c, access: "read-only replica; salespeople see only covered clients (row-level security)" }, store: "(read-only)",
    };
  },

  async restricted({ q, date }) {
    const r = (await q<{ items: number; names: number }>(`select count(*)::int items, count(distinct instrument_id)::int names from events where entitlement = 'restricted_ib' and business_date >= $1::date - 5`, [date]))[0];
    return {
      rows: r.items, asOf: etInstant(date, 4, 0, 2),
      sample: Array.from({ length: Math.min(2, r.names) }, (_, i) => ({ instrument: "********", reason: "advisory mandate", ref: `RL-${100 + i}` })),
      detail: { restrictedInstruments: r.names, rule: "withheld from all sales surfaces and model prompts" }, store: "(read-only)",
    };
  },

  async email_relay({ date }) {
    return { rows: 0, asOf: etInstant(date, 4, 0, 1), sample: [{ ehlo: "relay.internal.sim", starttls: true, auth: "ok" }], detail: { policy: "internal addresses only; nothing is ever sent to a client" }, store: "(health check)" };
  },
};

const KB = (rows: number) => Math.max(2, Math.round(rows * 0.9 + 6));

function connectLines(def: FeedDef, latency: number): string[] {
  const host = def.endpoint.replace(/^[a-z]+:\/\//, "").split(/[/?]/)[0];
  const path = "/" + def.endpoint.split(/[/?]/).slice(3).join("/").split("?")[0];
  const lines = [`connect   ${def.endpoint}`, `tls       ${def.transport === "Read replica" ? "verify-full" : "TLS 1.3"} · certificate verified for ${host}`, `auth      service token ····${(def.key.length * 7919).toString(16).slice(-4)} · scope read:${def.key}`];
  if (def.transport === "SFTP drop") lines.push(`fetch     GET ${path}  (${latency} ms)`);
  else if (def.transport === "Read replica") lines.push(`query     read-only role · ${latency} ms to first row`);
  else if (def.transport === "SMTP") lines.push(`ehlo      250-STARTTLS · 250 AUTH · ${latency} ms`);
  else lines.push(`request   ${def.transport === "WebSocket" ? "subscribe" : "GET"} ${path}  → 200 OK · ${latency} ms`);
  return lines;
}

export interface RunFeedsOpts {
  db: Db;
  runId: string;
  businessDate: string;
  scenarios: string[];
  outages?: Record<string, Outage>;
  /** hold each connector for a share of the stage so a time-lapse shows them completing one after another */
  pace?: (feedKey: string, index: number, total: number) => Promise<void>;
  onUpdate?: (s: FeedState) => void;
  only?: string[];
}

const DEPENDS: Record<string, string[]> = { sector_perf: ["mkt_snapshot"], futures_rates: ["mkt_snapshot"], mkt_snapshot: [], restricted: [] };

/** Run every connector. A failure in one never stops the others: its sections are withheld downstream. */
export async function runFeeds(o: RunFeedsOpts): Promise<FeedState[]> {
  await syncFeedRegistry(o.db);
  const defs = FEEDS.filter((f) => !o.only || o.only.includes(f.key));
  const done = new Map<string, Promise<FeedState>>();
  const states = new Map<string, FeedState>();

  const persist = (s: FeedState) =>
    o.db.asService((q) => q(
      `insert into feed_runs (id, run_id, feed_key, status, started_at, finished_at, rows, latency_ms, as_of, detail, sample, log)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::text[])
       on conflict (id) do update set status = excluded.status, finished_at = excluded.finished_at, rows = excluded.rows, latency_ms = excluded.latency_ms, as_of = excluded.as_of,
              detail = excluded.detail, sample = excluded.sample, log = excluded.log`,
      [uid(`feedrun:${o.runId}:${s.feedKey}`), o.runId, s.feedKey, s.status, s.startedAt, s.finishedAt, s.rows, s.latencyMs, s.asOf, JSON.stringify(s.detail), JSON.stringify(s.sample), [...s.log]])).catch(() => {});

  const launch = (def: FeedDef, index: number): Promise<FeedState> => {
    const existing = done.get(def.key);
    if (existing) return existing;
    const p = (async () => {
      await Promise.all((DEPENDS[def.key] ?? []).filter((k) => defs.some((d) => d.key === k)).map((k) => launch(FEED_BY_KEY.get(k)!, 0)));
      const rng = rngFor(`feed:${def.key}:${o.businessDate}`);
      const latency = Math.round(70 + rng.next() * 620);
      const s: FeedState = { feedKey: def.key, status: "running", startedAt: new Date().toISOString(), finishedAt: null, rows: 0, latencyMs: null, asOf: null, detail: {}, sample: [], log: [] };
      states.set(def.key, s);
      const push = (line: string) => { s.log.push(line); o.onUpdate?.({ ...s, log: [...s.log] }); };
      o.onUpdate?.({ ...s });
      void persist(s);
      for (const l of connectLines(def, latency)) push(l);
      await o.pace?.(def.key, index, defs.length);
      const affected = SECTION_FEEDS ? Object.values(SECTION_FEEDS).filter((x) => x.required.includes(def.key)).map((x) => x.label) : [];
      const outage = o.outages?.[def.key];
      const t0 = Date.now();
      try {
        if (outage === "down") {
          push(`request   → 503 Service Unavailable (attempt 1 of 3)`);
          push(`retry     back-off 2 s → 503 Service Unavailable (attempt 2 of 3)`);
          push(`retry     back-off 4 s → 503 Service Unavailable (attempt 3 of 3)`);
          s.status = "down"; s.detail = { error: "503 Service Unavailable after 3 attempts", withheld: affected };
          push(`fail      marked DOWN · withheld from briefs: ${affected.join(", ") || "none"}`);
        } else if (outage === "delayed") {
          const stale = etInstant(o.businessDate, 2, 12, 41);
          s.status = "delayed"; s.asOf = stale.toISOString(); s.latencyMs = latency;
          push(`parse     response received · newest record ${etClock(stale)} ET`);
          push(`fresh     ${Math.round((etInstant(o.businessDate, 4, 0).getTime() - stale.getTime()) / 60000)} min old, limit ${def.maxAgeMin} min → DELAYED`);
          s.detail = { error: "newest record older than freshness limit", withheld: affected };
          push(`fail      data not used · withheld from briefs: ${affected.join(", ") || "none"}`);
        } else {
          const out = await o.db.asService((q) => CONNECTORS[def.key]({ q, date: o.businessDate, scenarios: o.scenarios, def, rng }));
          s.rows = out.rows; s.asOf = out.asOf.toISOString(); s.latencyMs = latency; s.sample = out.sample; s.detail = { ...(out.detail ?? {}), store: out.store, computeMs: Date.now() - t0 };
          push(`parse     ${out.rows.toLocaleString("en-US")} records · ${KB(out.rows)} KB · schema v${2 + (def.key.length % 3)} ✓`);
          push(`fresh     newest record ${etClock(out.asOf)} ET · SLA ${def.slaTime} ET ✓`);
          if (out.store) push(`store     ${out.store}${out.rows ? ` · ${out.rows.toLocaleString("en-US")} rows` : ""}`);
          s.status = "ok";
        }
      } catch (e) {
        s.status = "down";
        s.detail = { error: e instanceof Error ? e.message : String(e), withheld: affected };
        push(`fail      ${e instanceof Error ? e.message : String(e)} · marked DOWN`);
      }
      s.finishedAt = new Date().toISOString();
      if (s.latencyMs == null) s.latencyMs = latency;
      o.onUpdate?.({ ...s, log: [...s.log] });
      await persist(s);
      return s;
    })();
    done.set(def.key, p);
    return p;
  };

  await Promise.all(defs.map((d, i) => launch(d, i)));
  return defs.map((d) => states.get(d.key)!).filter(Boolean);
}

/** Keep the registry table in step with the code. */
export async function syncFeedRegistry(db: Db) {
  await db.asService((q) => q(
    `insert into feeds (key, name, category, vendor, description, cadence, sla_time, sections, position, simulated)
     select x->>'key', x->>'name', x->>'category', x->>'vendor', x->>'description', x->>'cadence', (x->>'slaTime')::time, array(select jsonb_array_elements_text(x->'sections')), (x->>'position')::int, true
       from jsonb_array_elements($1::jsonb) x
     on conflict (key) do update set name = excluded.name, category = excluded.category, vendor = excluded.vendor, description = excluded.description, cadence = excluded.cadence, sla_time = excluded.sla_time, sections = excluded.sections, position = excluded.position`,
    [JSON.stringify(FEEDS.map((f, i) => ({ ...f, position: i })))]));
}
