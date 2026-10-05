import { beforeAll, describe, expect, it } from "vitest";
import { testDb, pid } from "./helpers/testdb";
import { runPipeline } from "../src/lib/pipeline/run";
import { FEEDS, SECTION_FEEDS } from "../src/lib/feeds/registry";
import {
  PRODUCTION_ADAPTER, checkColumns, dependentsOf, freshnessOf, getBriefForReview, getDeliveriesView, getFeedsView, getQcView, isOpsRole, pickRun, sectionStates,
  summariseDeliveries, summariseQc, type QcRow,
} from "../src/lib/data/ops";

const D = "2026-10-05";

describe("access and run selection", () => {
  it("ops pages are for desk heads, admins and compliance", () => {
    expect(["desk_head", "admin", "compliance"].every((r) => isOpsRole(r as never))).toBe(true);
    expect(isOpsRole("sales")).toBe(false);
    expect(isOpsRole(null)).toBe(false);
  });
  it("picks the requested run, else the newest, else nothing", () => {
    const runs = [{ id: "b" }, { id: "a" }];
    expect(pickRun(runs, "a")?.id).toBe("a");
    expect(pickRun(runs, "zzz")?.id).toBe("b");
    expect(pickRun(runs, undefined)?.id).toBe("b");
    expect(pickRun([], "a")).toBeNull();
  });
});

describe("freshness against the SLA", () => {
  const def = { slaTime: "05:15", maxAgeMin: 90 };
  it("explains a healthy feed with its margin", () => {
    const f = freshnessOf(def, { status: "ok", asOf: "2026-10-05T08:00:12.000Z" }, D); // 04:00 ET
    expect(f).toMatchObject({ tone: "ok", label: "Within SLA", detail: "1 h 15 min to spare" });
  });
  it("marks prior-session data as such instead of inventing a margin", () => {
    expect(freshnessOf(def, { status: "ok", asOf: "2026-10-02T20:00:00.000Z" }, D).detail).toBe("prior-session data");
  });
  it("flags a delayed feed as stale and a down feed as no data", () => {
    const stale = freshnessOf(def, { status: "delayed", asOf: "2026-10-05T06:12:41.000Z" }, D); // 02:12 ET, 108 min before 04:00
    expect(stale).toMatchObject({ tone: "warn", label: "Stale" });
    expect(stale.detail).toMatch(/1 h 47 min old, limit 1 h 30 min/);
    expect(freshnessOf(def, { status: "down", asOf: null }, D)).toMatchObject({ tone: "bad", label: "No data" });
    expect(freshnessOf(def, null, D)).toMatchObject({ tone: "idle", label: "No run" });
  });
});

describe("sections that depend on feeds", () => {
  it("withholds a section when any required feed is not healthy, like the pipeline", () => {
    const states = sectionStates({ news_agg: "down", idx_history: "delayed" });
    const by = Object.fromEntries(states.map((s) => [s.kind, s]));
    expect(by.news).toMatchObject({ withheld: true, because: ["news_agg"] });
    expect(by.chart).toMatchObject({ withheld: true, because: ["idx_history"] });
    expect(by.snapshot.withheld).toBe(false);
    expect(states).toHaveLength(Object.keys(SECTION_FEEDS).length);
    expect(sectionStates({}).every((s) => !s.withheld)).toBe(true);
  });
  it("lists each feed's dependents, including ones the feed does not gate", () => {
    const states = sectionStates({ mkt_snapshot: "down" });
    const mkt = dependentsOf("mkt_snapshot", FEEDS.find((f) => f.key === "mkt_snapshot")!, states);
    expect(mkt.map((d) => d.key).sort()).toEqual(["catalysts", "chart", "movers", "snapshot"]);
    expect(mkt.every((d) => d.gated && d.withheld)).toBe(true);
    const crm = dependentsOf("crm_book", FEEDS.find((f) => f.key === "crm_book")!, states);
    expect(crm.find((d) => d.key === "cards")).toMatchObject({ label: "Call cards", gated: false });
    expect(crm.find((d) => d.key === "earnings")).toMatchObject({ gated: false, withheld: false });
    expect(dependentsOf("restricted", FEEDS.find((f) => f.key === "restricted")!, states)[0].label).toMatch(/information barrier/);
  });
});

describe("generic wording only", () => {
  const REAL = /bloomberg|refinitiv|reuters|factset|morningstar|s&p global|msci|ftse|dow jones|ice data|nasdaq|salesforce|sendgrid|twilio|aws|azure|gmail|outlook|openai|anthropic/i;
  it("no feed vendor label or production adapter text names a real vendor", () => {
    for (const f of FEEDS) {
      expect(f.vendor, f.key).not.toMatch(REAL);
      const a = PRODUCTION_ADAPTER[f.key];
      expect(a, `adapter for ${f.key}`).toBeTruthy();
      expect([a.type, ...a.needs].join(" "), f.key).not.toMatch(REAL);
      expect(a.needs.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("summaries", () => {
  const row = (o: Partial<QcRow>): QcRow => ({
    briefId: "b", profileId: "p", name: "N", title: "T", desk: null, businessDate: D, status: "published", qcStatus: "passed", generatedAt: "", publishedAt: null, automated: null, reviews: [], sampled: false, held: false, ...o,
  });
  it("counts briefs checked, passed, held and sampled", () => {
    const rows = [
      row({ sampled: true, reviews: [{ id: "1", status: "passed", reviewer: "r", notes: null, checks: [], at: "" }] }),
      row({ qcStatus: "flagged", held: true, sampled: true, reviews: [{ id: "2", status: "flagged", reviewer: "r", notes: null, checks: [], at: "" }] }),
      row({ qcStatus: "flagged", held: true, automated: { status: "flagged", checks: [] } }),
      row({}),
      row({ qcStatus: "pending" }),
    ];
    expect(summariseQc(rows)).toEqual({ checked: 5, passed: 2, held: 2, pending: 1, sampled: 2, sampledPassed: 1, sampledFlagged: 1, automatedFailed: 1 });
  });
  it("reads the matrix columns from the stored checks", () => {
    const c = (name: string) => ({ name, label: `Label ${name}`, ok: true, detail: "" });
    expect(checkColumns([row({ automated: { status: "passed", checks: [c("a"), c("b")] } }), row({ automated: { status: "passed", checks: [c("b"), c("z")] } }), row({})])).toEqual([
      { name: "a", label: "Label a" }, { name: "b", label: "Label b" }, { name: "z", label: "Label z" },
    ]);
  });
  it("counts deliveries by channel and keeps failures apart", () => {
    expect(summariseDeliveries([
      { channel: "dashboard", status: "delivered" }, { channel: "dashboard", status: "delivered" }, { channel: "email", status: "simulated" }, { channel: "email", status: "failed" },
    ], 2)).toEqual({ dashboard: 2, email: 1, failed: 1, held: 2 });
  });
});

describe("the three views, read from a real run", () => {
  let held = "";
  beforeAll(async () => {
    const db = await testDb();
    const profileIds = await Promise.all(["okafor", "raman", "marchetti", "rahman", "fontaine"].map(pid));
    await runPipeline({ db, businessDate: D, trigger: "manual", useLlm: false, qcFlag: true, profileIds, outages: { news_agg: "down", futures_rates: "delayed" } });
  }, 180_000);

  it("feeds: all 14 connectors with the outage reflected in health, freshness and withheld sections", async () => {
    const db = await testDb();
    const v = await getFeedsView(db, await pid("whitaker"));
    expect(v.run?.businessDate).toBe(D);
    expect(v.feeds).toHaveLength(14);
    expect(v.stats).toMatchObject({ healthy: 12, total: 14 });
    expect(v.stats.rows).toBeGreaterThan(100);
    expect(v.stats.slowest!.latencyMs).toBeGreaterThan(0);
    const news = v.feeds.find((f) => f.def.key === "news_agg")!;
    expect(news.run?.status).toBe("down");
    expect(news.freshness.tone).toBe("bad");
    expect(news.dependents.find((d) => d.key === "news")).toMatchObject({ withheld: true });
    const fut = v.feeds.find((f) => f.def.key === "futures_rates")!;
    expect(fut.freshness).toMatchObject({ tone: "warn", label: "Stale" });
    const mkt = v.feeds.find((f) => f.def.key === "mkt_snapshot")!;
    expect(mkt.stored).toBe("market_quotes");
    expect(mkt.authScope).toBe("read:mkt_snapshot");
    expect(mkt.run!.log.length).toBeGreaterThan(4);
    expect(Array.isArray(mkt.run!.sample)).toBe(true);
    expect(mkt.history).toHaveLength(1);
    expect(v.stats.withheld.labels).toEqual(expect.arrayContaining(["Breaking news", "Catalysts"]));
    expect(v.stats.withheld.count).toBe(v.stats.withheld.labels.length);
  });

  it("feeds: connector health is not visible to a salesperson (row-level security)", async () => {
    const db = await testDb();
    const v = await getFeedsView(db, await pid("rahman"));
    expect(v.run).toBeNull();
    expect(v.feeds).toEqual([]);
  });

  it("qc: a desk head sees only their own desk, the admin sees everyone; columns come from the stored checks", async () => {
    const db = await testDb();
    const all = await getQcView(db, await pid("whitaker"));
    expect(all.rows).toHaveLength(5);
    expect(all.checkColumns.map((c) => c.name)).toEqual(["traceable", "no_free_numbers", "information_barrier", "setup_honoured", "universal_identical", "stale_withheld", "units", "no_empty_sections"]);
    expect(all.rows.every((r) => r.automated?.checks.length === 8)).toBe(true);
    expect(all.summary.checked).toBe(5);
    expect(all.summary.held).toBe(1);
    expect(all.summary.passed).toBe(4);
    expect(all.summary.sampled).toBe(3);
    expect(all.summary.sampledFlagged).toBe(1);
    const h = all.rows.find((r) => r.held)!;
    held = h.briefId;
    expect(h).toMatchObject({ status: "draft", qcStatus: "flagged", sampled: true });
    expect(h.reviews.at(-1)?.checks.length).toBeGreaterThanOrEqual(4);

    const rcs = await getQcView(db, await pid("delaney"));
    expect(rcs.rows.length).toBeGreaterThan(0);
    expect(rcs.rows.length).toBeLessThan(5);
    expect(rcs.rows.every((r) => r.desk === "Rates & Credit Sales")).toBe(true);
  });

  it("qc: a salesperson sees no review records", async () => {
    const db = await testDb();
    const v = await getQcView(db, await pid("rahman"));
    expect(v.rows.length).toBeLessThanOrEqual(1); // at most their own brief
    // reviews are ops-only: no automated or spot-check rows are readable by a salesperson
    expect(v.rows.every((r) => r.automated === null && r.reviews.length === 0)).toBe(true);
  });

  it("review: stored sections and the facts they cite; another desk's brief is invisible", async () => {
    const db = await testDb();
    const qc = await getQcView(db, await pid("whitaker"));
    const rcsRow = qc.rows.find((r) => r.desk === "Rates & Credit Sales")!;
    const eqsRow = qc.rows.find((r) => r.desk === "Equity Sales")!;
    const r = await getBriefForReview(db, await pid("delaney"), rcsRow.briefId);
    expect(r?.brief.name).toBe(rcsRow.name);
    expect(r!.sections.some((s) => s.kind === "news" && s.status === "unavailable" && /unavailable/i.test(s.note ?? ""))).toBe(true);
    const cat = r!.sections.find((s) => s.kind === "catalysts")!;
    expect(cat.status).toBe("unavailable"); // futures_rates delayed: Catalysts withheld
    expect(r!.sections.map((s) => s.position)).toEqual([...r!.sections.map((s) => s.position)].sort((a, b) => a - b));
    expect(await getBriefForReview(db, await pid("delaney"), eqsRow.briefId)).toBeNull();
    expect(await getBriefForReview(db, await pid("rahman"), rcsRow.briefId)).toBeNull();
  });

  it("deliveries: counts, held people, per-person setting and the stored digest", async () => {
    const db = await testDb();
    const v = await getDeliveriesView(db, await pid("overton"));
    expect(v.run?.businessDate).toBe(D);
    expect(v.held).toHaveLength(1);
    expect(v.held[0].briefId).toBe(held);
    expect(v.rows.some((r) => r.briefId === held)).toBe(false); // held briefs have no delivery
    expect(v.counts.held).toBe(1);
    expect(v.counts.failed).toBe(0);
    expect(v.counts).toMatchObject({ dashboard: v.rows.filter((r) => r.channel === "dashboard").length, email: v.rows.filter((r) => r.channel === "email").length });
    const emails = v.rows.filter((r) => r.channel === "email");
    expect(emails.length).toBeGreaterThan(0);
    for (const e of emails) {
      expect(e.status).toBe("simulated");
      expect(e.html).toMatch(/<html/);
      expect(e.to).toMatch(/@northgate\.example$/);
      expect(v.settings[e.profileId]).toBeTruthy();
      expect(v.settings[e.profileId].delivery).not.toBe("dashboard");
    }
    for (const d of v.rows.filter((r) => r.channel === "dashboard")) expect(v.settings[d.profileId].delivery).not.toBe("email");
    expect(Object.values(v.settings).every((s) => s.sendTime === "06:30" && s.source === "default")).toBe(true);
  });

  it("deliveries: a failed relay is counted as failed, not as rendered", () => {
    expect(summariseDeliveries([{ channel: "email", status: "failed" }, { channel: "dashboard", status: "delivered" }], 0)).toMatchObject({ email: 0, failed: 1, dashboard: 1 });
  });
});
