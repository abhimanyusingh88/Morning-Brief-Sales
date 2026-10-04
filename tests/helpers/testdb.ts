import { openPglite } from "../../src/lib/db/pglite";
import type { Db } from "../../src/lib/db/types";

let cached: Promise<Db> | undefined;
export const ASOF = "2026-10-02";

/** One seeded in-memory database per test file process. */
export function testDb(): Promise<Db> {
  cached ??= (async () => {
    const { db } = await openPglite();
    await db.asService((q) => q("select app.seed_world($1::date)", [ASOF]));
    return db;
  })();
  return cached;
}

export const pid = (slug: string) => testDb().then((db) => db.asService((q) => q<{ id: string }>("select app.uid($1) id", [`p:${slug}`]))).then((r) => r[0].id);
