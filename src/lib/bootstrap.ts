import type { Db } from './db/types';
import { demoBusinessDate } from './config';
import { runPipeline } from './pipeline/run';

/** Seed date: the last trading day before the demo business date. */
export const SEED_ASOF = '2026-10-02';

const g = globalThis as unknown as {
  __mbBoot?: Promise<void>;
  __mbBootState?: { running: boolean; error?: string; runId?: string };
};
export const bootState = () => (g.__mbBootState ??= { running: false });

/** Bump when the seed data changes shape (names, universe). Older worlds are rebuilt once. */
export const WORLD_VERSION = 2;

/**
 * Seed the synthetic firm when empty, and rebuild it once when the seed data has changed (version 2 swaps the
 * real-company equity names for fictional ones). Demo database only: in production this needs ALLOW_WORLD_RESET=1.
 */
export async function ensureWorldVersion(db: Db, embedded: boolean): Promise<void> {
  const allowed = embedded || process.env.NODE_ENV !== 'production' || process.env.ALLOW_WORLD_RESET === '1';
  const row = (
    await db.asService((q) =>
      q<{ v: number; n: number }>(
        `select coalesce((select world_version from firm_settings limit 1), 0) v, (select count(*)::int from clients) n`,
      ),
    )
  )[0];
  if (row.n > 0 && row.v >= WORLD_VERSION) return;
  if (!allowed) return;
  if (row.n > 0) {
    console.log(`[boot] refreshing the synthetic world (v${row.v} -> v${WORLD_VERSION})`);
    await db.asService((q) => q(`select app.reset_world()`));
  } else console.log('[boot] seeding the synthetic world');
  await db.asService((q) => q(`select app.seed_world($1::date)`, [SEED_ASOF]));
  await db.asService((q) => q(`update firm_settings set world_version = $1`, [WORLD_VERSION]));
}

/**
 * A run whose process died (dev-server restart, crash, failed start) would otherwise show "running" forever.
 * Runs with no step rows after two minutes never got going; anything else is stale after thirty.
 */
export async function reapStaleRuns(db: Db): Promise<number> {
  const r = await db.asService((q) =>
    q<{ id: string }>(
      `update pipeline_runs set status='failed', finished_at=now(),
       summary = coalesce(summary, '{}'::jsonb) || '{"error":"interrupted: the process stopped before this run finished"}'::jsonb
     where status='running' and (started_at < now() - interval '30 minutes'
        or (started_at < now() - interval '2 minutes' and not exists (select 1 from pipeline_steps s where s.run_id = pipeline_runs.id)))
     returning id`,
    ),
  );
  return r.length;
}

/**
 * First-run convenience: seed the synthetic firm if the database is empty (embedded mode only) and
 * make sure today's briefs exist. Idempotent, and never blocks a request.
 */
export function ensureWorld(db: Db, opts: { seed: boolean }): Promise<void> {
  g.__mbBoot ??= (async () => {
    const st = bootState();
    st.running = true;
    try {
      await reapStaleRuns(db);
      await ensureWorldVersion(db, opts.seed);
      const have = await db.asService((q) =>
        q<{ n: number }>(`select count(*)::int n from briefs where business_date = $1`, [demoBusinessDate()]),
      );
      const clients = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from clients`));
      if (have[0].n === 0 && clients[0].n > 0) {
        const r = await runPipeline({ db, businessDate: demoBusinessDate(), trigger: 'schedule' });
        st.runId = r.runId;
        if (r.status === 'failed') st.error = String(r.summary.error ?? 'pipeline failed');
      }
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
      console.error(`[boot] ${st.error}`);
    } finally {
      st.running = false;
    }
  })();
  return g.__mbBoot;
}
