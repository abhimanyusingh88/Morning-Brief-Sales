import { getDb } from '../src/lib/db';
import { businessDate } from '../src/lib/live/time';
/** Read-only health summary of today's brief inputs. */
async function main() {
  const db = await getDb();
  try {
    const d = businessDate();
    const r = await db.asService(async (q) => ({
      articles: (
        await q(
          "select count(*)::int n,count(distinct publisher)::int p from live_articles where event_date=$1 and status='verified'",
          [d],
        )
      )[0],
      desk:
        (
          await q(
            "select payload->>'method' m,jsonb_array_length(payload->'keyEvents') k from live_desk_notes where business_date=$1 order by created_at desc limit 1",
            [d],
          )
        )[0] ?? null,
      sources: await q('select source_key,succeeded,accepted from live_source_checks order by source_key'),
      clients: (await q('select count(*)::int n from live_clients where active'))[0],
    }));
    console.log(JSON.stringify(r));
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error('Status failed', e instanceof Error ? e.message : '');
  process.exitCode = 1;
});
