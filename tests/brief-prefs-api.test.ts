import { beforeAll, describe, expect, it } from "vitest";
import { pid, installTestDb } from "./helpers/testdb";
import { signSession } from "../src/lib/auth/session";

const req = (method: string, body?: unknown, cookie?: string) =>
  new Request("http://x/api/brief-prefs", { method, body: body === undefined ? undefined : JSON.stringify(body), headers: cookie ? { cookie } : {} });
const as = async (slug: string) => `mb_session=${signSession(await pid(slug))}`;
const valid = { sectors: ["Technology", "Energy"], products: ["Equities", "Options"], include: { news: false }, delivery: "email", sendTime: "07:15" };

let route: typeof import("../src/app/api/brief-prefs/route");

beforeAll(async () => {
  installTestDb();
  route = await import("../src/app/api/brief-prefs/route");
}, 60_000);

describe("/api/brief-prefs", () => {
  it("refuses anonymous callers", async () => {
    expect((await route.GET(req("GET"))).status).toBe(401);
    expect((await route.PUT(req("PUT", valid))).status).toBe(401);
  });

  it("starts from the desk default, then saves for the next business day only", async () => {
    const cookie = await as("rahman");
    const before = await (await route.GET(req("GET", undefined, cookie))).json();
    expect(before.isDefault).toBe(true);
    expect(before.pending).toBeNull();

    const res = await route.PUT(req("PUT", valid, cookie));
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.effectiveFrom > before.businessDate).toBe(true);

    const after = await (await route.GET(req("GET", undefined, cookie))).json();
    expect(after.current.effectiveFrom).toBe(before.current.effectiveFrom); // today's setup is untouched
    expect(after.pending.sectors).toEqual(["Technology", "Energy"]);
    expect(after.pending.delivery).toBe("email");
    expect(after.pending.include.news).toBe(false);
    expect(after.pending.include.earnings).toBe(true); // unspecified toggles keep their default
  });

  it("rejects bad input and changes nothing", async () => {
    const cookie = await as("rahman");
    for (const bad of [
      { ...valid, sectors: [] },
      { ...valid, sectors: ["Crypto"] },
      { ...valid, products: ["Lottery tickets"] },
      { ...valid, delivery: "fax" },
      { ...valid, sendTime: "25:99" },
    ]) expect((await route.PUT(req("PUT", bad, cookie))).status).toBe(400);
    expect((await route.PUT(req("PUT", "not json", cookie))).status).toBe(400);
  });

  it("keeps one person's setup private to them", async () => {
    const other = await (await route.GET(req("GET", undefined, await as("okafor")))).json();
    expect(other.pending).toBeNull();
  });
});
