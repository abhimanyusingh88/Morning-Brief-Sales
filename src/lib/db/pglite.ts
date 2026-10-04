import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Db, Q } from "./types";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");

async function applyMigrations(pg: PGlite) {
  const stubs = await readFile(path.join(process.cwd(), "src/lib/db/local-stubs.sql"), "utf8");
  await pg.exec(stubs);
  await pg.exec("create table if not exists public._migrations (name text primary key, at timestamptz default now())");
  const done = new Set((await pg.query<{ name: string }>("select name from public._migrations")).rows.map((r) => r.name));
  const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    await pg.exec(await readFile(path.join(MIGRATIONS, f), "utf8"));
    await pg.query("insert into public._migrations(name) values ($1)", [f]);
  }
}

export async function openPglite(dataDir?: string): Promise<{ db: Db; pg: PGlite }> {
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  await applyMigrations(pg);

  const runner = (tx: { query: PGlite["query"] }): Q =>
    (async (text: string, params?: unknown[]) => (await tx.query(text, params as never[])).rows) as Q;

  // PGlite is single-connection; serialise transactions so concurrent requests don't interleave.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T,>(f: () => Promise<T>): Promise<T> => {
    const next = chain.then(f, f);
    chain = next.catch(() => undefined);
    return next;
  };

  const db: Db = {
    asUser: (profileId, fn) =>
      serial(() =>
        pg.transaction(async (tx) => {
          await tx.query("set local role authenticated");
          await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: profileId, role: "authenticated" })]);
          return fn(runner(tx));
        }),
      ),
    asService: (fn) => serial(() => pg.transaction(async (tx) => fn(runner(tx)))),
    close: () => pg.close(),
  };
  return { db, pg };
}
