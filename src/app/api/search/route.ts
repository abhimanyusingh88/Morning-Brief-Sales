import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { getFocus } from '@/lib/live/reports';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const id = meFromRequest(request);
  if (!id || !(await loadMe(id))) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const term = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  const db = await getDb(),
    focus = await getFocus(db, id);
  // Only the clients chosen in brief setup are offered, matching what the brief shows.
  const rows = await db.asUser(id, (q) =>
    q(
      'select id,name from live_clients where active and name ilike $1 and (cardinality($2::uuid[])=0 or id=any($2::uuid[])) order by name limit 12',
      ['%' + term.replace(/[\\%_]/g, '\\$&') + '%', focus.clients],
    ),
  );
  const pages = [
    { label: 'Daily market brief', href: '/brief' },
    { label: 'Client coverage', href: '/clients' },
    { label: 'Brief setup', href: '/setup' },
  ]
    .filter((p) => p.label.toLowerCase().includes(term.toLowerCase()))
    .map((p) => ({ ...p, kind: 'page' }));
  return Response.json({
    hits: [...pages, ...rows.map((r) => ({ kind: 'client', id: r.id, label: r.name, href: '/brief?client=' + r.id }))],
  });
}
