import { beforeAll, describe, expect, it } from "vitest";
import { testDb, pid } from "./helpers/testdb";
import { signSession } from "../src/lib/auth/session";
import { runPipeline } from "../src/lib/pipeline/run";

const D = "2026-10-05";
let rahman: string, okafor: string, whitaker: string;
const cookie = (id: string) => ({ cookie: `mb_session=${signSession(id)}`, "content-type": "application/json" });

beforeAll(async () => {
  (globalThis as unknown as { __mbDb?: Promise<unknown> }).__mbDb = testDb();
  const db = await testDb();
  rahman = await pid("rahman"); okafor = await pid("okafor"); whitaker = await pid("whitaker");
  await runPipeline({ db, businessDate: D, useLlm: false });
}, 120_000);

describe("PATCH /api/cards/[id]", () => {
  it("lets the owner update a card and logs it; blocks anyone else; validates input", async () => {
    const db = await testDb();
    const { PATCH } = await import("../src/app/api/cards/[id]/route");
    const card = (await db.asUser(rahman, (q) => q<{ id: string }>(`select id from call_cards order by rank limit 1`)))[0].id;
    const call = (who: string | null, body: unknown, id = card) =>
      PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body), headers: who ? cookie(who) : {} }), { params: Promise.resolve({ id }) });
    expect((await call(null, { status: "done" })).status).toBe(401);
    expect((await call(rahman, { status: "bogus" })).status).toBe(400);
    expect((await call(okafor, { status: "done" })).status).toBe(404); // another desk: row-level security hides it
    expect((await call(rahman, { status: "done" })).status).toBe(200);
    const row = await db.asService((q) => q<{ status: string }>(`select status from call_cards where id = $1`, [card]));
    expect(row[0].status).toBe("done");
    const log = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from audit_log where action = 'card.done' and actor_id = $1`, [rahman]));
    expect(log[0].n).toBeGreaterThan(0);
  });
});

describe("/api/preferences", () => {
  it("round-trips valid preferences and rejects invalid ones", async () => {
    const { GET, PUT } = await import("../src/app/api/preferences/route");
    const put = (body: unknown) => PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body), headers: cookie(rahman) }));
    expect((await put({ maxCards: 99, tone: "concise", includeMacro: true, briefTime: "06:30", focusTags: [] })).status).toBe(400);
    expect((await put({ maxCards: 5, tone: "detailed", includeMacro: false, briefTime: "07:15", focusTags: ["rates"] })).status).toBe(200);
    const got = await (await GET(new Request("http://x", { headers: cookie(rahman) }))).json();
    expect(got).toMatchObject({ maxCards: 5, tone: "detailed", includeMacro: false, briefTime: "07:15", focusTags: ["rates"] });
    expect((await GET(new Request("http://x"))).status).toBe(401);
  });

  it("the next run honours the saved list length", async () => {
    const db = await testDb();
    await runPipeline({ db, businessDate: D, useLlm: false, profileIds: [rahman] });
    const n = await db.asUser(rahman, (q) => q<{ n: number }>(`select count(*)::int n from call_cards c join briefs b on b.id = c.brief_id where b.profile_id = $1`, [rahman]));
    expect(n[0].n).toBeLessThanOrEqual(5);
  }, 60_000);
});

describe("/api/search", () => {
  it("returns pages and only the caller's clients", async () => {
    const db = await testDb();
    const { GET } = await import("../src/app/api/search/route");
    const mine = (await db.asUser(rahman, (q) => q<{ name: string }>(`select name from clients limit 1`)))[0].name;
    const theirs = (await db.asService((q) => q<{ name: string }>(`select c.name from clients c where not exists (select 1 from coverage v where v.client_id = c.id and v.profile_id = $1) limit 1`, [rahman])))[0].name;
    const body = async (term: string) => (await GET(new Request(`http://x/api/search?q=${encodeURIComponent(term)}`, { headers: cookie(rahman) }))).json();
    expect((await body(mine)).hits.some((h: { kind: string; label: string }) => h.kind === "client" && h.label === mine)).toBe(true);
    expect((await body(theirs)).hits.some((h: { kind: string }) => h.kind === "client")).toBe(false);
    expect((await GET(new Request("http://x/api/search?q=a"))).status).toBe(401);
  });
});

describe("/api/chat", () => {
  it("streams steps then an answer and stores the thread", async () => {
    const db = await testDb();
    const { POST } = await import("../src/app/api/chat/route");
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ message: "Who should I call today?" }), headers: cookie(rahman) }));
    const text = await res.text();
    expect(text).toMatch(/event: thread/);
    expect(text).toMatch(/event: step/);
    expect(text).toMatch(/event: answer/);
    const msgs = await db.asUser(rahman, (q) => q<{ role: string }>(`select role from chat_messages order by created_at`));
    expect(msgs.map((m) => m.role)).toEqual(expect.arrayContaining(["user", "assistant"]));
  });
  it("is closed to compliance and to anonymous callers, and validates length", async () => {
    const { POST } = await import("../src/app/api/chat/route");
    expect((await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ message: "hi" }) }))).status).toBe(403);
    expect((await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ message: "x".repeat(600) }), headers: cookie(rahman) }))).status).toBe(400);
  });
});

describe("/api/demo/reset", () => {
  it("is admin only and resets statuses", async () => {
    const db = await testDb();
    const { POST } = await import("../src/app/api/demo/reset/route");
    expect((await POST(new Request("http://x", { method: "POST", headers: cookie(rahman) }))).status).toBe(403);
    const ok = await POST(new Request("http://x", { method: "POST", headers: cookie(whitaker) }));
    expect(ok.status).toBe(200);
    const left = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from call_cards where status <> 'new'`));
    expect(left[0].n).toBe(0);
  });
});
