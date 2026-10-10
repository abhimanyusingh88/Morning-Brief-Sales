import { getDb } from '../src/lib/db';
import { sendMorningBrief } from '../src/lib/live/email';
/** Sends today's overall brief to BRIEF_RECIPIENTS now (manual trigger; the worker sends automatically at BRIEF_SEND_AT). */
async function main() {
  const db = await getDb();
  try {
    const r = await sendMorningBrief(db, { force: true });
    console.log({ sent: r.sent.length, failed: r.failed.length, skipped: r.skipped || undefined });
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error('Send failed. Check database and Resend configuration. Secrets are not logged.');
  process.exitCode = 1;
});
