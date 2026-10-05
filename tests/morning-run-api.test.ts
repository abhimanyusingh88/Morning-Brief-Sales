import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb, pid } from "./helpers/testdb";
import { signSession } from "../src/lib/auth/session";
import { syncFeedRegistry } from "../src/lib/feeds/connectors";

// `after()` only exists inside a request; capture what the route schedules and the options it hands the pipeline.
const sched = vi.hoisted(() => ({ jobs: [] as (() => unknown)[] }));
const runPipeline = vi.hoisted(() => vi.fn(async () => ({ runId: "x", status: "succeeded", summary: {} })));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => { sched.jobs.push(fn); } }));
vi.mock("../src/lib/pipeline/run", () => ({ runPipeline }));

beforeAll(async () => {
  (globalThis as unknown as { __mbDb?: Promise<unknown> }).__mbDb = testDb();
});
beforeEach(async () => {
  sched.jobs.length = 0;
  runPipeline.mockClear();
  const db = await testDb();
  await db.asService((q) => q(`delete from pipeline_runs`));
});

const post = async (body: unknown, who: string | null = "delaney") => {
  const { POST } = await import("../src/app/api/pipeline/run/route");
  const headers: Record<string, string> = {};
  if (who) headers.cookie = `mb_session=${signSession(await pid(who))}`;
  return POST(new Request("http://x/api/pipeline/run", { method: "POST", body: JSON.stringify(body), headers }));
};
const lastOptions = async () => { for (const j of sched.jobs) await j(); return (runPipeline.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]; };

describe("POST /api/pipeline/run", () => {
  it("refuses anonymous callers, salespeople and compliance", async () => {
    expect((await post({}, null)).status).toBe(403);
    expect((await post({}, "rahman")).status).toBe(403);
    expect((await post({}, "overton")).status).toBe(403);
    expect(sched.jobs.length).toBe(0);
  });

  it("starts a time-lapse run by default and returns the run id and business date", async () => {
    const res = await post({});
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const o = await lastOptions();
    expect(o).toMatchObject({ timelapse: true, trigger: "demo", runId: body.runId, businessDate: body.businessDate });
    expect(o.minStepMs).toBeUndefined(); // the run's own time-lapse pacing applies
  });

  it("passes date, storylines, outages, qcFlag, bypassCache and useLlm through", async () => {
    const res = await post({
      date: "2026-10-06", scenarios: ["rates_up", "energy_up"], timelapse: false,
      outages: { news_agg: "down", econ_cal: "delayed" }, qcFlag: true, bypassCache: true, useLlm: false,
    });
    expect(res.status).toBe(202);
    expect((await res.json()).businessDate).toBe("2026-10-06");
    expect(await lastOptions()).toMatchObject({
      businessDate: "2026-10-06", scenarios: ["rates_up", "energy_up"], timelapse: false, minStepMs: 0,
      outages: { news_agg: "down", econ_cal: "delayed" }, qcFlag: true, bypassCache: true, useLlm: false,
    });
  });

  it("rejects bad input with a readable message", async () => {
    const unknownFeed = await post({ outages: { not_a_feed: "down" } });
    expect(unknownFeed.status).toBe(400);
    expect((await unknownFeed.json()).error).toMatch(/unknown feed: not_a_feed/);
    expect((await post({ outages: { news_agg: "broken" } })).status).toBe(400);
    expect((await post({ scenarios: ["nope"] })).status).toBe(400);
    expect((await post({ date: "tomorrow" })).status).toBe(400);
    expect((await post({ timelapse: "yes" })).status).toBe(400);
    expect(sched.jobs.length).toBe(0);
  });

  it("does not start a second run while one is in progress, and tells the caller which", async () => {
    const db = await testDb();
    const running = (await db.asService((q) => q<{ id: string }>(`insert into pipeline_runs (business_date, trigger, status) values ('2026-10-05', 'demo', 'running') returning id`)))[0].id;
    const res = await post({});
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ runId: running });
    // a run that has shown no progress for minutes is treated as abandoned
    await db.asService((q) => q(`update pipeline_runs set started_at = now() - interval '10 minutes' where id = $1`, [running]));
    expect((await post({})).status).toBe(202);
  });
});

describe("GET /api/pipeline/runs/[id]/stream", () => {
  const sse = async (id: string, who: string | null) => {
    const { GET } = await import("../src/app/api/pipeline/runs/[id]/stream/route");
    const headers: Record<string, string> = {};
    if (who) headers.cookie = `mb_session=${signSession(await pid(who))}`;
    return GET(new Request(`http://x/api/pipeline/runs/${id}/stream`, { headers }), { params: Promise.resolve({ id }) });
  };
  const parse = (text: string) => text.split("\n\n").filter((f) => f.startsWith("event:")).map((f) => ({ type: /^event: (\w+)/.exec(f)![1], data: JSON.parse(/data: (.*)$/m.exec(f)![1]) }));

  it("is for operations roles only", async () => {
    const id = crypto.randomUUID();
    expect((await sse(id, null)).status).toBe(403);
    expect((await sse(id, "rahman")).status).toBe(403);
    expect((await sse("not-an-id", "whitaker")).status).toBe(400);
  });

  it("rebuilds a finished run from the database, including every connector's state", async () => {
    const db = await testDb();
    await syncFeedRegistry(db);
    const id = (await db.asService((q) => q<{ id: string }>(`insert into pipeline_runs (business_date, trigger, status, finished_at, summary) values ('2026-10-05', 'demo', 'succeeded', now(), '{"durationMs": 1234}') returning id`)))[0].id;
    await db.asService(async (q) => {
      await q(`insert into pipeline_steps (run_id, seq, key, label, status, started_at, finished_at, rows_out, detail, log) values ($1, 1, 'ingest_feeds', 'Pull every data feed', 'succeeded', now(), now(), 42, '{"stage":1,"simAt":"04:00"}', '{"line one"}')`, [id]);
      await q(`insert into feed_runs (run_id, feed_key, status, finished_at, rows, latency_ms, as_of, detail, sample, log) values
        ($1, 'mkt_snapshot', 'ok', now(), 30, 120, now(), '{}', '[{"symbol":"SPX"}]', '{"connect   wss://x","parse     30 records"}'),
        ($1, 'news_agg', 'down', now(), 0, 90, null, '{"error":"503 Service Unavailable after 3 attempts","withheld":["Breaking news"]}', '[]', '{"fail      marked DOWN"}')`, [id]);
    });

    const res = await sse(id, "whitaker");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const events = parse(await res.text());
    expect(events[0].type).toBe("run");
    expect(events[0].data.steps[0]).toMatchObject({ key: "ingest_feeds", stage: 1, simAt: "04:00" });
    const feeds = events.filter((e) => e.type === "feed").map((e) => e.data.feed);
    expect(feeds.map((f) => f.feedKey).sort()).toEqual(["mkt_snapshot", "news_agg"]);
    expect(feeds.find((f) => f.feedKey === "mkt_snapshot")).toMatchObject({ status: "ok", rows: 30, latencyMs: 120, sample: [{ symbol: "SPX" }], log: ["connect   wss://x", "parse     30 records"] });
    expect(feeds.find((f) => f.feedKey === "news_agg")).toMatchObject({ status: "down", detail: { withheld: ["Breaking news"] } });
    expect(events.at(-1)).toMatchObject({ type: "done", data: { status: "succeeded", summary: { durationMs: 1234 } } });
  });

  it("reports a run that does not exist as failed rather than hanging", async () => {
    const res = await sse(crypto.randomUUID(), "delaney");
    const events = parse(await res.text());
    expect(events.at(-1)).toMatchObject({ type: "done", data: { status: "failed", summary: { error: "run not found" } } });
  }, 30_000);
});
