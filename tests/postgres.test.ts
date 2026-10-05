import { afterAll, describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";

const driver = vi.hoisted(() => ({ sql: null as unknown as postgres.Sql }));

vi.mock("postgres", async (importOriginal) => {
  const { default: actual } = await importOriginal<{ default: typeof postgres }>();
  return {
    default: (...args: Parameters<typeof actual>) => {
      const sql = actual(...args);
      driver.sql = sql;
      return sql;
    },
  };
});

import { openPostgres } from "../src/lib/db/postgres";

const db = openPostgres("postgres://unused:unused@localhost/unused");
const pg = new PGlite();

afterAll(async () => {
  await db.close();
  await pg.close();
});

describe("Postgres JSON parameter serialization", () => {
  it.each([114, 3802])("keeps JSON arrays expandable for type %i", async (oid) => {
    // Use the real driver's configured wire serializer, then let PostgreSQL
    // evaluate the same array expansion used to initialize pipeline steps.
    const serialize = driver.sql.options.serializers[oid];
    const rows = [{ seq: 1, key: "ingest_market" }, { seq: 2, key: "ingest_news" }];
    const result = await pg.query(
      "select (x->>'seq')::int seq, x->>'key' key from jsonb_array_elements($1::jsonb) x",
      [serialize(JSON.stringify(rows))],
    );
    expect(result.rows).toEqual(rows);
  });

  it("preserves nested arrays and objects in pipeline payloads", async () => {
    const serialize = driver.sql.options.serializers[3802];
    const payload = { tags: ["macro", "rates"], detail: { rows: 2 } };
    const result = await pg.query(
      "select array(select jsonb_array_elements_text($1::jsonb->'tags')) tags, $1::jsonb->'detail' detail",
      [serialize(JSON.stringify(payload))],
    );
    expect(result.rows).toEqual([payload]);
  });

  it("still serializes native values and parses JSON results", () => {
    for (const oid of [114, 3802]) {
      const payload = { summary: { published: 12 } };
      const serialize = driver.sql.options.serializers[oid];
      const parse = driver.sql.options.parsers[oid];
      expect(parse(serialize(payload))).toEqual(payload);
      expect(parse(serialize(JSON.stringify(payload)))).toEqual(payload);
    }
  });
});
