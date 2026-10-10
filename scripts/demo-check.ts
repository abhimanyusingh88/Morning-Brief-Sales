import { getDb } from '../src/lib/db';
import { getCoverage, getReport } from '../src/lib/live/reports';
import { appOrigin } from '../src/lib/live/delivery';
async function main() {
  const db = await getDb();
  try {
    const profiles = await db.asService((q) =>
      q<{ id: string; full_name: string }>('select id,full_name from profiles where is_active order by full_name'),
    );
    const views = [];
    for (const p of profiles) {
      const c = await getCoverage(db, p.id),
        r = await getReport(db, p.id, null);
      views.push({
        name: p.full_name,
        clients: c.clients.length,
        holdings: c.holdings.length,
        currentReport: Boolean(r),
        verifiedStories: r?.articles.length ?? 0,
        availableMetrics: r?.metrics.filter((m) => m.value !== null).length ?? 0,
      });
    }
    console.log(
      JSON.stringify(
        {
          profiles: views,
          openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
          qstashConfigured: Boolean(
            process.env.QSTASH_TOKEN && process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY,
          ),
          scheduleDestinationConfigured: Boolean(appOrigin()),
          checks: await db.asService((q) =>
            q('select source_key,succeeded,accepted,detail from live_source_checks order by source_key'),
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error('Read-only demo check failed. Check database connectivity.');
  process.exitCode = 1;
});
