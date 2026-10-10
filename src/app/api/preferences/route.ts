import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const Body = z.object({
  maxCards: z.number().int().min(3).max(20),
  tone: z.enum(['concise', 'detailed']),
  includeMacro: z.boolean(),
  briefTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  focusTags: z.array(z.string().min(1).max(40)).max(10),
});

async function who(req: Request) {
  const id = meFromRequest(req);
  return id ? loadMe(id) : null;
}

export async function GET(req: Request) {
  const me = await who(req);
  if (!me) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const db = await getDb();
  const r = (
    await db.asUser(me.id, (q) =>
      q(
        `select max_cards, tone, include_macro, to_char(brief_time, 'HH24:MI') brief_time, focus_tags from preferences where profile_id = $1`,
        [me.id],
      ),
    )
  )[0];
  return NextResponse.json({
    maxCards: r?.max_cards ?? 8,
    tone: r?.tone ?? 'concise',
    includeMacro: r?.include_macro ?? true,
    briefTime: r?.brief_time ?? '06:30',
    focusTags: r?.focus_tags ?? [],
  });
}

/** Takes effect from the next morning run. */
export async function PUT(req: Request) {
  const me = await who(req);
  if (!me) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? 'invalid' }, { status: 400 });
  const db = await getDb();
  await db.asUser(me.id, async (q) => {
    await q(
      `insert into preferences (profile_id, max_cards, tone, include_macro, brief_time, focus_tags, updated_at) values ($1, $2, $3, $4, $5::time, $6::text[], now())
       on conflict (profile_id) do update set max_cards = excluded.max_cards, tone = excluded.tone, include_macro = excluded.include_macro, brief_time = excluded.brief_time, focus_tags = excluded.focus_tags, updated_at = now()`,
      [me.id, p.data.maxCards, p.data.tone, p.data.includeMacro, p.data.briefTime, p.data.focusTags],
    );
    await q(
      `insert into audit_log (actor_id, action, object_type, object_id, detail) values ($1, 'preferences.update', 'profile', $2::text, $3::jsonb)`,
      [me.id, me.id, JSON.stringify({ maxCards: p.data.maxCards, tone: p.data.tone })],
    );
  });
  return NextResponse.json({ ok: true });
}
