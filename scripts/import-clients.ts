import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseWorkbook, importBook } from '../src/lib/live/import';
import { getDb } from '../src/lib/db';
async function main() {
  const file = process.argv.find((a) => a.endsWith('.xlsx'));
  if (!file) throw new Error('Usage: npm run clients:import -- "path/to/client.xlsx" [--apply]');
  const data = parseWorkbook(await readFile(file));
  console.log(
    JSON.stringify(
      {
        records: data.rows.length,
        managers: [...new Set(data.rows.map((r) => r.manager))],
        accounts: data.rows.map((r) => r.account),
        symbols: data.rows.map((r) => r.symbol),
        issues: data.issues,
      },
      null,
      2,
    ),
  );
  if (!process.argv.includes('--apply')) {
    console.log('Dry run only. Add --apply to import.');
    return;
  }
  const db = await getDb();
  try {
    const before = await db.asService((q) => q('select id,is_active from profiles'));
    await mkdir('.data/backups', { recursive: true });
    await writeFile(path.join('.data/backups', 'profiles-before-' + Date.now() + '.json'), JSON.stringify(before));
    console.log(await importBook(db, data, path.basename(file)));
  } finally {
    await db.close();
  }
}
main().catch(() => {
  console.error('Client import failed. Check source validation, database connectivity, and server configuration.');
  process.exitCode = 1;
});
