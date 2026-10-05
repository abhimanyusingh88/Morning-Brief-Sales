import type { Db } from "@/lib/db";
import { isUuid } from "./threads";

export type SourceTone = "ok" | "warn" | "bad" | "idle";
export interface SourceRow {
  key: string;
  name: string;
  detail: string;
  /** Short status label. "Simulated connector" when run health is not visible to this role. */
  status: string;
  tone: SourceTone;
  asOf: string | null;
}

const iso = (x: unknown) => (x ? new Date(x as string).toISOString() : null);
const RUN_TONE: Record<string, { tone: SourceTone; label: string }> = { ok: { tone: "ok", label: "Healthy" }, delayed: { tone: "warn", label: "Delayed" }, down: { tone: "bad", label: "Down" }, running: { tone: "ok", label: "Running" } };

/**
 * What the agent can read for this person, with freshness. Everything is read as the person (row-level security).
 * Feed health comes from feed_runs when their role may read it (desk heads); otherwise the row is labelled a simulated connector.
 * Connector names are generic; no real vendor is ever named.
 */
export async function connectedSources(db: Db, meId: string): Promise<SourceRow[]> {
  return db.asUser(meId, async (q) => {
    const [cov] = await q(`select count(*)::int n from coverage where profile_id = $1`, [meId]);
    const [pos] = await q(`select count(*)::int n, max(as_of) a from positions`);
    const [trd] = await q(`select count(*)::int n, max(traded_at) a from trades where traded_at > now() - interval '45 days'`);
    const [mkt] = await q(`select count(*)::int n, max(as_of) a from market_quotes`);
    const [news] = await q(`select count(*)::int n, max(occurred_at) a from events where kind in ('news','research') and entitlement = 'public'`);
    const [cal] = await q(`select max(as_of) a from market_extras`);
    const [inter] = await q(`select max(occurred_at) a from interactions`);
    const runs = await q<{ feed_key: string; status: string; as_of: string | null; finished_at: string | null }>(
      `select distinct on (feed_key) feed_key, status, as_of, finished_at from feed_runs order by feed_key, started_at desc`);
    const run = new Map(runs.map((r) => [r.feed_key, r]));
    const health = (keys: string[]) => {
      const rs = keys.map((k) => run.get(k)).filter(Boolean) as typeof runs;
      if (!rs.length) return { status: "Simulated connector", tone: "idle" as SourceTone, asOf: null as string | null };
      const worst = rs.some((r) => r.status === "down") ? "down" : rs.some((r) => r.status === "delayed") ? "delayed" : rs.every((r) => r.status === "ok") ? "ok" : "running";
      const t = RUN_TONE[worst];
      return { status: t.label, tone: t.tone, asOf: iso(rs.map((r) => r.as_of ?? r.finished_at).filter(Boolean).sort().pop()) };
    };
    const row = (key: string, name: string, detail: string, feeds: string[], asOf: unknown): SourceRow => {
      const h = health(feeds);
      return { key, name, detail, status: h.status, tone: h.tone, asOf: iso(asOf) ?? h.asOf };
    };
    const n = (x: unknown, one: string, many: string) => `${Number(x)} ${Number(x) === 1 ? one : many}`;
    const rh = health(["restricted"]);
    return [
      row("crm", "CRM coverage book", `${n(cov?.n, "client", "clients")} you cover, with contacts, notes and follow-ups`, ["crm_book"], inter?.a),
      row("positions", "Positions", `${n(pos?.n, "position", "positions")} in the tracked book`, ["crm_book"], pos?.a),
      row("trades", "Trade blotter", `${n(trd?.n, "trade", "trades")} in the last 45 days`, ["crm_book"], trd?.a),
      row("market", "Market data", `Pre-market snapshot, ${n(mkt?.n, "instrument", "instruments")}`, ["mkt_snapshot", "futures_rates"], mkt?.a),
      row("news", "News", `${n(news?.n, "headline", "headlines")}, tagged to sectors and tickers`, ["news_agg"], news?.a),
      row("calendars", "Calendars", "Earnings, economic data and policy dates", ["earnings_cal", "econ_cal", "fed_cal"], cal?.a),
      { key: "restricted", name: "Restricted list", detail: "Applied: some names are withheld by the information barrier and are never shown.", status: rh.tone === "idle" ? "Always applied" : rh.status, tone: rh.tone === "idle" ? "ok" : rh.tone, asOf: rh.asOf },
      { key: "email", name: "Email", detail: "Draft only. The agent never sends anything to a client.", status: "Draft only", tone: "idle", asOf: null },
    ];
  });
}

export interface StarterContext { topClients: { id: string; name: string }[]; scopedClient: { id: string; name: string } | null }

/** Real names from the latest brief for the empty-state prompts, and the client for a deep link (only if the person can see it). */
export async function starterContext(db: Db, meId: string, clientId?: string | null): Promise<StarterContext> {
  return db.asUser(meId, async (q) => {
    const top = await q<{ id: string; name: string }>(
      `select cl.id, cl.name from call_cards cc join clients cl on cl.id = cc.client_id
        where cc.brief_id = (select id from briefs where profile_id = $1 order by business_date desc limit 1) and cc.profile_id = $1 and cc.status in ('new','snoozed')
        order by cc.rank limit 3`, [meId]);
    const scoped = clientId && isUuid(clientId) ? (await q<{ id: string; name: string }>(`select id, name from clients where id = $1`, [clientId]))[0] ?? null : null;
    return { topClients: top, scopedClient: scoped };
  });
}
