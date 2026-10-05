import { describe, expect, it } from "vitest";
import { testDb, pid } from "./helpers/testdb";
import { runPipeline } from "../src/lib/pipeline/run";
import { subscribe } from "../src/lib/pipeline/bus";
import type { Db, Q } from "../src/lib/db/types";

const D = "2026-10-05";

describe("pipeline run", () => {
  it("records initialization failures and closes the progress stream", async () => {
    const db = await testDb();
    const failingDb: Db = {
      ...db,
      asService: (fn) => db.asService((q) => {
        const failingQ: Q = (text, params) => {
          if (text.includes("insert into pipeline_steps")) throw new Error("cannot extract elements from a scalar");
          return q(text, params);
        };
        return fn(failingQ);
      }),
    };
    const r = await runPipeline({ db: failingDb, businessDate: D, useLlm: false });
    expect(r.status).toBe("failed");
    expect(r.summary.error).toBe("cannot extract elements from a scalar");
    const rows = await db.asService(q => q<{ status: string }>("select status from pipeline_runs where id = $1", [r.runId]));
    expect(rows[0].status).toBe("failed");
    const events: string[] = [];
    subscribe(r.runId, e => events.push(e.type));
    expect(events.at(-1)).toBe("done");
  });

  it("runs every step, persists steps and publishes briefs", async () => {
    const db = await testDb();
    const r = await runPipeline({ db, businessDate: D, trigger: "manual", useLlm: false });
    expect(r.summary.error).toBeUndefined();
    expect(r.status).toBe("succeeded");
    const steps = await db.asService((q) => q<{ key: string; status: string; log: string[] }>(`select key, status, log from pipeline_steps where run_id = $1 order by seq`, [r.runId]));
    expect(steps.length).toBe(13);
    expect(steps.every((s) => s.status === "succeeded")).toBe(true);
    expect(steps[0].log.length).toBeGreaterThan(0);

    const n = await db.asService((q) => q<{ briefs: number; cards: number; facts: number }>(
      `select (select count(*) from briefs where run_id = $1)::int briefs, (select count(*) from call_cards c join briefs b on b.id = c.brief_id where b.run_id = $1)::int cards,
              (select count(*) from brief_facts f join briefs b on b.id = f.brief_id where b.run_id = $1)::int facts`, [r.runId]));
    expect(n[0].briefs).toBeGreaterThanOrEqual(12);
    expect(n[0].cards).toBeGreaterThan(60);
    expect(n[0].facts).toBeGreaterThan(500);
  }, 120_000);

  it("stores no digit outside a fact value in any rendered-from-template text", async () => {
    const db = await testDb();
    const rows = await db.asService((q) => q<{ t: string }>(`select why_template t from call_cards union all select body_template from brief_sections`));
    for (const { t } of rows) expect(t.replace(/\{\{[^}]+\}\}/g, "")).not.toMatch(/\p{N}/u);
  });

  it("every token in stored text has a fact with source and timestamp", async () => {
    const db = await testDb();
    const bad = await db.asService((q) => q<{ n: number }>(
      `select count(*)::int n from brief_sections s cross join lateral unnest(s.fact_keys) k
        where not exists (select 1 from brief_facts f where f.brief_id = s.brief_id and f.key = k and f.source <> '' and f.as_of is not null)`));
    expect(bad[0].n).toBe(0);
  });

  it("a salesperson only reads their own brief and cards (row-level security)", async () => {
    const db = await testDb();
    const aisha = await pid("rahman");
    const seen = await db.asUser(aisha, async (q) => ({
      briefs: await q<{ profile_id: string }>(`select profile_id from briefs where business_date = $1`, [D]),
      cards: await q<{ profile_id: string }>(`select profile_id from call_cards`),
    }));
    expect(seen.briefs.length).toBe(1);
    expect(seen.briefs[0].profile_id).toBe(aisha);
    expect(seen.cards.every((c) => c.profile_id === aisha)).toBe(true);
    expect(seen.cards.length).toBeGreaterThan(0);
  });

  it("rerun replaces the brief, keeps card status, and streams progress", async () => {
    const db = await testDb();
    const aisha = await pid("rahman");
    await db.asService((q) => q(`update call_cards set status = 'done' where profile_id = $1 and rank = 1`, [aisha]));
    const r = await runPipeline({ db, businessDate: D, trigger: "manual", useLlm: false, profileIds: [aisha] });
    expect(r.status).toBe("succeeded");
    const rows = await db.asService((q) => q<{ status: string; version: number }>(
      `select c.status, b.version from call_cards c join briefs b on b.id = c.brief_id where c.profile_id = $1 and c.rank = 1`, [aisha]));
    expect(rows[0].status).toBe("done");
    expect(rows[0].version).toBe(2);
    const events: string[] = [];
    subscribe(r.runId, (e) => events.push(e.type));
    expect(events[0]).toBe("run");
    expect(events.at(-1)).toBe("done");
    expect(events.filter((e) => e === "step").length).toBeGreaterThanOrEqual(26);
  }, 120_000);
});
