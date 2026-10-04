import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadMe, meFromRequest } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const Body = z.object({ status: z.enum(["new", "done", "snoozed", "dismissed"]) });

/** Mark a call done, snooze or dismiss it. Row-level security limits this to the owner's own cards. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meId = meFromRequest(req);
  const me = meId ? await loadMe(meId) : null;
  if (!me) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "status must be new, done, snoozed or dismissed" }, { status: 400 });
  const db = await getDb();
  const updated = await db.asUser(me.id, async (q) => {
    const r = await q(`update call_cards set status = $2, acted_at = case when $2 = 'new' then null else now() end where id = $1 returning id, client_id`, [id, parsed.data.status]);
    if (r.length) await q(`insert into audit_log (actor_id, action, object_type, object_id, detail) values ($1, $2, 'call_card', $3, $4::jsonb)`, [me.id, `card.${parsed.data.status}`, id, JSON.stringify({ client: r[0].client_id })]);
    return r;
  });
  if (!updated.length) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
