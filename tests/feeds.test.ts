import { describe, expect, it } from "vitest";
import { testDb } from "./helpers/testdb";
import { runFeeds, syncFeedRegistry, type FeedState } from "../src/lib/feeds/connectors";
import { FEEDS } from "../src/lib/feeds/registry";
import { defaultScenarios } from "../src/lib/market/scenarios";

const D = "2026-10-05";
const run = async (outages?: Record<string, "down" | "delayed">) => {
  const db = await testDb();
  const runId = (await db.asService((q) => q<{ id: string }>(`insert into pipeline_runs (business_date, trigger, scope, status) values ($1,'manual','all','running') returning id`, [D])))[0].id;
  const updates: FeedState[] = [];
  const states = await runFeeds({ db, runId, businessDate: D, scenarios: defaultScenarios(D), outages, onUpdate: (s) => updates.push(s) });
  return { db, runId, states, updates };
};

describe("feed connectors", () => {
  it("runs all connectors, stores data with source and as-of", async () => {
    const { db, runId, states, updates } = await run();
    await syncFeedRegistry(db);
    expect(states.length).toBe(FEEDS.length);
    for (const s of states) {
      expect(s.status, `${s.feedKey}: ${JSON.stringify(s.detail)}`).toBe("ok");
      expect(s.log.length).toBeGreaterThan(3);
      expect(s.asOf).not.toBeNull();
    }
    expect(updates.some((u) => u.status === "running")).toBe(true);
    const fr = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from feed_runs where run_id = $1`, [runId]));
    expect(fr[0].n).toBe(FEEDS.length);
    const x = await db.asService((q) => q<{ sectors: number; extras: number; news: number; earn: number; div: number; fed: number; idx: number; badNews: number }>(
      `select (select count(*) from sector_perf where business_date = $1)::int sectors,
              (select count(*) from market_extras where business_date = $1)::int extras,
              (select count(*) from events where feed_key = 'news_agg' and business_date = $1)::int news,
              (select count(*) from events where feed_key = 'earnings_cal')::int earn,
              (select count(*) from events where feed_key = 'corp_actions')::int div,
              (select count(*) from events where feed_key = 'fed_cal')::int fed,
              (select count(*) from events where feed_key = 'index_cal')::int idx,
              (select count(*) from events where feed_key = 'news_agg' and title ~ '[0-9]')::int "badNews"`, [D]));
    expect(x[0].sectors).toBe(11);
    expect(x[0].extras).toBeGreaterThan(5);
    expect(x[0].news).toBeGreaterThan(10);
    expect(x[0].earn).toBeGreaterThan(5);
    expect(x[0].div).toBeGreaterThan(0);
    expect(x[0].fed).toBeGreaterThan(0);
    expect(x[0].idx).toBeGreaterThan(0);
    expect(x[0].badNews).toBe(0);
  }, 60_000);

  it("is idempotent on rerun", async () => {
    const db = await testDb();
    const count = () => db.asService((q) => q<{ n: number }>(`select count(*)::int n from events`));
    await run();
    const a = (await count())[0].n;
    await run();
    expect((await count())[0].n).toBe(a);
  }, 60_000);

  it("a down feed is marked down and does not stop the others", async () => {
    const { states } = await run({ news_agg: "down", sector_perf: "delayed" });
    const by = Object.fromEntries(states.map((s) => [s.feedKey, s]));
    expect(by.news_agg.status).toBe("down");
    expect(by.sector_perf.status).toBe("delayed");
    expect(by.mkt_snapshot.status).toBe("ok");
    expect(by.news_agg.log.join("\n")).toMatch(/503/);
  }, 60_000);
});
