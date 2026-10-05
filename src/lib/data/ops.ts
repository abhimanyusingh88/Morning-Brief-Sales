/**
 * Data access for the three operations pages (Data feeds, QC review, Deliveries) and the hold/release actions.
 * Reads run as the signed-in person, so row-level security decides what an ops role can see (a desk head sees their
 * own desk's briefs, compliance and admin see everyone's). Only the hold/release writes use the service role, after the
 * role and visibility checks in `reviewBrief`.
 */
import type { Db } from "../db/types";
import type { Role } from "../auth/session";
import { SECTION_ORDER, type BuiltSection } from "../brief/build";
import { renderDigest } from "../brief/digest";
import { loadAllPrefs } from "../brief/prefs";
import { defaultPrefs, type Delivery } from "../brief/spec";
import { FEEDS, SECTION_FEEDS, type FeedDef } from "../feeds/registry";
import { publishedAt } from "../pipeline/persist";
import { REVIEWER, type QcCheck } from "../pipeline/qc";
import { etInstant } from "../util/time";

export type { QcCheck };

// ------------------------------------------------------------------------------------------------ access

export const OPS_ROLES: readonly Role[] = ["desk_head", "admin", "compliance"];
export const isOpsRole = (r: Role | undefined | null): boolean => !!r && OPS_ROLES.includes(r);

const iso = (x: unknown): string => new Date(x as string).toISOString();
const isoOrNull = (x: unknown): string | null => (x == null ? null : iso(x));

// ------------------------------------------------------------------------------------------------ runs

export interface RunRef { id: string; businessDate: string; status: string; trigger: string; startedAt: string; finishedAt: string | null }

const toRun = (r: Record<string, unknown>): RunRef => ({
  id: String(r.id), businessDate: String(r.bd), status: String(r.status), trigger: String(r.trigger), startedAt: iso(r.started_at), finishedAt: isoOrNull(r.finished_at),
});

/** Recent runs that still own briefs (a rerun for the same date takes over the briefs, so older runs drop out). */
export async function listRunsWithBriefs(db: Db, meId: string, limit = 8): Promise<RunRef[]> {
  const rows = await db.asUser(meId, (q) => q(
    `select r.id, r.business_date::text bd, r.status, r.trigger, r.started_at, r.finished_at
       from pipeline_runs r where exists (select 1 from briefs b where b.run_id = r.id) order by r.started_at desc limit $1`, [limit]));
  return rows.map(toRun);
}

/** The requested run if it is in the list, otherwise the newest. */
export const pickRun = <T extends { id: string }>(runs: T[], requested?: string | null): T | null => runs.find((r) => r.id === requested) ?? runs[0] ?? null;

// ------------------------------------------------------------------------------------------------ feeds

export type FeedStatus = "ok" | "delayed" | "down" | "running";
export type Tone = "ok" | "warn" | "bad" | "idle" | "run";

export interface Freshness { tone: Tone; label: string; detail: string }

const fmtDur = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
};

/** Newest record against the feed's SLA. The connector's own verdict (status) is authoritative; this explains it. */
export function freshnessOf(def: Pick<FeedDef, "slaTime" | "maxAgeMin">, run: { status: FeedStatus; asOf: string | null } | null, businessDate: string): Freshness {
  if (!run) return { tone: "idle", label: "No run", detail: "" };
  if (run.status === "running") return { tone: "run", label: "Running", detail: "" };
  if (run.status === "down") return { tone: "bad", label: "No data", detail: `SLA ${def.slaTime} ET missed` };
  const [hh, mm] = def.slaTime.split(":").map(Number);
  const sla = etInstant(businessDate, hh, mm).getTime();
  const open = etInstant(businessDate, 4, 0).getTime();
  const asOf = run.asOf ? new Date(run.asOf).getTime() : null;
  if (run.status === "delayed") {
    return { tone: "warn", label: "Stale", detail: asOf == null ? `limit ${fmtDur(def.maxAgeMin)}` : `newest record ${fmtDur((open - asOf) / 60000)} old, limit ${fmtDur(def.maxAgeMin)}` };
  }
  if (asOf == null) return { tone: "ok", label: "Within SLA", detail: "" };
  const sameDay = new Date(asOf).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) === businessDate;
  if (sameDay && asOf <= sla) return { tone: "ok", label: "Within SLA", detail: `${fmtDur((sla - asOf) / 60000)} to spare` };
  return { tone: "ok", label: "Within SLA", detail: sameDay ? "" : "prior-session data" };
}

export interface SectionState { kind: string; label: string; required: string[]; withheld: boolean; because: string[] }

/** A section is withheld when any feed it requires is not healthy: the same rule the pipeline applies. */
export function sectionStates(health: Record<string, string>): SectionState[] {
  return Object.entries(SECTION_FEEDS).map(([kind, s]) => {
    const because = s.required.filter((f) => (health[f] ?? "ok") !== "ok");
    return { kind, label: s.label, required: s.required, withheld: because.length > 0, because };
  });
}

/** What a real integration needs, in generic terms. No vendor, publisher or data provider is named. */
export const PRODUCTION_ADAPTER: Record<string, { type: string; needs: string[] }> = {
  mkt_snapshot: { type: "Market-data vendor streaming API", needs: ["Entitled pre-market subscription covering indices, volatility, metals, crude, rates and credit", "Service credentials with agreed session and rate limits", "Symbol map from the vendor's identifiers to the firm's security master"] },
  idx_history: { type: "Market-data vendor historical-bars API", needs: ["Daily-close history entitlement for the benchmark index, ten sessions minimum", "Exchange holiday and half-day calendar", "Service credentials"] },
  sector_perf: { type: "Index-provider performance API", needs: ["Licence for the eleven sector indices", "Service credentials", "Agreed publication time for the prior session's change"] },
  equity_ref: { type: "Reference-data vendor file delivery", needs: ["Secure file-drop account and key exchange", "Classification licence covering sector, industry and product tags", "Daily load check against the security master"] },
  futures_rates: { type: "Derivatives and positioning data API", needs: ["Overnight futures, breadth and sentiment entitlement", "Service credentials", "Fair-value convention agreed with the desk"] },
  earnings_cal: { type: "Corporate-calendar vendor API", needs: ["Weekly earnings calendar entitlement", "Service credentials", "Ticker mapping to the security master"] },
  econ_cal: { type: "Economic-calendar vendor API", needs: ["Release schedule with consensus estimate and prior value", "Service credentials", "Revision handling rules"] },
  fed_cal: { type: "Public policy-calendar collector and rates-implied probability source", needs: ["Collector for the central bank's public calendar", "Rate-path probabilities from a rates-market data licence", "Service credentials for the probability source"] },
  news_agg: { type: "News-aggregator streaming API", needs: ["Overnight headline licence with sector, ticker and product tagging", "Service credentials", "Display and redistribution terms signed off by compliance"] },
  corp_actions: { type: "Corporate-actions vendor API", needs: ["Dividend declaration entitlement", "Service credentials", "Prior-amount history to compute the change"] },
  index_cal: { type: "Index-provider events calendar API", needs: ["Rebalance and reconstitution calendar licence", "Service credentials", "Effective-date conventions per index"] },
  crm_book: { type: "CRM read replica credentials", needs: ["Read-only role on the replica, never the primary", "Row-level security driven by each salesperson's own identity", "Coverage, position and interaction tables mapped to the client model"] },
  restricted: { type: "Compliance system API", needs: ["Service identity approved by compliance", "Restricted-list refresh at least every fifteen minutes", "Alerting when the list cannot be read (fail closed)"] },
  email_relay: { type: "SMTP relay credentials", needs: ["Authenticated relay account on the firm's mail domain", "Recipient allow-list limited to salespeople", "Bounce and delivery-status callbacks"] },
};

export interface FeedRunView {
  status: FeedStatus;
  startedAt: string;
  finishedAt: string | null;
  rows: number;
  latencyMs: number | null;
  asOf: string | null;
  detail: Record<string, unknown>;
  sample: unknown;
  log: string[];
}
export interface FeedHistoryItem { runId: string; businessDate: string; status: FeedStatus; rows: number; latencyMs: number | null; startedAt: string }
export interface FeedDependent { key: string; label: string; gated: boolean; withheld: boolean }
export interface FeedView {
  def: FeedDef;
  run: FeedRunView | null;
  freshness: Freshness;
  /** where the last run stored what it fetched */
  stored: string;
  /** credential scope as logged by the connector */
  authScope: string | null;
  adapter: { type: string; needs: string[] };
  dependents: FeedDependent[];
  history: FeedHistoryItem[];
}
export interface FeedsView {
  run: RunRef | null;
  feeds: FeedView[];
  stats: { healthy: number; total: number; rows: number; slowest: { name: string; latencyMs: number } | null; withheld: { count: number; total: number; labels: string[] } };
}

const OTHER_DEPENDENTS: Record<string, string> = { all: "Every section (information barrier)", delivery: "Email digest delivery", cards: "Call cards" };

export function dependentsOf(feedKey: string, def: FeedDef, states: SectionState[]): FeedDependent[] {
  const out = new Map<string, FeedDependent>();
  for (const s of states) if (s.required.includes(feedKey)) out.set(s.kind, { key: s.kind, label: s.label, gated: true, withheld: s.withheld });
  for (const k of def.sections) {
    if (out.has(k)) continue;
    const known = SECTION_FEEDS[k]?.label ?? OTHER_DEPENDENTS[k];
    if (known) out.set(k, { key: k, label: known, gated: false, withheld: false });
  }
  return [...out.values()];
}

/** The connector registry as of the newest run that recorded feed activity. */
export async function getFeedsView(db: Db, meId: string): Promise<FeedsView> {
  return db.asUser(meId, async (q) => {
    const runRow = (await q(
      `select r.id, r.business_date::text bd, r.status, r.trigger, r.started_at, r.finished_at from pipeline_runs r
        where exists (select 1 from feed_runs f where f.run_id = r.id) order by r.started_at desc limit 1`))[0];
    const empty = { healthy: 0, total: FEEDS.length, rows: 0, slowest: null, withheld: { count: 0, total: Object.keys(SECTION_FEEDS).length, labels: [] } };
    if (!runRow) return { run: null, feeds: [], stats: empty };
    const run = toRun(runRow);
    const [cur, hist] = await Promise.all([
      q(`select feed_key, status, started_at, finished_at, rows, latency_ms, as_of, detail, sample, log from feed_runs where run_id = $1`, [run.id]),
      q(`select h.feed_key, h.run_id, h.bd, h.status, h.rows, h.latency_ms, h.started_at
           from (select f.feed_key, f.run_id, r.business_date::text bd, f.status, f.rows, f.latency_ms, f.started_at,
                        row_number() over (partition by f.feed_key order by f.started_at desc) rn
                   from feed_runs f join pipeline_runs r on r.id = f.run_id) h
          where h.rn <= 5 order by h.feed_key, h.rn`),
    ]);
    const byKey = new Map(cur.map((r) => [String(r.feed_key), r]));
    const health = Object.fromEntries(cur.map((r) => [String(r.feed_key), String(r.status)]));
    const states = sectionStates(health);

    const feeds: FeedView[] = FEEDS.map((def) => {
      const r = byKey.get(def.key);
      const runView: FeedRunView | null = r ? {
        status: r.status as FeedStatus, startedAt: iso(r.started_at), finishedAt: isoOrNull(r.finished_at), rows: Number(r.rows), latencyMs: r.latency_ms == null ? null : Number(r.latency_ms),
        asOf: isoOrNull(r.as_of), detail: (r.detail as Record<string, unknown>) ?? {}, sample: r.sample ?? [], log: (r.log as string[]) ?? [],
      } : null;
      const scope = runView?.log.map((l) => /^auth\s.*scope\s+(\S+)/.exec(l)?.[1]).find(Boolean) ?? null;
      return {
        def, run: runView, freshness: freshnessOf(def, runView, run.businessDate),
        stored: String(runView?.detail.store ?? "—"), authScope: scope ?? null,
        adapter: PRODUCTION_ADAPTER[def.key] ?? { type: "Vendor adapter", needs: [] },
        dependents: dependentsOf(def.key, def, states),
        history: hist.filter((h) => h.feed_key === def.key).map((h) => ({ runId: String(h.run_id), businessDate: String(h.bd), status: h.status as FeedStatus, rows: Number(h.rows), latencyMs: h.latency_ms == null ? null : Number(h.latency_ms), startedAt: iso(h.started_at) })),
      };
    });

    const timed = feeds.flatMap((f) => (f.run?.latencyMs != null ? [{ name: f.def.name, latencyMs: f.run.latencyMs }] : []));
    const withheld = states.filter((s) => s.withheld);
    return {
      run,
      feeds,
      stats: {
        healthy: feeds.filter((f) => f.run?.status === "ok").length, total: feeds.length, rows: feeds.reduce((a, f) => a + (f.run?.rows ?? 0), 0),
        slowest: timed.sort((a, b) => b.latencyMs - a.latencyMs)[0] ?? null,
        withheld: { count: withheld.length, total: states.length, labels: withheld.map((s) => s.label) },
      },
    };
  });
}

// ------------------------------------------------------------------------------------------------ QC

export interface SpotReviewRow { id: string; status: "passed" | "flagged" | "pending"; reviewer: string | null; notes: string | null; checks: QcCheck[]; at: string }
export interface QcRow {
  briefId: string;
  profileId: string;
  name: string;
  title: string;
  desk: string | null;
  businessDate: string;
  status: "draft" | "published";
  qcStatus: "pending" | "passed" | "flagged";
  generatedAt: string;
  publishedAt: string | null;
  automated: { status: string; checks: QcCheck[] } | null;
  /** every human review event, oldest first (the pipeline's sampled reviewer, then any manual hold or release) */
  reviews: SpotReviewRow[];
  /** picked by the pipeline for the reviewer's sample */
  sampled: boolean;
  held: boolean;
}
export interface QcSummary { checked: number; passed: number; held: number; pending: number; sampled: number; sampledPassed: number; sampledFlagged: number; automatedFailed: number }
export interface QcView { run: RunRef | null; runs: RunRef[]; rows: QcRow[]; checkColumns: { name: string; label: string }[]; summary: QcSummary }

export function summariseQc(rows: QcRow[]): QcSummary {
  const sampled = rows.filter((r) => r.sampled);
  return {
    checked: rows.length,
    passed: rows.filter((r) => r.qcStatus === "passed").length,
    held: rows.filter((r) => r.qcStatus === "flagged").length,
    pending: rows.filter((r) => r.qcStatus === "pending").length,
    sampled: sampled.length,
    sampledPassed: sampled.filter((r) => r.reviews.at(-1)?.status === "passed").length,
    sampledFlagged: sampled.filter((r) => r.reviews.at(-1)?.status === "flagged").length,
    automatedFailed: rows.filter((r) => r.automated?.status === "flagged").length,
  };
}

/** Column set for the matrix, read from the stored checks (first appearance order), never hard-coded. */
export function checkColumns(rows: QcRow[]): { name: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) for (const c of r.automated?.checks ?? []) if (!seen.has(c.name)) seen.set(c.name, c.label);
  return [...seen].map(([name, label]) => ({ name, label }));
}

export async function getQcView(db: Db, meId: string, requestedRun?: string | null): Promise<QcView> {
  const runs = await listRunsWithBriefs(db, meId);
  const run = pickRun(runs, requestedRun);
  if (!run) return { run: null, runs, rows: [], checkColumns: [], summary: summariseQc([]) };
  const [briefs, reviews] = await db.asUser(meId, (q) => Promise.all([
    q(`select b.id, b.profile_id, p.full_name, p.title, d.name desk, b.business_date::text bd, b.status, b.qc_status, b.generated_at, b.published_at
         from briefs b join profiles p on p.id = b.profile_id left join desks d on d.id = p.desk_id where b.run_id = $1 order by p.full_name`, [run.id]),
    q(`select id, brief_id, kind, status, checks, reviewer, notes, coalesce(reviewed_at, created_at) at from qc_reviews where run_id = $1 order by created_at, id`, [run.id]),
  ]));
  const rows: QcRow[] = briefs.map((b) => {
    const mine = reviews.filter((r) => String(r.brief_id) === String(b.id));
    const auto = mine.filter((r) => r.kind === "automated").at(-1);
    const spots: SpotReviewRow[] = mine.filter((r) => r.kind === "spot_check").map((r) => ({ id: String(r.id), status: r.status as SpotReviewRow["status"], reviewer: (r.reviewer as string) ?? null, notes: (r.notes as string) ?? null, checks: (r.checks as QcCheck[]) ?? [], at: iso(r.at) }));
    return {
      briefId: String(b.id), profileId: String(b.profile_id), name: String(b.full_name), title: String(b.title), desk: (b.desk as string) ?? null, businessDate: String(b.bd),
      status: b.status as QcRow["status"], qcStatus: b.qc_status as QcRow["qcStatus"], generatedAt: iso(b.generated_at), publishedAt: isoOrNull(b.published_at),
      automated: auto ? { status: String(auto.status), checks: (auto.checks as QcCheck[]) ?? [] } : null,
      reviews: spots, sampled: spots.some((s) => s.reviewer === REVIEWER), held: b.qc_status === "flagged",
    };
  });
  return { run, runs, rows, checkColumns: checkColumns(rows), summary: summariseQc(rows) };
}

// ------------------------------------------------------------------------------------------------ a brief, as the salesperson sees it

export interface ReviewSection { id: string; kind: string; position: number; title: string; template: string; status: "ok" | "unavailable"; note: string | null; generator: string; factKeys: string[] }
export interface ReviewFact { key: string; label: string; display: string; unit?: string; source: string; asOf: string }
export interface BriefReview {
  previewHtml: string;
  brief: { id: string; profileId: string; name: string; title: string; desk: string | null; businessDate: string; status: string; qcStatus: string; headline: string; generatedAt: string; publishedAt: string | null; version: number };
  sections: ReviewSection[];
  facts: Record<string, ReviewFact>;
}

/** Read as the signed-in ops person: brief_sections and brief_facts are readable through app.sees_profile. */
export async function getBriefForReview(db: Db, meId: string, briefId: string): Promise<BriefReview | null> {
  return db.asUser(meId, async (q) => {
    const b = (await q(
      `select b.id, b.profile_id, p.full_name, p.title, d.name desk, b.business_date::text bd, b.status, b.qc_status, b.headline, b.generated_at, b.published_at, b.version
         from briefs b join profiles p on p.id = b.profile_id left join desks d on d.id = p.desk_id where b.id = $1`, [briefId]))[0];
    if (!b) return null;
    const secs = await q(`select id, kind, position, title, body_template, data, status, note, generator, fact_keys from brief_sections where brief_id = $1 order by position, id`, [briefId]);
    const keys = [...new Set(secs.flatMap((s) => (s.fact_keys as string[]) ?? []))];
    const facts = keys.length ? await q(`select key, label, display, unit, source, as_of from brief_facts where brief_id = $1 and key = any($2::text[])`, [briefId, keys]) : [];
    const [email] = await q<{ html: string }>(`select html from deliveries where brief_id = $1 and channel = 'email' and html is not null order by scheduled_for desc limit 1`, [briefId]);
    const sections: BuiltSection[] = secs.filter(s => (SECTION_ORDER as readonly string[]).includes(String(s.kind))).map(s => ({
      kind: String(s.kind), title: String(s.title), status: s.status as BuiltSection["status"], note: (s.note as string) ?? undefined,
      template: String(s.body_template ?? ""), data: (s.data as Record<string, unknown>) ?? {}, generator: s.generator as BuiltSection["generator"], feeds: [],
    }));
    const list = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
    const sectors = sections.map(s => list(s.data.sectors)).find(values => values.length) ?? [];
    const products = sections.map(s => list(s.data.products)).find(values => values.length) ?? [];
    const previewHtml = email?.html ?? renderDigest({
      name: String(b.full_name), date: String(b.bd), dateLabel: `${String(b.bd)} · ${b.published_at ? new Date(b.published_at as string).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }) + ' ET' : 'Pending quality review'}`,
      sectors, products, oneLine: String(sections.find(s => s.kind === 'catalysts')?.data.oneLine ?? ''), sections,
      facts: Object.fromEntries(facts.map(f => [String(f.key), { display: String(f.display), unit: f.unit ? String(f.unit) : undefined }])),
      generatedAt: `Generated ${new Date(b.generated_at as string).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`,
    }).html;
    return {
      previewHtml,
      brief: { id: String(b.id), profileId: String(b.profile_id), name: String(b.full_name), title: String(b.title), desk: (b.desk as string) ?? null, businessDate: String(b.bd), status: String(b.status), qcStatus: String(b.qc_status), headline: String(b.headline ?? ""), generatedAt: iso(b.generated_at), publishedAt: isoOrNull(b.published_at), version: Number(b.version) },
      sections: secs.map((s) => ({ id: String(s.id), kind: String(s.kind), position: Number(s.position), title: String(s.title), template: String(s.body_template ?? ""), status: s.status as ReviewSection["status"], note: (s.note as string) ?? null, generator: String(s.generator), factKeys: (s.fact_keys as string[]) ?? [] })),
      facts: Object.fromEntries(facts.map((f) => [String(f.key), { key: String(f.key), label: String(f.label), display: String(f.display), unit: f.unit ? String(f.unit) : undefined, source: String(f.source), asOf: iso(f.as_of) }])),
    };
  });
}

// ------------------------------------------------------------------------------------------------ hold / release

export class OpsError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type QcAction = "hold" | "release";
export interface ReviewOutcome { briefId: string; action: QcAction; status: "draft" | "published"; qcStatus: "flagged" | "passed"; publishedAt: string | null; deliveries: { channel: string; status: string }[] }

const dateLabel = (businessDate: string, sendTime: string) =>
  `${new Date(`${businessDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} · ${sendTime} ET`;

const SPEC_KINDS = new Set<string>(SECTION_ORDER);

/**
 * Hold or release one brief (spec section 5, QC review). Callers pass the verified person; the role is checked here as well.
 * A held brief is a draft: no dashboard page and no email digest exist for it. Releasing publishes it at the salesperson's
 * own send time on the business date and writes the deliveries their delivery setting asks for.
 */
export async function reviewBrief(db: Db, me: { id: string; fullName: string; role: Role }, briefId: string, action: QcAction, note?: string): Promise<ReviewOutcome> {
  if (!isOpsRole(me.role)) throw new OpsError(403, "not allowed");
  const text = note?.trim() ? note.trim().slice(0, 1000) : null;

  // visibility first, as the person: a desk head cannot act on another desk's brief
  const seen = await db.asUser(me.id, (q) => q(`select id from briefs where id = $1`, [briefId]));
  if (!seen.length) throw new OpsError(404, "brief not found");

  const b = (await db.asService((q) => q(
    `select b.id, b.profile_id, b.run_id, b.business_date::text bd, b.status, b.qc_status, b.generated_at, b.data_status, b.headline, p.email, p.full_name
       from briefs b join profiles p on p.id = b.profile_id where b.id = $1`, [briefId])))[0];
  if (!b) throw new OpsError(404, "brief not found");
  const profileId = String(b.profile_id);
  const businessDate = String(b.bd);

  if (action === "hold" && b.qc_status === "flagged") throw new OpsError(409, "this brief is already held");
  if (action === "release" && b.status === "published" && b.qc_status === "passed") throw new OpsError(409, "this brief is already published");

  const detail = { note: text, businessDate, profileId, previous: { status: b.status, qcStatus: b.qc_status } };
  const prior = (await db.asService((q) => q(`select checks from qc_reviews where brief_id = $1 and kind = 'spot_check' order by created_at desc, id desc limit 1`, [briefId])))[0];
  const carried = ((prior?.checks as QcCheck[] | undefined) ?? []).filter((c) => c.name !== "manual_decision");
  const decision: QcCheck = { name: "manual_decision", label: action === "hold" ? "Held by a reviewer" : "Released by a reviewer", ok: action === "release", detail: text ?? (action === "hold" ? "No reason given" : "No note") };
  const reviewRow = { status: action === "hold" ? "flagged" : "passed", checks: [...carried, decision], notes: text ?? (action === "hold" ? "Held by reviewer." : "Released by reviewer.") };

  if (action === "hold") {
    await db.asService(async (q) => {
      await q(`update briefs set qc_status = 'flagged', status = 'draft', published_at = null where id = $1`, [briefId]);
      await q(`delete from deliveries where brief_id = $1`, [briefId]);
      await q(`insert into qc_reviews (run_id, brief_id, profile_id, kind, status, checks, reviewer, notes, reviewed_at) values ($1, $2, $3, 'spot_check', $4, $5::jsonb, $6, $7, now())`,
        [b.run_id, briefId, profileId, reviewRow.status, JSON.stringify(reviewRow.checks), me.fullName, reviewRow.notes]);
      await q(`insert into audit_log (actor_id, action, object_type, object_id, detail) values ($1, 'qc.hold', 'brief', $2, $3::jsonb)`, [me.id, briefId, JSON.stringify(detail)]);
    });
    return { briefId, action, status: "draft", qcStatus: "flagged", publishedAt: null, deliveries: [] };
  }

  // release: everything that reads other tables happens before the write transaction
  const prefs = (await loadAllPrefs(db, businessDate, [profileId])).get(profileId)!;
  const at = publishedAt(businessDate, profileId, prefs.sendTime);
  const wantsEmail = prefs.delivery !== "dashboard";
  let email: { status: string; html: string | null; subject: string | null; detail: Record<string, unknown> } | null = null;
  if (wantsEmail) {
    const relayOk = ((b.data_status as { feeds?: Record<string, string> } | null)?.feeds?.email_relay ?? "ok") === "ok";
    if (!relayOk) email = { status: "failed", html: null, subject: null, detail: { error: "relay unavailable (SMTP 421); will retry at the next window" } };
    else {
      const [secs, facts] = await db.asService((q) => Promise.all([
        q(`select kind, title, status, note, body_template, data, generator from brief_sections where brief_id = $1 order by position, id`, [briefId]),
        q(`select key, display, unit from brief_facts where brief_id = $1`, [briefId]),
      ]));
      const sections: BuiltSection[] = secs.filter((s) => SPEC_KINDS.has(String(s.kind))).map((s) => ({
        kind: String(s.kind), title: String(s.title), status: s.status as BuiltSection["status"], note: (s.note as string) ?? undefined, template: String(s.body_template ?? ""),
        data: (s.data as Record<string, unknown>) ?? {}, generator: s.generator as BuiltSection["generator"], feeds: [],
      }));
      const cat = sections.find((s) => s.kind === "catalysts");
      const d = renderDigest({
        name: String(b.full_name), date: businessDate, dateLabel: dateLabel(businessDate, prefs.sendTime), sectors: prefs.sectors, products: prefs.products, oneLine: (cat?.data.oneLine as string) ?? "",
        sections, facts: Object.fromEntries(facts.map((f) => [String(f.key), { display: String(f.display), unit: f.unit ? String(f.unit) : undefined }])),
        generatedAt: `Generated ${new Date(b.generated_at as string).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`,
      });
      email = { status: "simulated", html: d.html, subject: d.subject, detail: { bytes: d.html.length, relay: "relay.internal.sim", recipients: 1, text: d.text.slice(0, 4000), releasedAfterHold: true } };
    }
  }
  const rows: { channel: string; status: string; delivered: string | null; to: string | null; subject: string | null; html: string | null; detail: Record<string, unknown> }[] = [];
  if (prefs.delivery !== "email") rows.push({ channel: "dashboard", status: "delivered", delivered: at, to: null, subject: null, html: null, detail: { url: "/brief", releasedBy: me.fullName } });
  if (email) rows.push({ channel: "email", status: email.status, delivered: email.status === "failed" ? null : at, to: String(b.email), subject: email.subject, html: email.html, detail: email.detail });

  await db.asService(async (q) => {
    await q(`update briefs set qc_status = 'passed', status = 'published', published_at = $2::timestamptz where id = $1`, [briefId, at]);
    await q(`delete from deliveries where brief_id = $1`, [briefId]);
    if (rows.length) await q(
      `insert into deliveries (run_id, brief_id, profile_id, channel, status, scheduled_for, delivered_at, to_address, subject, html, detail)
       select $1, $2, $3, x->>'channel', x->>'status', $4::timestamptz, nullif(x->>'delivered','')::timestamptz, x->>'to', x->>'subject', x->>'html', x->'detail' from jsonb_array_elements($5::jsonb) x`,
      [b.run_id, briefId, profileId, at, JSON.stringify(rows)]);
    await q(`insert into qc_reviews (run_id, brief_id, profile_id, kind, status, checks, reviewer, notes, reviewed_at) values ($1, $2, $3, 'spot_check', $4, $5::jsonb, $6, $7, now())`,
      [b.run_id, briefId, profileId, reviewRow.status, JSON.stringify(reviewRow.checks), me.fullName, reviewRow.notes]);
    await q(`insert into audit_log (actor_id, action, object_type, object_id, detail) values ($1, 'qc.release', 'brief', $2, $3::jsonb)`, [me.id, briefId, JSON.stringify({ ...detail, publishedAt: at })]);
  });
  return { briefId, action, status: "published", qcStatus: "passed", publishedAt: at, deliveries: rows.map((r) => ({ channel: r.channel, status: r.status })) };
}

// ------------------------------------------------------------------------------------------------ deliveries

export interface DeliveryRow {
  id: string;
  briefId: string | null;
  profileId: string;
  name: string;
  desk: string | null;
  channel: "dashboard" | "email";
  status: "scheduled" | "delivered" | "simulated" | "failed";
  scheduledFor: string | null;
  deliveredAt: string | null;
  to: string | null;
  subject: string | null;
  html: string | null;
  detail: Record<string, unknown>;
}
export interface HeldRow { briefId: string; profileId: string; name: string; desk: string | null; plannedFor: string }
export interface PersonSetting { profileId: string; delivery: Delivery; sendTime: string; source: "saved" | "default" }
export interface DeliveriesCounts { dashboard: number; email: number; failed: number; held: number }
export interface DeliveriesView { run: RunRef | null; runs: RunRef[]; rows: DeliveryRow[]; held: HeldRow[]; settings: Record<string, PersonSetting>; counts: DeliveriesCounts }

export function summariseDeliveries(rows: Pick<DeliveryRow, "channel" | "status">[], heldCount: number): DeliveriesCounts {
  return {
    dashboard: rows.filter((r) => r.channel === "dashboard" && r.status !== "failed").length,
    email: rows.filter((r) => r.channel === "email" && r.status !== "failed").length,
    failed: rows.filter((r) => r.status === "failed").length,
    held: heldCount,
  };
}

export async function getDeliveriesView(db: Db, meId: string, requestedRun?: string | null): Promise<DeliveriesView> {
  const runs = await listRunsWithBriefs(db, meId);
  const run = pickRun(runs, requestedRun);
  if (!run) return { run: null, runs, rows: [], held: [], settings: {}, counts: { dashboard: 0, email: 0, failed: 0, held: 0 } };
  const { rows, held, settings } = await db.asUser(meId, async (q) => {
    const [dl, hb, people] = await Promise.all([
      q(`select d.id, d.brief_id, d.profile_id, p.full_name, dk.name desk, d.channel, d.status, d.scheduled_for, d.delivered_at, d.to_address, d.subject, d.html, d.detail
           from deliveries d join profiles p on p.id = d.profile_id left join desks dk on dk.id = p.desk_id where d.run_id = $1
          order by p.full_name, d.channel`, [run.id]),
      q(`select b.id, b.profile_id, p.full_name, dk.name desk, dk.code desk_code from briefs b join profiles p on p.id = b.profile_id left join desks dk on dk.id = p.desk_id
          where b.run_id = $1 and b.qc_status = 'flagged' order by p.full_name`, [run.id]),
      q(`select b.profile_id, dk.code desk_code from briefs b join profiles p on p.id = b.profile_id left join desks dk on dk.id = p.desk_id where b.run_id = $1`, [run.id]),
    ]);
    const ids = people.map((p) => String(p.profile_id));
    const saved = ids.length ? await q(
      `select distinct on (profile_id) profile_id, delivery, to_char(send_time, 'HH24:MI') send_time from brief_preferences
        where profile_id = any($1::uuid[]) and effective_from <= $2::date order by profile_id, effective_from desc`, [ids, run.businessDate]) : [];
    const savedBy = new Map(saved.map((s) => [String(s.profile_id), s]));
    const cfg: Record<string, PersonSetting> = {};
    for (const p of people) {
      const id = String(p.profile_id);
      const s = savedBy.get(id);
      if (s) cfg[id] = { profileId: id, delivery: s.delivery as Delivery, sendTime: String(s.send_time), source: "saved" };
      else { const d = defaultPrefs(id, (p.desk_code as string) ?? null); cfg[id] = { profileId: id, delivery: d.delivery, sendTime: d.sendTime, source: "default" }; }
    }
    return {
      rows: dl.map((r): DeliveryRow => ({
        id: String(r.id), briefId: r.brief_id ? String(r.brief_id) : null, profileId: String(r.profile_id), name: String(r.full_name), desk: (r.desk as string) ?? null,
        channel: r.channel as DeliveryRow["channel"], status: r.status as DeliveryRow["status"], scheduledFor: isoOrNull(r.scheduled_for), deliveredAt: isoOrNull(r.delivered_at),
        to: (r.to_address as string) ?? null, subject: (r.subject as string) ?? null, html: (r.html as string) ?? null, detail: (r.detail as Record<string, unknown>) ?? {},
      })),
      held: hb.map((h): HeldRow => ({ briefId: String(h.id), profileId: String(h.profile_id), name: String(h.full_name), desk: (h.desk as string) ?? null, plannedFor: publishedAt(run.businessDate, String(h.profile_id), cfg[String(h.profile_id)]?.sendTime ?? "06:30") })),
      settings: cfg,
    };
  });
  return { run, runs, rows, held, settings, counts: summariseDeliveries(rows, held.length) };
}
