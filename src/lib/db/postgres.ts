import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
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
  const sql = postgres(normalizeDatabaseUrl(url), {
    prepare: false,
    max: opts.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: opts.ssl === false ? false : "require",
    types: jsonTypes,
  });
  const runner = (tx: postgres.TransactionSql): Q =>
    (async (text: string, params?: unknown[]) => (await tx.unsafe(text, params as never[])) as unknown as never[]) as Q;
  return {
    asUser: (profileId, fn) =>
      sql.begin(async (tx) => {
        const identities=await tx.unsafe('select auth_user_id from profiles where id=$1 and is_active',[profileId]);
        const subject=identities[0]?.auth_user_id??profileId;
        await tx.unsafe("set local role authenticated");
        await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: subject, role: "authenticated" })]);
        return fn(runner(tx));
      }) as never,
    asService: (fn) => sql.begin(async (tx) => fn(runner(tx))) as never,
    migrate: () => migrate(sql),
    close: () => sql.end({ timeout: 2 }),
  };
}

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
/** Migrations 0001-0004 were applied by hand before this runner existed; record them rather than re-running. */
const BASELINE = 4;

async function migrate(sql: postgres.Sql): Promise<string[]> {
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx.unsafe("select pg_advisory_xact_lock(7283461)"); // two processes starting together must not both migrate
    await tx.unsafe("create table if not exists public._migrations (name text primary key, at timestamptz default now())");
    const done = new Set((await tx.unsafe("select name from public._migrations")).map((r) => String(r.name)));
    if (!done.size) {
      const has = await tx.unsafe("select to_regclass('public.firm_settings') is not null as t");
      if (has[0]?.t) for (const f of files.slice(0, BASELINE)) { await tx.unsafe("insert into public._migrations(name) values ($1) on conflict do nothing", [f]); done.add(f); }
    }
    for (const f of files) {
      if (done.has(f)) continue;
      await tx.unsafe(await readFile(path.join(MIGRATIONS, f), "utf8"));
      await tx.unsafe("insert into public._migrations(name) values ($1)", [f]);
      applied.push(f);
    }
  });
  return applied;
}
