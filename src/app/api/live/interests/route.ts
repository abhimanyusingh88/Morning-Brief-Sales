import { z } from 'zod';
import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
import { TOPICS } from '@/lib/live/types';
import { publishReports } from '@/lib/live/reports';
export const dynamic = 'force-dynamic';
const Body = z.object({
  sectors: z.array(z.enum(TOPICS)).max(TOPICS.length),
  symbols: z.array(z.string().regex(/^[A-Z0-9.\-]{1,15}$/)).max(20),
});
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const id = meFromRequest(request);
  if (!id || !(await loadMe(id))) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const b = Body.safeParse(await request.json().catch(() => null));
  if (!b.success)
    return Response.json({ error: 'Select valid topics and up to twenty stock tickers' }, { status: 400 });
  try {
    const db = await getDb();
    await db.asUser(id, (q) =>
      q(
        "insert into live_preferences(profile_id,sectors,symbols,timezone) values($1,$2,$3,'America/New_York') on conflict(profile_id) do update set sectors=excluded.sectors,symbols=excluded.symbols,timezone=excluded.timezone,updated_at=now()",
        [id, [...new Set(b.data.sectors)], [...new Set(b.data.symbols)]],
      ),
    );
    await publishReports(db);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Interests could not be saved. Please try again.' }, { status: 503 });
  }
}
