import cron from 'node-cron';
import { getDb } from '../db';
import { refresh } from './jobs';
// Kept on globalThis: a dev-server reload re-evaluates this module, and a module-level flag would then schedule a
// second copy of every job alongside the first.
const g = globalThis as unknown as { __mbWorker?: { started: boolean; running: boolean } };
const state = (g.__mbWorker ??= { started: false, running: false });
async function tick() {
  if (state.running) return;
  state.running = true;
  try {
    const db = await getDb();
    const r = await refresh(db, { budgetMs: 170000 });
    console.log('[worker] cycle complete', r.completed, 'jobs,', r.failed, 'failed');
  } catch {
    console.warn('[worker] cycle failed; the next run retries');
  } finally {
    state.running = false;
  }
}
/**
 * Weekdays: every five minutes from 05:00 to 09:55 ET (brief built and emailed before 10:00), then every thirty
 * minutes. Weekends: every two hours, so Saturday and Sunday still have a brief from the day's news.
 */
export function startWorker() {
  if (state.started) return;
  state.started = true;
  const tz = { timezone: 'America/New_York' };
  cron.schedule('*/5 5-9 * * 1-5', tick, tz);
  cron.schedule('*/30 10-20 * * 1-5', tick, tz);
  cron.schedule('0 6-20/2 * * 0,6', tick, tz);
  console.log('[worker] morning brief schedule active (America/New_York)');
  // One cycle shortly after start, so a server started outside the schedule (evening, or mid-slot) does not wait
  // hours for its first refresh. The cycle is idempotent, so overlapping with a scheduled one is harmless.
  setTimeout(() => void tick(), 15000).unref?.();
}
