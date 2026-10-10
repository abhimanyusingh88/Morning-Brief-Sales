import { openPglite } from '../../src/lib/db/pglite';
import type { Db } from '../../src/lib/db/types';
import { DB_VERSION } from '../../src/lib/db';

let cached: Promise<Db> | undefined;
export const ASOF = '2026-10-02';

/** Install the seeded handle with the current cache version for API tests. */
export function installTestDb() {
  Object.assign(globalThis, { __mbDb: testDb(), __mbDbVersion: DB_VERSION });
}

/** One seeded in-memory database per test file process. */
export function testDb(): Promise<Db> {
  cached ??= (async () => {
    const { db } = await openPglite();
    await db.asService((q) => q('select app.seed_world($1::date)', [ASOF]));
    return db;
  })();
  return cached;
}

export const pid = (slug: string) =>
  testDb()
    .then((db) => db.asService((q) => q<{ id: string }>('select app.uid($1) id', [`p:${slug}`])))
    .then((r) => r[0].id);
