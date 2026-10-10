import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { listThreads } from '@/lib/live/threads';
import { validDay } from '@/lib/live/reports';
export const dynamic = 'force-dynamic';
/** The current person's analyst conversations, newest first; `?date=` keeps those about that day's brief. */
export async function GET(request: Request) {
  const id = meFromRequest(request);
  if (!id || !(await loadMe(id))) return Response.json({ error: 'Profile unavailable' }, { status: 401 });
  const day = new URL(request.url).searchParams.get('date');
  if (day && !validDay(day)) return Response.json({ error: 'Invalid date' }, { status: 400 });
  try {
    return Response.json(
      { threads: await listThreads(await getDb(), id, day ?? undefined) },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return Response.json({ error: 'History unavailable' }, { status: 503 });
  }
}
