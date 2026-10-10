/** Run the morning pipeline from the command line, against whatever database the environment points to. */
import { getDb } from '../src/lib/db';
import { runPipeline } from '../src/lib/pipeline/run';
import { demoBusinessDate } from '../src/lib/config';
import { ensureWorld } from '../src/lib/bootstrap';
import { isEmbedded } from '../src/lib/db';

async function main() {
  process.env.MB_NO_BOOT = '1'; // we drive bootstrap ourselves
  const db = await getDb();
  if (isEmbedded()) await ensureWorld(db, { seed: true });
  const date = process.argv[2] || demoBusinessDate();
  const r = await runPipeline({ db, businessDate: date, trigger: 'manual' });
  console.log(JSON.stringify({ status: r.status, ...r.summary }, null, 2));
  await db.close();
  process.exit(r.status === 'succeeded' ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
