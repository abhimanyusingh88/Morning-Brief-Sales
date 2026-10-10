import { appOrigin, scheduler } from '../src/lib/live/delivery';
async function main() {
  const origin = appOrigin();
  if (!origin) throw new Error('Set APP_URL to the production HTTPS origin');
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY)
    throw new Error('QStash signing keys are required');
  const client = scheduler(); // Pre-open: every five minutes from 05:00 to 09:55 ET on weekdays, so the brief is ready and emailed before 10:00.
  await client.schedules.create({
    destination: origin + '/api/live/work',
    scheduleId: 'morning-brief-refresh',
    cron: 'CRON_TZ=America/New_York */5 5-9 * * 1-5',
    retries: 2,
    body: '{}',
    headers: { 'Content-Type': 'application/json' },
  });
  // Intraday: every thirty minutes for the rest of the day keeps the brief current.
  await client.schedules.create({
    destination: origin + '/api/live/work',
    scheduleId: 'morning-brief-intraday',
    cron: 'CRON_TZ=America/New_York */30 10-20 * * 1-5',
    retries: 2,
    body: '{}',
    headers: { 'Content-Type': 'application/json' },
  });
  console.log('Configured idempotent pre-open and intraday refresh schedules.');
}
main().catch(() => {
  console.error('Schedule setup failed. Check APP_URL and QStash credentials.');
  process.exitCode = 1;
});
