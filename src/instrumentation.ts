/**
 * Local/self-hosted worker. On Vercel the QStash schedule (scripts/setup-schedule.ts) and Vercel Cron drive
 * the same idempotent cycle instead. Disable with BRIEF_WORKER=off.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.VERCEL || process.env.BRIEF_WORKER === 'off' || process.env.NODE_ENV === 'test') return;
  const { startWorker } = await import('./lib/live/worker');
  startWorker();
}
