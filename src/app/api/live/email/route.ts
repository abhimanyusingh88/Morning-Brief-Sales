import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
import { recipients, sendMorningBrief } from '@/lib/live/email';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
/** Sends the current overall brief to the configured internal desk recipients (BRIEF_RECIPIENTS). */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const id = meFromRequest(request);
  if (!id || !(await loadMe(id))) return Response.json({ error: 'Profile unavailable' }, { status: 401 });
  if (!recipients().length || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)
    return Response.json({ error: 'Email delivery is not configured.' }, { status: 503 });
  try {
    const db = await getDb();
    const allowed = await db.asService((q) =>
      q(
        "insert into live_refresh_requests(profile_id,requested_at) values($1,now()) on conflict(profile_id) do update set requested_at=excluded.requested_at where live_refresh_requests.requested_at<now()-interval '1 minute' returning profile_id",
        [id],
      ),
    );
    if (!allowed.length) return Response.json({ error: 'Please wait a minute between sends.' }, { status: 429 });
    const r = await sendMorningBrief(db, { force: true });
    if (!r.sent.length)
      return Response.json({ error: 'The email could not be sent. Try again shortly.' }, { status: 502 });
    return Response.json({ sent: r.sent.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'The email could not be sent. Try again shortly.' }, { status: 503 });
  }
}
