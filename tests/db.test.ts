import { describe, expect, it } from 'vitest';
import { pid, testDb } from './helpers/testdb';

const count = async (who: string, table: string, where = 'true') => {
  const db = await testDb();
  const id = await pid(who);
  return db.asUser(
    id,
    async (q) => (await q<{ n: number }>(`select count(*)::int n from ${table} where ${where}`))[0].n,
  );
};

describe('seeded world', () => {
  it('has a realistic shape', async () => {
    const db = await testDb();
    const r = await db.asService((q) =>
      q<Record<string, number>>(`select
      (select count(*)::int from clients) clients, (select count(*)::int from profiles where role='sales') reps,
      (select count(*)::int from instruments) instruments, (select count(*)::int from positions) positions,
      (select count(*)::int from market_quotes) quotes`),
    );
    // Includes the two pilot desk profiles created by the live demonstration book (migration 0013).
    expect(r[0].reps).toBe(14);
    expect(r[0].clients).toBeGreaterThan(200);
    expect(r[0].positions).toBeGreaterThan(1200);
    expect(r[0].quotes).toBe(r[0].instruments);
  });

  it('is re-runnable and keeps ids stable', async () => {
    const db = await testDb();
    const before = await db.asService((q) => q<{ id: string }>('select id from clients order by id limit 3'));
    await db.asService(async (q) => {
      await q('select app.reset_world()');
      await q("select app.seed_world('2026-10-02')");
    });
    const after = await db.asService((q) => q<{ id: string }>('select id from clients order by id limit 3'));
    expect(after).toEqual(before);
  });

  it('business date is the next trading day', async () => {
    const db = await testDb();
    const r = await db.asService((q) => q<{ d: string }>('select business_date::text d from firm_settings'));
    expect(r[0].d).toBe('2026-10-05');
  });
});

describe('row-level security', () => {
  it('a salesperson sees only their own book', async () => {
    const own = await count('raman', 'clients');
    const total = await (
      await testDb()
    )
      .asService((q) => q<{ n: number }>('select count(*)::int n from clients'))
      .then((r) => r[0].n);
    expect(own).toBeGreaterThan(15);
    expect(own).toBeLessThan(total / 4);
  });

  it('positions and trades follow the same boundary', async () => {
    const db = await testDb();
    const id = await pid('raman');
    const leaks = await db.asUser(
      id,
      async (q) =>
        (
          await q<{ n: number }>(
            `select count(*)::int n from positions p
        where not exists (select 1 from coverage c where c.client_id = p.client_id and c.profile_id = $1)`,
            [id],
          )
        )[0].n,
    );
    expect(leaks).toBe(0);
  });

  it('two salespeople on different desks have disjoint visible clients', async () => {
    const db = await testDb();
    const [a, b] = [await pid('raman'), await pid('beaumont')];
    const ids = async (p: string) =>
      db.asUser(p, async (q) => (await q<{ id: string }>('select id from clients')).map((r) => r.id));
    const [ca, cb] = [await ids(a), await ids(b)];
    expect(ca.filter((x) => cb.includes(x))).toEqual([]);
  });

  it('a desk head sees the desk but not the other desk', async () => {
    const head = await count('delaney', 'clients');
    const rep = await count('raman', 'clients');
    const other = await count('kessler', 'clients');
    expect(head).toBeGreaterThan(rep * 3);
    const all = await (
      await testDb()
    )
      .asService((q) => q<{ n: number }>('select count(*)::int n from clients'))
      .then((r) => r[0].n);
    expect(head + other).toBe(all);
  });

  it('restricted (information-barrier) events are visible to compliance only', async () => {
    expect(await count('raman', 'events', "entitlement = 'restricted_ib'")).toBe(0);
    expect(await count('delaney', 'events', "entitlement = 'restricted_ib'")).toBe(0);
    expect(await count('overton', 'events', "entitlement = 'restricted_ib'")).toBeGreaterThan(0);
  });

  it("cannot log an interaction against someone else's client", async () => {
    const db = await testDb();
    const me = await pid('raman');
    const foreign = await db.asService((q) =>
      q<{ id: string }>(
        "select c.id from clients c join coverage cv on cv.client_id = c.id where cv.profile_id = app.uid('p:beaumont') limit 1",
      ),
    );
    await expect(
      db.asUser(me, (q) =>
        q(
          `insert into interactions (id, client_id, profile_id, kind, occurred_at, subject, note)
        values (gen_random_uuid(), $1, $2, 'call', now(), 'x', 'y')`,
          [foreign[0].id, me],
        ),
      ),
    ).rejects.toThrow();
  });

  it("cannot write another person's call cards or preferences", async () => {
    const db = await testDb();
    const me = await pid('raman');
    const rows = await db.asUser(me, (q) =>
      q("update preferences set max_cards = 5 where profile_id = app.uid('p:okafor') returning profile_id"),
    );
    expect(rows).toHaveLength(0);
  });

  it('unauthenticated role sees nothing', async () => {
    const db = await testDb();
    const n = await db
      .asService(async (q) => {
        await q('set local role anon');
        return (await q<{ n: number }>('select count(*)::int n from clients'))[0]?.n;
      })
      .catch(() => 0);
    expect(n ?? 0).toBe(0);
  });
});
