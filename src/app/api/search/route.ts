import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadMe, meFromRequest } from "@/lib/auth/session";
import { NAV } from "@/components/shell/nav";

export const dynamic = "force-dynamic";

/** Clients, calls and pages the signed-in person can see. Clients and calls are read under their own permissions. */
export async function GET(req: Request) {
  const id = meFromRequest(req);
  const me = id ? await loadMe(id) : null;
  if (!me) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const db = await getDb();

  const pages = NAV.flatMap((g) => g.items).filter((i) => i.roles.includes(me.role) && (!q || i.label.toLowerCase().includes(q.toLowerCase())))
    .map((i) => ({ kind: "page" as const, id: i.href, label: i.label, href: i.href }));

  const { clients, calls } = await db.asUser(me.id, async (qq) => ({
    clients: q ? await qq(`select id, name, segment, tier from clients where name ilike $1 or short_name ilike $1 order by tier, name limit 8`, [like]) : [],
    calls: await qq(
      `select c.id, c.headline, c.rank, c.urgency, cl.name from call_cards c join clients cl on cl.id = c.client_id
        join briefs b on b.id = c.brief_id
        where b.profile_id = $2 and ($1 = '' or cl.name ilike $3 or c.headline ilike $3) order by b.business_date desc, c.rank limit 5`, [q, me.id, like]),
  }));

  const hits = [
    ...pages,
    ...clients.map((c) => ({ kind: "client" as const, id: String(c.id), label: String(c.name), sub: `${String(c.segment).replace("_", " ")} · tier ${c.tier}`, href: `/clients/${c.id}` })),
    ...calls.map((c) => ({ kind: "call" as const, id: String(c.id), label: String(c.name), sub: String(c.headline).replace(/\{\{[^}]+\}\}/g, "…"), href: `/calls?card=${c.id}` })),
  ];
  return NextResponse.json({ hits });
}
