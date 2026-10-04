import type { Db } from "./db/types";
import { demoBusinessDate } from "./config";
import { runPipeline } from "./pipeline/run";

/** Seed date: the last trading day before the demo business date. */
export const SEED_ASOF = "2026-10-02";

const g = globalThis as unknown as { __mbBoot?: Promise<void>; __mbBootState?: { running: boolean; error?: string; runId?: string } };
export const bootState = () => (g.__mbBootState ??= { running: false });

/**
 * First-run convenience: seed the synthetic firm if the database is empty (embedded mode only) and
 * make sure today's briefs exist. Idempotent, and never blocks a request.
 */
export function ensureWorld(db: Db, opts: { seed: boolean }): Promise<void> {
  g.__mbBoot ??= (async () => {
    const st = bootState();
    st.running = true;
    try {
      if (opts.seed) {
        const n = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from clients`));
        if (n[0].n === 0) await db.asService((q) => q(`select app.seed_world($1::date)`, [SEED_ASOF]));
      }
      const have = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from briefs where business_date = $1`, [demoBusinessDate()]));
      const clients = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from clients`));
      if (have[0].n === 0 && clients[0].n > 0) {
        const r = await runPipeline({ db, businessDate: demoBusinessDate(), trigger: "schedule" });
        st.runId = r.runId;
        if (r.status === "failed") st.error = String(r.summary.error ?? "pipeline failed");
      }
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
    } finally {
      st.running = false;
    }
  })();
  return g.__mbBoot;
}
