import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { COOKIE, cookieOptions, signSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Lists the demo personas that can be signed in as. */
export async function GET() {
  const db = await getDb();
  const rows = await db.asService((q) => q(
    `select p.id, p.full_name, p.initials, p.title, p.role, p.avatar_hue, d.name desk_name, d.code desk_code
       from profiles p left join desks d on d.id = p.desk_id where p.is_active
       order by case p.role when 'sales' then 1 when 'desk_head' then 2 when 'compliance' then 3 else 4 end, d.code, p.full_name`));
  return NextResponse.json({
    personas: rows.map((r) => ({ id: r.id, name: r.full_name, initials: r.initials, title: r.title, role: r.role, hue: r.avatar_hue, desk: r.desk_name, deskCode: r.desk_code })),
  });
}

const Body = z.object({ profileId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "profileId required" }, { status: 400 });
  const db = await getDb();
  const ok = await db.asService((q) => q(`select 1 from profiles where id = $1 and is_active`, [parsed.data.profileId]));
  if (!ok.length) return NextResponse.json({ error: "unknown profile" }, { status: 404 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, signSession(parsed.data.profileId), cookieOptions);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
