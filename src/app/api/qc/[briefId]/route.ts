import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getBriefForReview, isOpsRole, OpsError, reviewBrief } from '@/lib/data/ops';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({ action: z.enum(['hold', 'release']), note: z.string().max(1000).optional() });

async function operator(req: Request) {
  const id = meFromRequest(req);
  return id ? loadMe(id) : null;
}

/** A brief as its salesperson will see it, for the QC reviewer. Read under the reviewer's own permissions (row-level security). */
export async function GET(req: Request, ctx: { params: Promise<{ briefId: string }> }) {
  const { briefId } = await ctx.params;
  const me = await operator(req);
  if (!me) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  if (!isOpsRole(me.role)) return NextResponse.json({ error: 'not allowed' }, { status: 403 });
  if (!UUID.test(briefId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const review = await getBriefForReview(await getDb(), me.id, briefId);
  if (!review) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(review);
}

/**
 * Hold or release a brief. Desk heads, admins and compliance only. Holding makes the brief a draft and removes its
 * deliveries; releasing publishes it at the salesperson's send time. Nothing here sends anything to a client.
 */
export async function POST(req: Request, ctx: { params: Promise<{ briefId: string }> }) {
  const { briefId } = await ctx.params;
  const me = await operator(req);
  if (!me) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  if (!isOpsRole(me.role)) return NextResponse.json({ error: 'not allowed' }, { status: 403 });
  if (!UUID.test(briefId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: 'action must be hold or release; note is at most 1000 characters' },
      { status: 400 },
    );
  try {
    const out = await reviewBrief(await getDb(), me, briefId, parsed.data.action, parsed.data.note);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof OpsError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
