import { afterEach, expect, it, vi } from "vitest";
import type { Db } from "../src/lib/db/types";

const mocks = vi.hoisted(() => ({ openPostgres: vi.fn() }));
vi.mock("../src/lib/db/postgres", () => ({ openPostgres: mocks.openPostgres }));

const cache = globalThis as unknown as { __mbDb?: Promise<Db>; __mbDbVersion?: number };

afterEach(() => {
  delete cache.__mbDb;
  delete cache.__mbDbVersion;
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("replaces a connection cached before the JSON serialization fix and shares the new handle", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://unused/unused");
  vi.stubEnv("DEV_DB", "");
  vi.stubEnv("MB_NO_BOOT", "1");
  const oldClose = vi.fn().mockResolvedValue(undefined);
  cache.__mbDb = Promise.resolve({ close: oldClose } as unknown as Db);
  const fresh = { close: vi.fn() } as unknown as Db;
  mocks.openPostgres.mockImplementation(() => {
    expect(oldClose).toHaveBeenCalledOnce();
    return fresh;
  });
  const { getDb } = await import("../src/lib/db");
  const first = getDb();
  expect(getDb()).toBe(first);
  expect(await first).toBe(fresh);
  expect(mocks.openPostgres).toHaveBeenCalledOnce();
});
