import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { openPostgres } from "@/lib/db/postgres";
import type { Db } from "@/lib/db/types";

// Runs the real postgres.js driver (what production uses) over the wire against an in-process Postgres.
let pg: PGlite, server: PGLiteSocketServer, db: Db;
beforeAll(async () => {
  pg = await PGlite.create();
  await pg.exec("create table t (id int, detail jsonb, tags text[]); create table s (run_id uuid, seq int, key text)");
  server = new PGLiteSocketServer({ db: pg, port: 54331, host: "127.0.0.1" });
  await server.start();
  db = openPostgres("postgres://postgres:postgres@127.0.0.1:54331/postgres", { ssl: false, max: 1 });
});
afterAll(async () => { await db.close(); await server.stop(); await pg.close(); });

describe("postgres.js adapter", () => {
  it("accepts stringified JSON for jsonb_array_elements (the pipeline step insert)", async () => {
    await db.asService((q) => q(
      `insert into s (run_id, seq, key) select $1, (x->>'seq')::int, x->>'key' from jsonb_array_elements($2::jsonb) x`,
      ["46823371-269d-4954-a811-93a45ca716a8", JSON.stringify([{ seq: 1, key: "a" }, { seq: 2, key: "b" }])],
    ));
    const r = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from s`));
    expect(r[0].n).toBe(2);
  });
  it("stores a jsonb object and text[] and reads them back as objects", async () => {
    await db.asService((q) => q(`insert into t (id, detail, tags) values (1, $1::jsonb, $2::text[])`, [JSON.stringify({ ms: 12, ok: true }), ["x", "y"]]));
    const r = await db.asService((q) => q<{ detail: { ms: number }; kind: string; tags: string[] }>(`select detail, jsonb_typeof(detail) kind, tags from t where id = 1`));
    expect(r[0].kind).toBe("object");
    expect(r[0].detail.ms).toBe(12);
    expect(r[0].tags).toEqual(["x", "y"]);
  });
});
