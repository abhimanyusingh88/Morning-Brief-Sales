import { z } from 'zod';
import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
import { getReportVersion } from '@/lib/live/reports';
import { getEffectsAnalysis, EffectsUnavailable } from '@/lib/live/effects-ai';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 150;
const Id = z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
const Body = z.object({
  report: Id,
  client: Id.nullable(),
  article: Id,
  symbol: z
    .string()
    .regex(/^[A-Z0-9.\-]{1,15}$/)
    .or(z.literal(''))
    .default(''),
});
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const id = meFromRequest(request);
  if (!id || !(await loadMe(id))) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 4096) return Response.json({ error: 'Request too large' }, { status: 413 });
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid analysis request' }, { status: 400 });
  }
  const b = Body.safeParse(value);
  if (!b.success) return Response.json({ error: 'Invalid analysis request' }, { status: 400 });
  try {
    const db = await getDb(),
      input = b.data,
      report = await getReportVersion(db, id, input.client, input.report);
    if (!report) return Response.json({ error: 'Reload the brief before requesting effects.' }, { status: 409 });
    const article = report.articles.find((a) => a.id === input.article);
    if (!article) return Response.json({ error: 'Article not available in this client scope' }, { status: 404 });
    const analysis = await getEffectsAnalysis(db, report, article, input.symbol);
    if (!(await getReportVersion(db, id, input.client, input.report)))
      return Response.json({ error: 'The client scope or evidence changed. Reload the brief.' }, { status: 409 });
    return Response.json(analysis ?? { pending: true }, {
      status: analysis ? 200 : 202,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof EffectsUnavailable ? e.message : 'Effects analysis is unavailable.' },
      { status: e instanceof EffectsUnavailable ? e.status : 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
