import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import type { PGlite } from '@electric-sql/pglite';
import { openPglite } from '../src/lib/db/pglite';
import { openPostgres } from '../src/lib/db/postgres';
import { runPipeline } from '../src/lib/pipeline/run';
import { reapStaleRuns } from '../src/lib/bootstrap';
import type { Db } from '../src/lib/db/types';

/**
 * Production uses postgres.js, tests elsewhere use PGlite directly. This runs the full pipeline through
 * the real postgres.js driver (wire protocol) so driver differences (JSON, numerics, dates) fail here, not in a demo.
 */
let pg: PGlite, server: PGLiteSocketServer, db: Db;
beforeAll(async () => {
  ({ pg } = await openPglite());
  await pg.query('select app.seed_world($1::date)', ['2026-10-02']);
  server = new PGLiteSocketServer({ db: pg, port: 54332, host: '127.0.0.1' });
  await server.start();
  db = openPostgres('postgres://postgres:postgres@127.0.0.1:54332/postgres', { ssl: false, max: 1 });
}, 120_000);
afterAll(async () => {
  await db?.close();
  await server?.stop();
  await pg?.close();
});

describe('pipeline through postgres.js', () => {
  it('runs every step, persists logs and publishes briefs', async () => {
    const r = await runPipeline({ db, businessDate: '2026-10-05', trigger: 'manual', useLlm: false });
    expect(r.summary.error).toBeUndefined();
    expect(r.status).toBe('succeeded');
    const steps = await db.asService((q) =>
      q<{ status: string; log: string[]; detail: { ms?: number } }>(
        `select status, log, detail from pipeline_steps where run_id = $1 order by seq`,
        [r.runId],
      ),
    );
    expect(steps).toHaveLength(17);
    expect(steps.every((s) => s.status === 'succeeded')).toBe(true);
    expect(steps[0].log.length).toBeGreaterThan(0);
    expect(typeof steps[0].detail.ms).toBe('number'); // jsonb round-trips as an object, not a string
    const n = await db.asService((q) =>
      q<{ briefs: number; cards: number }>(
        `select (select count(*) from briefs where run_id = $1)::int briefs, (select count(*) from call_cards c join briefs b on b.id = c.brief_id where b.run_id = $1)::int cards`,
        [r.runId],
      ),
    );
    expect(n[0].briefs).toBeGreaterThanOrEqual(12);
    expect(n[0].cards).toBeGreaterThan(60);
  }, 180_000);

  it("reads a salesperson's own book under row-level security", async () => {
    const [{ id }] = await db.asService((q) => q<{ id: string }>(`select app.uid('p:rahman') id`));
    const mine = await db.asUser(id, (q) => q<{ n: number }>(`select count(*)::int n from call_cards`));
    const all = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from call_cards`));
    expect(mine[0].n).toBeGreaterThan(0);
    expect(mine[0].n).toBeLessThan(all[0].n); // one person sees only their own cards
  }, 60_000);

  it('marks runs that never started as failed, leaves fresh ones alone', async () => {
    await db.asService((q) =>
      q(
        `insert into pipeline_runs (business_date, trigger, scope, status, started_at) values ('2026-10-05','schedule','all','running', now() - interval '10 minutes'), ('2026-10-05','schedule','all','running', now())`,
      ),
    );
    expect(await reapStaleRuns(db)).toBe(1);
    const r = await db.asService((q) =>
      q<{ status: string }>(`select status from pipeline_runs where status = 'running'`),
    );
    expect(r).toHaveLength(1);
  }, 60_000);
});
