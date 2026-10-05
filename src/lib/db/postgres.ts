import postgres from "postgres";
import type { Db, Q } from "./types";
import { normalizeDatabaseUrl } from "./url";

/**
 * Our queries pass JSON as an already-stringified parameter (`$1::jsonb`), the same way the embedded
 * database does. postgres.js would stringify it a second time and store a JSON *string*, so
 * strings pass through untouched and only real objects are serialised.
 */
const jsonParam = (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x));
export const jsonTypes = {
  json: { to: 114, from: [114], serialize: jsonParam, parse: (x: string) => JSON.parse(x) },
  jsonb: { to: 3802, from: [3802], serialize: jsonParam, parse: (x: string) => JSON.parse(x) },
};

export function openPostgres(url: string, opts: { ssl?: boolean; max?: number } = {}): Db {
  // Supabase pooler runs in transaction mode: no prepared statements.
  const sql = postgres(normalizeDatabaseUrl(url), { prepare: false, max: opts.max ?? 10, idle_timeout: 20, connect_timeout: 15, ssl: opts.ssl === false ? false : "require", types: jsonTypes });
  const runner = (tx: postgres.TransactionSql): Q =>
    (async (text: string, params?: unknown[]) => (await tx.unsafe(text, params as never[])) as unknown as never[]) as Q;
  return {
    asUser: (profileId, fn) =>
      sql.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: profileId, role: "authenticated" })]);
        return fn(runner(tx));
      }) as never,
    asService: (fn) => sql.begin(async (tx) => fn(runner(tx))) as never,
    close: () => sql.end({ timeout: 2 }),
  };
}
