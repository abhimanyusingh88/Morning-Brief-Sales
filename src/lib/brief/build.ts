/**
 * The brief, section by section, as the build specification defines it (sections 3.1 to 3.10).
 *
 * Everything on screen that is a number is a registered fact (value, display, source, as-of, feed). Sections store
 * a structured `data` payload that points at fact keys, plus a text template made only of words and {{tokens}} so the
 * same validator that guards model output also guards these. Nothing here calls a model: the Catalysts narrative lives
 * in narrative.ts.
 */
import type { Db } from "../db/types";
import { FactBook, type Fact } from "../ai/facts";
import { keySym } from "../ai/context";
import { SECTION_FEEDS } from "../feeds/registry";
import type { Snapshot } from "../pipeline/types";
import { uid } from "../util/id";
import { etHM, weekOf, weekdayShort } from "../util/time";
import { SECTOR_INDEX_SECTORS, specSectorOf, type BriefPrefs } from "./spec";

export type FeedHealth = Record<string, "ok" | "delayed" | "down" | "running">;
export const UNAVAILABLE_NOTE = "Data temporarily unavailable.";

export interface BuiltSection {
  kind: string;
  title: string;
  status: "ok" | "unavailable";
  note?: string;
  /** words and {{tokens}} only */
  template: string;
  data: Record<string, unknown>;
  generator: "code" | "llm" | "template" | "hybrid";
  /** feeds this section drew on, for lineage */
  feeds: string[];
}

export const SECTION_ORDER = ["snapshot", "chart", "catalysts", "overnight", "sector_lead_lag", "movers", "earnings", "news", "macro_fed", "dividends", "index_rebalance"] as const;
export const SECTION_TITLES: Record<string, string> = {
  snapshot: "Markets snapshot", chart: "S&P 500, last 10 sessions", catalysts: "Catalysts", overnight: "Overnight in your products", sector_lead_lag: "Sector leaders and laggards",
  movers: "Movers in your sectors", earnings: "Earnings this week", news: "Breaking news", macro_fed: "Macro and economic releases", dividends: "Dividend announcements", index_rebalance: "Index rebalance and reconstitution",
};

/** ------------------------------------------------------------------ formatting (code only; models never format numbers) */
const MINUS = "−";
export const sgn = (n: number) => (n > 0 ? "+" : n < 0 ? MINUS : "");
export const fmtLevel = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtPct = (n: number, d = 1) => `${sgn(round(n, d))}${Math.abs(n).toFixed(d)}%`;
export const fmtBp = (n: number) => `${sgn(round(n, 1))}${Math.abs(n).toFixed(1)}bp`;
export const fmtUsd = (n: number, d = 2) => `$${fmtLevel(n, d)}`;
const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const tone = (n: number, eps = 0.005): "up" | "down" | "flat" => (n > eps ? "up" : n < -eps ? "down" : "flat");

/** magnitude in plain words, for writers that must not see digits */
export const sizeHint = (z: number) => (z >= 2.5 ? "very large for a normal day" : z >= 1.7 ? "large" : z >= 0.9 ? "notable" : "modest");

/** ------------------------------------------------------------------ inputs */
interface Quote { symbol: string; name: string; last: number; prev: number; chg: number; asOf: string; source: string; vol: number; unit: string; decimals: number }
interface EventRow {
  id: string; kind: string; title: string; summary: string; occurredAt: string; businessDate: string; instrumentId: string | null; symbol: string | null; name: string | null;
  sector: string | null; tags: string[]; severity: number; source: string; feedKey: string | null; products: string[]; payload: Record<string, unknown>;
}
interface Extra { key: string; label: string; value: number | null; text: string | null; unit: string; asOf: string; source: string; feedKey: string }
interface SectorRow { sector: string; chg: number; asOf: string; source: string }

export interface Universal {
  businessDate: string;
  health: FeedHealth;
  fb: FactBook;
  sections: Map<string, BuiltSection>;
  quotes: Map<string, Quote>;
  extras: Map<string, Extra>;
  sectors: SectorRow[];
  events: EventRow[];
  /** fact keys the Catalysts narrative may draw on, with plain-word hints */
  narrative: { key: string; group: string }[];
}

const iso = (x: unknown) => new Date(x as string).toISOString();
const ok = (h: FeedHealth, feeds: string[]) => feeds.every((f) => (h[f] ?? "ok") === "ok");
const needs = (kind: string) => SECTION_FEEDS[kind]?.required ?? [];

function put(fb: FactBook, f: Fact) {
  fb.add(f);
  return f.key;
}

/** Display names are facts too (some contain figures, such as "S&P 500"), so a stored template never holds a digit. */
function lab(fb: FactBook, key: string, text: string, asOf: string): string {
  if (!fb.has(key)) fb.add({ key, label: "Name", value: null, display: text, unit: "text", source: "Instrument master (simulated)", asOf, feedKey: "equity_ref" });
  return key;
}

function unavailable(kind: string, feeds: string[], health: FeedHealth): BuiltSection {
  const down = feeds.filter((f) => (health[f] ?? "ok") !== "ok");
  return { kind, title: SECTION_TITLES[kind] ?? kind, status: "unavailable", note: UNAVAILABLE_NOTE, template: "", data: { withheldBecause: down }, generator: "code", feeds };
}

/** ------------------------------------------------------------------ loading (public market data: service access is fine, no client data) */
async function load(db: Db, date: string) {
  const week = weekOf(date);
  return db.asService(async (q) => {
    const [quotes, bars, sectors, extras, events] = await Promise.all([
      q(`select i.symbol, i.name, i.unit, i.decimals, (i.meta->>'vol')::float8 vol, m.last, m.prev_close, m.chg, m.as_of, m.source from market_quotes m join instruments i on i.id = m.instrument_id`),
      q(`select b.d::text d, b.close from market_bars b join instruments i on i.id = b.instrument_id where i.symbol = 'SPX' and b.d < $1::date order by b.d desc limit 10`, [date]),
      q(`select sector, chg, as_of, source from sector_perf where business_date = $1`, [date]),
      q(`select key, label, value, text_value, unit, as_of, source, feed_key from market_extras where business_date = $1`, [date]),
      q(`select e.id, e.kind, e.title, e.summary, e.occurred_at, e.business_date::text bd, e.instrument_id, i.symbol, i.name inst_name, e.sector, e.tags, e.severity, e.source_label, e.feed_key, e.products, e.payload
           from events e left join instruments i on i.id = e.instrument_id
          where e.entitlement = 'public' and e.business_date = any($1::date[]) order by e.occurred_at`, [week]),
    ]);
    return {
      quotes: quotes.map((r): Quote => ({ symbol: String(r.symbol), name: String(r.name), last: Number(r.last), prev: Number(r.prev_close), chg: Number(r.chg), asOf: iso(r.as_of), source: String(r.source), vol: Number(r.vol), unit: String(r.unit), decimals: Number(r.decimals) })),
      bars: bars.map((r) => ({ d: String(r.d), close: Number(r.close) })).reverse(),
      sectors: sectors.map((r): SectorRow => ({ sector: String(r.sector), chg: Number(r.chg), asOf: iso(r.as_of), source: String(r.source) })),
      extras: extras.map((r): Extra => ({ key: String(r.key), label: String(r.label), value: r.value == null ? null : Number(r.value), text: (r.text_value as string) ?? null, unit: String(r.unit), asOf: iso(r.as_of), source: String(r.source), feedKey: String(r.feed_key) })),
      events: events.map((r): EventRow => ({
        id: String(r.id), kind: String(r.kind), title: String(r.title), summary: String(r.summary), occurredAt: iso(r.occurred_at), businessDate: String(r.bd), instrumentId: (r.instrument_id as string) ?? null,
        symbol: (r.symbol as string) ?? null, name: (r.inst_name as string) ?? null, sector: (r.sector as string) ?? null, tags: (r.tags as string[]) ?? [], severity: Number(r.severity),
        source: String(r.source_label), feedKey: (r.feed_key as string) ?? null, products: (r.products as string[]) ?? [], payload: (r.payload as Record<string, unknown>) ?? {},
      })),
    };
  });
}

/** ------------------------------------------------------------------ universal sections */
const TILES: { sym: string; label: string; kind: "index" | "vol" | "metal" | "oil" | "yield" | "spread" }[] = [
  { sym: "SPX", label: "S&P 500", kind: "index" }, { sym: "NDX", label: "Nasdaq 100", kind: "index" }, { sym: "RTY", label: "Russell 2000", kind: "index" }, { sym: "DJI", label: "Dow", kind: "index" },
  { sym: "VIX", label: "VIX", kind: "vol" }, { sym: "XAU", label: "Gold", kind: "metal" }, { sym: "XAG", label: "Silver", kind: "metal" }, { sym: "WTI", label: "WTI crude", kind: "oil" },
  { sym: "UST10Y", label: "10Y yield", kind: "yield" }, { sym: "UST2Y", label: "2Y yield", kind: "yield" }, { sym: "CDXHY", label: "HY spreads", kind: "spread" },
];

export async function buildUniversal(db: Db, businessDate: string, health: FeedHealth = {}): Promise<Universal> {
  const d = await load(db, businessDate);
  const fb = new FactBook();
  const quotes = new Map(d.quotes.map((x) => [x.symbol, x]));
  const extras = new Map(d.extras.map((x) => [x.key, x]));
  const sections = new Map<string, BuiltSection>();
  const narrative: Universal["narrative"] = [];
  const nar = (key: string, group: string) => narrative.push({ key, group });

  // ---- 3.1 snapshot
  {
    const feeds = needs("snapshot");
    if (!ok(health, feeds)) sections.set("snapshot", unavailable("snapshot", feeds, health));
    else {
      const tiles = TILES.flatMap((t) => {
        const q = quotes.get(t.sym);
        if (!q) return [];
        const base = { source: q.source, asOf: q.asOf, feedKey: "mkt_snapshot" };
        const lvlKey = `sp.${t.sym}.lvl`, subKey = `sp.${t.sym}.sub`;
        const pct = q.prev ? (q.last / q.prev - 1) * 100 : 0;
        let lvl: string, sub: string, subUnit: Fact["unit"], subVal: number | null, tn: "up" | "down" | "flat" | "none", hint: string;
        if (t.kind === "index") { lvl = fmtLevel(q.last); subVal = pct * 100; sub = fmtBp(subVal); subUnit = "bp"; tn = tone(pct, 0.005); hint = `${pct >= 0 ? "higher" : "lower"}, ${sizeHint(Math.abs(q.chg) / q.vol)}`; }
        else if (t.kind === "vol") { lvl = fmtLevel(q.last); subVal = pct; sub = fmtPct(pct); subUnit = "pct"; tn = tone(pct, 0.05); hint = pct >= 0 ? "higher" : "lower"; }
        else if (t.kind === "metal") { lvl = fmtUsd(q.last, q.last > 500 ? 0 : 2); subVal = pct; sub = fmtPct(pct); subUnit = "pct"; tn = tone(pct, 0.05); hint = pct >= 0 ? "higher" : "lower"; }
        else if (t.kind === "oil") { lvl = fmtUsd(q.last); subVal = q.prev; sub = `vs ${fmtUsd(q.prev)}`; subUnit = "usd"; tn = tone(q.last - q.prev, 0.005); hint = q.last >= q.prev ? "higher" : "lower"; }
        else if (t.kind === "yield") { const bp = q.chg; lvl = `${q.last.toFixed(2)}%`; subVal = bp; sub = Math.abs(bp) < 1 ? "flat" : `${bp > 0 ? "up" : "down"} ${Math.abs(bp).toFixed(1)}bp`; subUnit = "text"; tn = "none"; hint = Math.abs(bp) < 1 ? "little changed" : bp > 0 ? "higher" : "lower"; }
        else { lvl = `${Math.round(q.last)}bp`; const prior = q.prev; subVal = prior; sub = `from ${Math.round(prior)}bp`; subUnit = "text"; tn = "none"; hint = q.last >= q.prev ? "wider" : "tighter"; }
        put(fb, { key: lvlKey, label: `${t.label} level`, value: q.last, display: lvl, unit: t.kind === "index" || t.kind === "vol" ? "level" : t.kind === "yield" ? "pct" : t.kind === "spread" ? "bp" : "usd", ...base });
        put(fb, { key: subKey, label: `${t.label} change`, value: subVal, display: sub, unit: subUnit, hint, ...base });
        nar(lvlKey, "levels"); nar(subKey, "moves");
        const labelKey = lab(fb, `sp.${t.sym}.name`, t.label, q.asOf);
        return [{ symbol: t.sym, label: t.label, labelKey, level: lvlKey, sub: subKey, tone: tn }];
      });
      sections.set("snapshot", {
        kind: "snapshot", title: SECTION_TITLES.snapshot, status: "ok", generator: "code", feeds,
        template: tiles.map((t) => `{{${t.labelKey}}} {{${t.level}}} {{${t.sub}}}`).join("; "), data: { tiles },
      });
    }
  }

  // ---- 3.2 chart
  {
    const feeds = needs("chart");
    const spx = quotes.get("SPX");
    if (!ok(health, feeds)) sections.set("chart", unavailable("chart", feeds, health));
    else if (spx && d.bars.length >= 10) {
      const hist = d.bars.slice(-10);
      const histAsOf = new Date(`${hist[hist.length - 1].d}T21:00:00Z`).toISOString();
      const points = hist.map((b, i) => {
        const key = `sp.chart.p${i}`;
        put(fb, { key, label: `S&P 500 close, ${b.d}`, value: b.close, display: fmtLevel(b.close), unit: "level", source: "Index daily-close history (simulated)", asOf: histAsOf, feedKey: "idx_history" });
        return { d: b.d, key, v: b.close };
      });
      const nowKey = "sp.chart.now";
      put(fb, { key: nowKey, label: "S&P 500 current level", value: spx.last, display: fmtLevel(spx.last), unit: "level", source: spx.source, asOf: spx.asOf, feedKey: "mkt_snapshot" });
      points.push({ d: businessDate, key: nowKey, v: spx.last });
      const vals = points.map((p) => p.v);
      const hi = Math.max(...vals), lo = Math.min(...vals);
      const chgBp = (spx.last / spx.prev - 1) * 10000;
      put(fb, { key: "sp.chart.chg", label: "S&P 500 change today", value: chgBp, display: fmtBp(chgBp), unit: "bp", source: spx.source, asOf: spx.asOf, feedKey: "mkt_snapshot", hint: chgBp >= 0 ? "higher" : "lower" });
      put(fb, { key: "sp.chart.hi", label: "10-session high", value: hi, display: fmtLevel(hi), unit: "level", source: "Index daily-close history (simulated)", asOf: histAsOf, feedKey: "idx_history" });
      put(fb, { key: "sp.chart.lo", label: "10-session low", value: lo, display: fmtLevel(lo), unit: "level", source: "Index daily-close history (simulated)", asOf: histAsOf, feedKey: "idx_history" });
      sections.set("chart", {
        kind: "chart", title: SECTION_TITLES.chart, status: "ok", generator: "code", feeds,
        template: `{{${lab(fb, "sp.SPX.name", "S&P 500", spx.asOf)}}} {{sp.chart.now}} {{sp.chart.chg}} today; recent range {{sp.chart.lo}} to {{sp.chart.hi}}`,
        data: { points, nowKey, chgKey: "sp.chart.chg", hiKey: "sp.chart.hi", loKey: "sp.chart.lo", tone: tone(chgBp, 0.5) },
      });
      nar("sp.chart.hi", "levels"); nar("sp.chart.lo", "levels");
    }
  }

  // ---- 3.4 sector leaders and laggards
  {
    const feeds = needs("sector_lead_lag");
    if (!ok(health, feeds)) sections.set("sector_lead_lag", unavailable("sector_lead_lag", feeds, health));
    else if (d.sectors.length >= 6) {
      const ranked = [...d.sectors].sort((a, b) => b.chg - a.chg);
      const mk = (r: SectorRow) => {
        const key = `sp.sec.${keySym(r.sector)}`;
        put(fb, { key, label: `${r.sector} sector index`, value: r.chg, display: fmtPct(r.chg), unit: "pct", source: r.source, asOf: r.asOf, feedKey: "sector_perf", hint: r.chg >= 0 ? "higher" : "lower" });
        return { sector: r.sector, key };
      };
      const leaders = ranked.slice(0, 3).map(mk);
      const laggards = ranked.slice(-3).reverse().map(mk);
      sections.set("sector_lead_lag", {
        kind: "sector_lead_lag", title: SECTION_TITLES.sector_lead_lag, status: "ok", generator: "code", feeds,
        template: `Leaders: ${leaders.map((x) => `${x.sector} {{${x.key}}}`).join(", ")}. Laggards: ${laggards.map((x) => `${x.sector} {{${x.key}}}`).join(", ")}.`,
        data: { leaders, laggards, universe: SECTOR_INDEX_SECTORS.length },
      });
      leaders.forEach((x) => nar(x.key, "sectors")); laggards.forEach((x) => nar(x.key, "sectors"));
    }
  }

  // ---- 3.8 macro and Fed (universal content; the include toggle decides whether a person sees it)
  {
    const feeds = needs("macro_fed");
    if (!ok(health, feeds)) sections.set("macro_fed", unavailable("macro_fed", feeds, health));
    else {
      const today = d.events.filter((e) => e.businessDate === businessDate);
      const rel = today.filter((e) => e.feedKey === "econ_cal" && e.payload.group === "release").sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const fmtVal = (v: unknown, unit: unknown) => {
        const n = Number(v);
        return unit === "pct" ? fmtPct(n, 1) : unit === "thousand" ? `${Math.round(n).toLocaleString("en-US")}k` : fmtLevel(n, 1);
      };
      const releases = rel.map((e, n) => {
        const base = { source: e.source, asOf: e.occurredAt, feedKey: "econ_cal" as const };
        const titleKey = `sp.mac.${n}.title`, timeKey = `sp.mac.${n}.time`;
        put(fb, { key: titleKey, label: "Release", value: null, display: e.title, unit: "text", ...base });
        put(fb, { key: timeKey, label: `${e.title} (time, ET)`, value: null, display: `${etHM(e.occurredAt)} ET`, unit: "time", ...base });
        let estKey: string | null = null, priorKey: string | null = null;
        if (e.payload.est != null) { estKey = `sp.mac.${n}.est`; put(fb, { key: estKey, label: `${e.title} consensus estimate`, value: Number(e.payload.est), display: fmtVal(e.payload.est, e.payload.unit), unit: "level", ...base }); }
        if (e.payload.prior != null) { priorKey = `sp.mac.${n}.prior`; put(fb, { key: priorKey, label: `${e.title} prior`, value: Number(e.payload.prior), display: fmtVal(e.payload.prior, e.payload.unit), unit: "level", ...base }); }
        return { titleKey, timeKey, estKey, priorKey };
      });
      const fedBase = (e: EventRow) => ({ source: e.source, asOf: e.occurredAt, feedKey: "fed_cal" as const });
      const fed: { label: string; template: string }[] = [];
      today.filter((e) => e.feedKey === "fed_cal" && e.payload.subtype === "speaker").forEach((e, n) => {
        const t = `sp.fed.s${n}.title`, tm = `sp.fed.s${n}.time`;
        put(fb, { key: t, label: "Fed speaker", value: null, display: e.title, unit: "text", ...fedBase(e) });
        put(fb, { key: tm, label: `${e.title} (time, ET)`, value: null, display: `${etHM(e.occurredAt)} ET`, unit: "time", ...fedBase(e) });
        fed.push({ label: "Today", template: `{{${t}}}, {{${tm}}}` });
        nar(t, "fed");
      });
      const ahead = d.events.find((e) => e.feedKey === "fed_cal" && e.payload.subtype === "ahead");
      if (ahead) {
        const t = "sp.fed.ahead";
        put(fb, { key: t, label: "Next data point", value: null, display: ahead.title, unit: "text", ...fedBase(ahead) });
        fed.push({ label: String(ahead.payload.day ?? weekdayShort(ahead.businessDate)), template: `{{${t}}}` });
      }
      const nf = extras.get("fed.next_fomc"), odds = extras.get("fed.hold_odds");
      if (nf && odds) {
        const base = (x: Extra) => ({ source: x.source, asOf: x.asOf, feedKey: "fed_cal" as const });
        put(fb, { key: "fed.next_fomc", label: nf.label, value: null, display: nf.text ?? "", unit: "text", ...base(nf) });
        put(fb, { key: "fed.hold_odds", label: odds.label, value: odds.value, display: `${Math.round(odds.value ?? 0)}%`, unit: "pct", hint: "market pricing", ...base(odds) });
        fed.push({ label: "Next FOMC", template: `{{fed.next_fomc}} — markets pricing {{fed.hold_odds}} odds of a hold` });
        nar("fed.hold_odds", "fed"); nar("fed.next_fomc", "fed");
      }
      if (releases.length || fed.length) {
        sections.set("macro_fed", {
          kind: "macro_fed", title: SECTION_TITLES.macro_fed, status: "ok", generator: "code", feeds,
          template: [...releases.map((r) => `{{${r.timeKey}}} {{${r.titleKey}}}${r.estKey ? ` (est. {{${r.estKey}}}${r.priorKey ? `, prior {{${r.priorKey}}}` : ""})` : ""}`), ...fed.map((f) => `${f.label}: ${f.template}`)].join("\n"),
          data: { releases, fed },
        });
      }
    }
  }

  // ---- inputs the Catalysts narrative needs beyond the tiles
  for (const [k, x] of extras) {
    if (!k.startsWith("fut.") && !k.startsWith("breadth.") && !k.startsWith("sent.")) continue;
    const display = x.unit === "pct" && k.startsWith("fut.") ? fmtPct(x.value ?? 0, 1) : x.unit === "pct" ? `${Math.round(x.value ?? 0)}%` : fmtLevel(x.value ?? 0, 2);
    const hint = k.startsWith("fut.") ? ((x.value ?? 0) >= 0 ? "higher" : "lower") : k === "breadth.top_share" ? "gains concentrated in a few large names" : k === "breadth.up_share" ? "how broad the advance is" : "positioning gauge";
    put(fb, { key: k, label: x.label, value: x.value, display, unit: x.unit === "pct" ? "pct" : "level", hint, source: x.source, asOf: x.asOf, feedKey: x.feedKey });
    nar(k, k.startsWith("fut.") ? "futures" : k.startsWith("breadth.") ? "breadth" : "sentiment");
  }

  return { businessDate, health, fb, sections, quotes, extras, sectors: d.sectors, events: d.events, narrative };
}

/** ------------------------------------------------------------------ personalised sections */
export interface PersonalInput {
  u: Universal;
  snap: Snapshot;
  prefs: BriefPrefs;
  profileId: string;
  fb: FactBook;
}

const PRODUCT_OVERNIGHT: Record<string, { sym: string; label: string }[]> = {
  "Fixed income": [{ sym: "UST5Y", label: "5Y yield" }, { sym: "UST30Y", label: "30Y yield" }, { sym: "CDXIG", label: "IG credit spreads" }],
  FX: [{ sym: "DXY", label: "US dollar index" }],
};

/** The rows of one person's brief that depend on their saved setup. Sections with nothing to show are simply not returned. */
export async function buildPersonal(db: Db, o: PersonalInput): Promise<BuiltSection[]> {
  const { u, snap, prefs, fb } = o;
  const out: BuiltSection[] = [];
  const on = (k: keyof BriefPrefs["include"]) => prefs.include[k] !== false;
  const mySectors = new Set<string>(prefs.sectors);
  const restricted = snap.restrictedInstrumentIds;
  const withheld = (kind: string, feeds: string[]) => (!ok(u.health, feeds) ? (out.push(unavailable(kind, feeds, u.health)), true) : false);
  const iso0 = (e: { occurredAt: string }) => e.occurredAt;

  // ---- overnight price moves in the person's products and sectors
  if (on("overnight")) {
    const feeds = ["mkt_snapshot", "sector_perf"];
    if (!withheld("overnight", feeds)) {
      const rows: { label: string; labelKey?: string; level: string | null; move: string; tone: "up" | "down" | "flat" }[] = [];
      for (const s of u.sectors.filter((x) => mySectors.has(x.sector))) {
        const k = `sp.sec.${keySym(s.sector)}`;
        if (!fb.has(k)) put(fb, { key: k, label: `${s.sector} sector index`, value: s.chg, display: fmtPct(s.chg), unit: "pct", source: s.source, asOf: s.asOf, feedKey: "sector_perf", hint: s.chg >= 0 ? "higher" : "lower" });
        rows.push({ label: `${s.sector} sector`, level: null, move: k, tone: tone(s.chg, 0.01) });
      }
      for (const p of prefs.products) {
        for (const t of PRODUCT_OVERNIGHT[p] ?? []) {
          const q = u.quotes.get(t.sym);
          if (!q) continue;
          const isRate = t.sym.startsWith("UST"), isCredit = t.sym.startsWith("CDX");
          const base = { source: q.source, asOf: q.asOf, feedKey: "mkt_snapshot" };
          const lk = `sp.${t.sym}.lvl`, mk = `sp.${t.sym}.sub`;
          const lvl = isRate ? `${q.last.toFixed(2)}%` : isCredit ? `${q.last.toFixed(1)}bp` : fmtLevel(q.last);
          const mv = isRate || isCredit ? fmtBp(q.chg) : fmtPct(q.chg, 2);
          if (!fb.has(lk)) put(fb, { key: lk, label: `${t.label} level`, value: q.last, display: lvl, unit: isRate ? "pct" : isCredit ? "bp" : "level", ...base });
          if (!fb.has(mk)) put(fb, { key: mk, label: `${t.label} change`, value: q.chg, display: mv, unit: isRate || isCredit ? "bp" : "pct", ...base });
          rows.push({ label: t.label, labelKey: lab(fb, `sp.${t.sym}.name`, t.label, q.asOf), level: lk, move: mk, tone: isRate || isCredit ? "flat" : tone(q.chg, 0.01) });
        }
      }
      if (prefs.products.includes("Futures") && ok(u.health, ["futures_rates"])) {
        for (const [k, label] of [["fut.spx", "Large-cap index futures"], ["fut.ndx", "Tech-growth index futures"], ["fut.rty", "Small-cap index futures"]] as const) {
          if (fb.has(k)) rows.push({ label, level: null, move: k, tone: tone(fb.get(k)?.value ?? 0, 0.01) });
        }
      }
      if (rows.length) {
        out.push({
          kind: "overnight", title: SECTION_TITLES.overnight, status: "ok", generator: "code", feeds,
          template: rows.map((r) => `${r.labelKey ? `{{${r.labelKey}}}` : r.label}${r.level ? ` {{${r.level}}}` : ""} {{${r.move}}}`).join("; "), data: { rows, products: prefs.products, sectors: prefs.sectors },
        });
      }
    }
  }

  // ---- 3.5 movers in my sectors
  if (on("movers")) {
    const feeds = needs("movers");
    if (!withheld("movers", feeds)) {
      const eq = [...snap.instruments.values()]
        .filter((i) => i.assetClass === "equity" && !restricted.has(i.id) && mySectors.has(specSectorOf(i.sector) ?? ""))
        .map((i) => ({ i, q: snap.quotes.get(i.id) }))
        .filter((x): x is { i: (typeof x)["i"]; q: NonNullable<(typeof x)["q"]> } => Boolean(x.q));
      const mk = ({ i, q }: (typeof eq)[number]) => {
        const nameKey = `nm.${keySym(i.symbol)}`, chgKey = `sp.mv.${keySym(i.symbol)}`;
        if (!fb.has(nameKey)) put(fb, { key: nameKey, label: `${i.symbol} name`, value: null, display: i.name, unit: "text", source: "Equity reference and classification (simulated)", asOf: q.asOf, feedKey: "equity_ref" });
        put(fb, { key: chgKey, label: `${i.name} move`, value: q.chg, display: fmtPct(q.chg, 1), unit: "pct", source: q.source, asOf: q.asOf, feedKey: "mkt_snapshot", hint: q.chg >= 0 ? "higher" : "lower" });
        return { symbol: i.symbol, nameKey, chgKey, sector: specSectorOf(i.sector) };
      };
      const sorted = [...eq].sort((a, b) => b.q.chg - a.q.chg);
      const leaders = sorted.filter((x) => x.q.chg > 0).slice(0, 3).map(mk);
      const laggards = sorted.filter((x) => x.q.chg < 0).slice(-3).reverse().map(mk);
      if (leaders.length || laggards.length) {
        out.push({
          kind: "movers", title: SECTION_TITLES.movers, status: "ok", generator: "code", feeds,
          template: `Leaders: ${leaders.map((x) => `{{${x.nameKey}}} {{${x.chgKey}}}`).join(", ") || "none"}. Laggards: ${laggards.map((x) => `{{${x.nameKey}}} {{${x.chgKey}}}`).join(", ") || "none"}.`,
          data: { leaders, laggards, sectors: prefs.sectors },
        });
      }
    }
  }

  // ---- 3.6 earnings this week, flagged where one of my clients holds the name
  if (on("earnings")) {
    const feeds = needs("earnings");
    if (!withheld("earnings", feeds)) {
      const wk = u.events.filter((e) => e.kind === "earnings" && e.instrumentId && !restricted.has(e.instrumentId) && e.businessDate >= u.businessDate && mySectors.has(specSectorOf(e.sector) ?? ""));
      const items = wk.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).slice(0, 8);
      if (items.length) {
        const ids = items.map((e) => e.instrumentId!);
        const sectors = [...new Set(items.map((e) => e.sector).filter((s): s is string => Boolean(s)))];
        // Client-level facts are read as the salesperson, so row-level security decides which clients they may see.
        const mine = await db.asUser(o.profileId, async (q) => ({
          holders: await q(`select p.instrument_id, c.id, c.short_name from positions p join clients c on c.id = p.client_id where p.instrument_id = any($1::uuid[]) order by p.notional_usd desc`, [ids]),
          interested: await q(`select ci.tag, c.id, c.short_name from client_interests ci join clients c on c.id = ci.client_id where ci.tag = any($1::text[]) order by ci.weight desc`, [sectors]),
        }));
        const bookAsOf = new Date(`${u.businessDate}T08:00:00Z`).toISOString();
        const clientFact = (id: string, name: string) => {
          const key = `sp.cl.${uid(id).slice(0, 8)}`;
          if (!fb.has(key)) put(fb, { key, label: "Client", value: null, display: name, unit: "text", source: "CRM (coverage book, your clients only)", asOf: bookAsOf, feedKey: "crm_book" });
          return key;
        };
        const rows = items.map((e, n) => {
          const nameKey = `nm.${keySym(e.symbol ?? String(n))}`;
          if (!fb.has(nameKey)) put(fb, { key: nameKey, label: `${e.symbol} name`, value: null, display: e.name ?? "", unit: "text", source: "Equity reference and classification (simulated)", asOf: e.occurredAt, feedKey: "equity_ref" });
          const dayKey = `sp.e${n}.day`;
          put(fb, { key: dayKey, label: `${e.name} reporting day`, value: null, display: weekdayShort(e.businessDate).toUpperCase(), unit: "text", source: e.source, asOf: e.occurredAt, feedKey: "earnings_cal" });
          const timing = e.payload.timing === "bmo" ? "before the open" : "after the close";
          const holders = mine.holders.filter((h) => String(h.instrument_id) === e.instrumentId);
          const names = [...new Map(holders.map((h) => [String(h.id), String(h.short_name)])).entries()];
          let note: string;
          let flagged: string[] = [];
          if (names.length) {
            const keys = names.slice(0, 2).map(([id, nm]) => clientFact(id, nm));
            flagged = names.map(([id]) => id);
            const more = names.length - keys.length;
            let moreKey = "";
            if (more > 0) { moreKey = `sp.e${n}.more`; put(fb, { key: moreKey, label: "Further clients holding the name", value: more, display: String(more), unit: "count", source: "CRM (coverage book, your clients only)", asOf: bookAsOf, feedKey: "crm_book" }); }
            note = keys.length === 1 && !more ? `{{${keys[0]}}} holds an active position` : more ? `${keys.map((k) => `{{${k}}}`).join(", ")}, plus {{${moreKey}}} more, hold active positions` : `${keys.map((k) => `{{${k}}}`).join(" and ")} hold active positions`;
          } else {
            const int = mine.interested.find((x) => String(x.tag) === e.sector);
            note = int ? `no current client positions, {{${clientFact(String(int.id), String(int.short_name))}}} has flagged interest` : "no current client positions";
          }
          return { dayKey, nameKey, symbol: e.symbol, timing, noteTemplate: note, heldBy: flagged.length };
        });
        out.push({
          kind: "earnings", title: SECTION_TITLES.earnings, status: "ok", generator: "code", feeds,
          template: rows.map((r) => `{{${r.dayKey}}} {{${r.nameKey}}} reports ${r.timing} — ${r.noteTemplate}.`).join("\n"), data: { items: rows, sectors: prefs.sectors },
        });
      }
    }
  }

  // ---- 3.7 breaking news, filtered and ranked by the person's sectors and products
  if (on("news")) {
    const feeds = needs("news");
    if (!withheld("news", feeds)) {
      const mineP = new Set(prefs.products);
      const scored = u.events
        .filter((e) => e.feedKey === "news_agg" && e.businessDate === u.businessDate && !(e.instrumentId && restricted.has(e.instrumentId)))
        .map((e) => {
          const spec = specSectorOf(e.sector);
          const sectorHit = Boolean(spec && mySectors.has(spec));
          const productHit = e.products.some((p) => mineP.has(p));
          const marketWide = !e.sector;
          const include = sectorHit || (marketWide && productHit);
          const score = e.severity * 2 + (sectorHit ? 3 : 0) + (productHit ? 2 : 0);
          return { e, spec, sectorHit, productHit, include, score };
        })
        .filter((x) => x.include)
        .sort((a, b) => b.score - a.score || b.e.occurredAt.localeCompare(a.e.occurredAt))
        .slice(0, 6);
      if (scored.length) {
        const rows = scored.map(({ e, spec, sectorHit, productHit }, n) => {
          const titleKey = `sp.news.${n}.title`;
          put(fb, { key: titleKey, label: "Headline", value: null, display: e.title, unit: "text", source: e.source, asOf: e.occurredAt, feedKey: "news_agg" });
          const why = sectorHit ? `relevant given your ${spec!.toLowerCase()} coverage` : productHit ? `relevant to your ${e.products.find((p) => mineP.has(p))!.toLowerCase()} business` : "market-wide";
          return { titleKey, why, sector: spec, tags: e.tags.filter((t) => !/^[A-Z]{3,5}$/.test(t)).slice(0, 3), products: e.products };
        });
        out.push({ kind: "news", title: SECTION_TITLES.news, status: "ok", generator: "code", feeds, template: rows.map((r) => `{{${r.titleKey}}} — ${r.why}`).join("\n"), data: { items: rows } });
      }
    }
  }

  // ---- macro and Fed (universal content, shown when the toggle is on)
  if (on("macro")) {
    const m = u.sections.get("macro_fed");
    if (m) out.push(m);
  }

  // ---- 3.9 dividend announcements in my sectors
  if (on("dividends")) {
    const feeds = needs("dividends");
    if (!withheld("dividends", feeds)) {
      const items = u.events.filter((e) => e.feedKey === "corp_actions" && e.payload.type === "dividend" && e.instrumentId && !restricted.has(e.instrumentId) && mySectors.has(specSectorOf(e.sector) ?? ""));
      if (items.length) {
        const rows = items.slice(0, 5).map((e, n) => {
          const nameKey = `nm.${keySym(e.symbol ?? String(n))}`;
          if (!fb.has(nameKey)) put(fb, { key: nameKey, label: `${e.symbol} name`, value: null, display: e.name ?? "", unit: "text", source: "Equity reference and classification (simulated)", asOf: e.occurredAt, feedKey: "equity_ref" });
          const a = Number(e.payload.amount), p = Number(e.payload.prior);
          const amountKey = `sp.div.${n}.amt`, priorKey = `sp.div.${n}.prior`;
          put(fb, { key: amountKey, label: `${e.name} dividend`, value: a, display: `${fmtUsd(a)}/share`, unit: "usd", source: e.source, asOf: e.occurredAt, feedKey: "corp_actions" });
          put(fb, { key: priorKey, label: `${e.name} prior dividend`, value: p, display: fmtUsd(p), unit: "usd", source: e.source, asOf: e.occurredAt, feedKey: "corp_actions" });
          return { nameKey, amountKey, priorKey, change: a > p ? "up" : a < p ? "down" : "unchanged" };
        });
        out.push({
          kind: "dividends", title: SECTION_TITLES.dividends, status: "ok", generator: "code", feeds,
          template: rows.map((r) => `{{${r.nameKey}}} declares {{${r.amountKey}}} quarterly dividend${r.change === "unchanged" ? ", unchanged" : `, ${r.change} from {{${r.priorKey}}}`}.`).join("\n"), data: { items: rows },
        });
      }
    }
  }

  // ---- 3.10 index rebalance and reconstitution, for equity-type products
  if (on("index_rebalance")) {
    const feeds = needs("index_rebalance");
    if (!withheld("index_rebalance", feeds) && prefs.products.some((p) => ["Equities", "Levered ETFs"].includes(p))) {
      const items = u.events.filter((e) => e.feedKey === "index_cal");
      if (items.length) {
        const rows = items.map((e, n) => {
          const titleKey = `sp.idx.${n}.title`;
          put(fb, { key: titleKey, label: "Index event", value: null, display: e.title, unit: "text", source: e.source, asOf: iso0(e), feedKey: "index_cal" });
          return { titleKey, note: e.summary };
        });
        out.push({ kind: "index_rebalance", title: SECTION_TITLES.index_rebalance, status: "ok", generator: "code", feeds, template: rows.map((r) => `{{${r.titleKey}}} — ${r.note}`).join("\n"), data: { items: rows } });
      }
    }
  }

  return out;
}

/** The fixed order of sections on the page, with universal sections first. */
export const sectionPosition = (kind: string) => {
  const i = (SECTION_ORDER as readonly string[]).indexOf(kind);
  return i < 0 ? 50 : i + 1;
};
