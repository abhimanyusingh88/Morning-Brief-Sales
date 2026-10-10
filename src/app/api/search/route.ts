import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const id = meFromRequest(request);
  if (!id || !(await loadMe(id))) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const term = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  const rows = await (
    await getDb()
  ).asUser(id, (q) =>
    q('select id,name from live_clients where active and name ilike $1 order by name limit 12', [
      '%' + term.replace(/[\\%_]/g, '\\$&') + '%',
    ]),
  );
  const pages = [
    { label: 'Daily market brief', href: '/brief' },
    { label: 'Client coverage', href: '/clients' },
    { label: 'My interests', href: '/setup' },
  ]
    .filter((p) => p.label.toLowerCase().includes(term.toLowerCase()))
    .map((p) => ({ ...p, kind: 'page' }));
  return Response.json({
    hits: [...pages, ...rows.map((r) => ({ kind: 'client', id: r.id, label: r.name, href: '/brief?client=' + r.id }))],
  });
}
