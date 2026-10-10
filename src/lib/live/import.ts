import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import type { Db } from '../db/types';
import { uid } from '../util/id';
const HEADERS = [
  'Investment Manager',
  'Account',
  'Client Fund',
  'Direction',
  'Ticker',
  'Quantity',
  'Current Market Value',
  'Initial Market Value',
  'Spread',
  'Margin',
];
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: false,
});
const array = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
type Cell = { '@_r': string; '@_t'?: string; v?: string; f?: unknown; is?: { t?: string } };
type RawRow = { '@_r': string; c?: Cell[] };
export type ImportRow = {
  row: number;
  manager: string;
  account: string;
  fund: string;
  direction: 'Long' | 'Short';
  symbol: string;
  quantity: string;
  currentValue: string;
  initialValue: string;
  spread: string;
  margin: string;
};
export type ImportData = { hash: string; rows: ImportRow[]; issues: { row: number; message: string }[] };
export function parseWorkbook(bytes: Uint8Array): ImportData {
  if (bytes.length > 10_000_000) throw new Error('Workbook exceeds the ten megabyte import limit');
  const entries = unzipSync(bytes, { filter: (f) => f.originalSize < 5_000_000 });
  const read = (p: string) => {
    const b = entries[p];
    if (!b) throw new Error('Required XLSX part is missing: ' + p);
    return xml.parse(strFromU8(b));
  };
  const wb = read('xl/workbook.xml');
  const sheets = array(wb.workbook.sheets.sheet) as { '@_name': string; '@_r:id': string }[];
  const sheet = sheets.find((s) => s['@_name'] === 'Sheet1');
  if (!sheet) throw new Error('Sheet1 is required');
  const rels = array(read('xl/_rels/workbook.xml.rels').Relationships.Relationship) as {
    '@_Id': string;
    '@_Target': string;
  }[];
  const target = rels.find((r) => r['@_Id'] === sheet['@_r:id'])?.['@_Target'];
  if (!target || target.includes('..') || target.includes(':')) throw new Error('Invalid worksheet relationship');
  const sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
  const strings = entries['xl/sharedStrings.xml']
    ? array(read('xl/sharedStrings.xml').sst.si).map((s: unknown) => {
        const x = s as { t?: string; r?: { t: string }[] };
        return (
          x.t ??
          array(x.r)
            .map((r) => r.t)
            .join('')
        );
      })
    : [];
  const raw = array(read(sheetPath).worksheet.sheetData.row) as RawRow[];
  const fields = (r: RawRow) =>
    Object.fromEntries(
      array(r.c).map((c) => {
        if (c.f != null) throw new Error('Formula cells are not accepted at ' + c['@_r']);
        const val = c['@_t'] === 's' ? strings[Number(c.v)] : c['@_t'] === 'inlineStr' ? c.is?.t : c.v;
        return [c['@_r'].replace(/[0-9]/g, ''), String(val ?? '').trim()];
      }),
    );
  const head = fields(raw.find((r) => Number(r['@_r']) === 1) ?? { '@_r': '1' });
  if (HEADERS.some((h, i) => head[String.fromCharCode(65 + i)] !== h))
    throw new Error('Workbook columns must match the supplied client data template');
  const rows: ImportRow[] = [];
  const issues: ImportData['issues'] = [];
  const keys = new Set<string>();
  const accounts = new Map<string, string>();
  for (const r of raw.filter((r) => Number(r['@_r']) > 1)) {
    const f = fields(r);
    const n = Number(r['@_r']);
    if (!Object.values(f).some(Boolean)) continue;
    if (!f.A && !f.B && !f.C && !f.D && !f.E) {
      issues.push({ row: n, message: 'Ignored stray content outside client records' });
      continue;
    }
    if (!f.A || !f.B || !f.C || !['Long', 'Short'].includes(f.D) || !/^[A-Z0-9.\-]{1,15}$/.test(f.E ?? ''))
      throw new Error('Invalid identifiers or direction at row ' + n);
    for (const col of ['F', 'G', 'H', 'I', 'J'])
      if (!/^-?\d+(?:\.\d+)?$/.test(f[col] ?? '') || !Number.isFinite(Number(f[col])))
        throw new Error('Invalid numeric value at ' + col + n);
    if (Number(f.F) < 0 || Number(f.G) < 0 || Number(f.H) < 0)
      throw new Error('Negative quantity or market value at row ' + n);
    const owner = f.A + '|' + f.C;
    if (accounts.has(f.B) && accounts.get(f.B) !== owner) throw new Error('Conflicting account ownership at row ' + n);
    accounts.set(f.B, owner);
    const key = f.B + '|' + f.E + '|' + f.D;
    if (keys.has(key)) throw new Error('Duplicate position at row ' + n);
    keys.add(key);
    rows.push({
      row: n,
      manager: f.A,
      account: f.B,
      fund: f.C,
      direction: f.D as 'Long' | 'Short',
      symbol: f.E,
      quantity: f.F,
      currentValue: f.G,
      initialValue: f.H,
      spread: f.I,
      margin: f.J,
    });
    if (Number(f.H) > 0 && Number(f.G) / Number(f.H) > 20)
      issues.push({
        row: n,
        message: 'Large difference between supplied current and initial values; preserved without adjustment',
      });
  }
  if (!rows.length) throw new Error('Workbook contains no client records');
  issues.push({
    row: 0,
    message:
      'Currency, valuation date, quantity unit, spread and margin units are not supplied. Values are preserved; no exposure or P&L is inferred.',
  });
  return { hash: createHash('sha256').update(bytes).digest('hex'), rows, issues };
}
export const PILOT_PEOPLE = [
  { key: 'sales-1', name: 'Aisha Rahman', initials: 'AR', email: 'sales1@pilot.invalid', hue: 190 },
  { key: 'sales-2', name: 'Daniel Morgan', initials: 'DM', email: 'sales2@pilot.invalid', hue: 220 },
];
export async function importBook(
  db: Db,
  data: ImportData,
  filename: string,
): Promise<{ clients: number; accounts: number; holdings: number }> {
  return db.asService(async (q) => {
    const imp = (
      await q<{ id: string }>(
        'insert into live_imports(file_hash,filename,row_count,issues) values($1,$2,$3,$4::jsonb) on conflict(file_hash) do update set filename=excluded.filename returning id',
        [data.hash, filename, data.rows.length, JSON.stringify(data.issues)],
      )
    )[0].id;
    for (const p of PILOT_PEOPLE) {
      await q(
        "insert into profiles(id,auth_user_id,email,full_name,initials,title,role,region,timezone,avatar_hue,is_active) values($1,$1,$2,$3,$4,$5,'sales','New York','America/New_York',$6,true) on conflict(id) do update set is_active=true,auth_user_id=coalesce(profiles.auth_user_id,excluded.auth_user_id)",
        [uid('live:' + p.key), p.email, p.name, p.initials, 'Equity sales', p.hue],
      );
      await q(
        "insert into live_preferences(profile_id,timezone) values($1,'America/New_York') on conflict do nothing",
        [uid('live:' + p.key)],
      );
    }
    // Archive old demo identities reversibly. No existing client or history table is deleted.
    await q('update profiles set is_active=false where id<>all($1::uuid[])', [
      PILOT_PEOPLE.map((p) => uid('live:' + p.key)),
    ]);
    // The demonstration book is kept; only records from earlier workbook imports are archived.
    const demo = "(select id from live_imports where file_hash='demo-book-v1')";
    await q('update live_holdings set active=false where import_id not in ' + demo);
    await q('update live_accounts set active=false where import_id not in ' + demo);
    await q(
      'update live_clients set active=false where not exists(select 1 from live_accounts a where a.client_id=live_clients.id and a.import_id in ' +
        demo +
        ')',
    );
    const managers = [...new Set(data.rows.map((r) => r.manager))].sort();
    for (let i = 0; i < managers.length; i++) {
      const manager = managers[i],
        id = uid('live:client:' + manager);
      await q(
        'insert into live_clients(id,name) values($1,$2) on conflict(id) do update set name=excluded.name, active=true',
        [id, manager],
      );
      // Keep all accounts of a manager together. Explicit initial mapping: Y Shares to salesperson two.
      const person = manager === 'Y Shares' ? 'sales-2' : 'sales-1';
      await q(
        'insert into live_coverage(profile_id,client_id) select $1,$2 where not exists(select 1 from live_coverage where client_id=$2) on conflict do nothing',
        [uid('live:' + person), id],
      );
    }
    for (const r of data.rows) {
      const account = uid('live:account:' + r.account);
      await q(
        'insert into live_accounts(id,client_id,external_id,name,import_id) values($1,$2,$3,$4,$5) on conflict(id) do update set client_id=excluded.client_id,name=excluded.name,import_id=excluded.import_id,active=true',
        [account, uid('live:client:' + r.manager), r.account, r.fund, imp],
      );
      await q(
        'insert into live_holdings(id,account_id,symbol,direction,quantity,current_value,initial_value,spread,margin,source_row,import_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(id) do update set quantity=excluded.quantity,current_value=excluded.current_value,initial_value=excluded.initial_value,spread=excluded.spread,margin=excluded.margin,source_row=excluded.source_row,import_id=excluded.import_id,active=true',
        [
          uid('live:holding:' + r.account + ':' + r.symbol + ':' + r.direction),
          account,
          r.symbol,
          r.direction,
          r.quantity,
          r.currentValue,
          r.initialValue,
          r.spread,
          r.margin,
          r.row,
          imp,
        ],
      );
    }
    return {
      clients: managers.length,
      accounts: new Set(data.rows.map((r) => r.account)).size,
      holdings: data.rows.length,
    };
  });
}
