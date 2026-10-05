import type { Db } from "./types";
export type { Db, Q, Row } from "./types";

const g = globalThis as unknown as { __mbDb?: Promise<Db>; __mbDbVersion?: number };
// Bump when connection configuration changes: Next hot reload preserves globals.
const DB_VERSION = 2;

/** One shared handle per server process. */
export function getDb(): Promise<Db> {
  if (!g.__mbDb || g.__mbDbVersion !== DB_VERSION) {
    const previous = g.__mbDb;
    g.__mbDbVersion = DB_VERSION;
    g.__mbDb = (async () => {
      if (previous) await previous.then((db) => db.close()).catch(() => undefined);
      const embedded = process.env.DEV_DB === "pglite" || (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production");
      let db: Db;
      if (embedded) {
        const { openPglite } = await import("./pglite");
        db = (await openPglite(process.env.PGLITE_DIR || ".data/pglite")).db;
      } else {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL is not set");
        const { openPostgres } = await import("./postgres");
        db = openPostgres(url);
      }
      // Seed (embedded only) and prepare today's briefs in the background; pages show progress meanwhile.
      if (!process.env.VITEST && !process.env.MB_NO_BOOT) {
        const { ensureWorld } = await import("../bootstrap");
        void ensureWorld(db, { seed: embedded });
      }
      return db;
    })();
  }
  return g.__mbDb;
}

export const isEmbedded = () => process.env.DEV_DB === "pglite" || (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production");
