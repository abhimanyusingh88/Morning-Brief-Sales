import type { Db } from "./types";
export type { Db, Q, Row } from "./types";

const g = globalThis as unknown as { __mbDb?: Promise<Db> };

/** One shared handle per server process. */
export function getDb(): Promise<Db> {
  if (!g.__mbDb) {
    g.__mbDb = (async () => {
      if (process.env.DEV_DB === "pglite") {
        const { openPglite } = await import("./pglite");
        return (await openPglite(process.env.PGLITE_DIR || ".data/pglite")).db;
      }
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL is not set");
      const { openPostgres } = await import("./postgres");
      return openPostgres(url);
    })();
  }
  return g.__mbDb;
}
