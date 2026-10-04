import postgres from "postgres";
import type { Db, Q } from "./types";

export function openPostgres(url: string): Db {
  // Supabase pooler runs in transaction mode: no prepared statements.
  const sql = postgres(url, { prepare: false, max: 10, idle_timeout: 20, connect_timeout: 15, ssl: "require" });
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
