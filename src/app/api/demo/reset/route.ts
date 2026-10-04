import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { loadMe, meFromRequest } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Demo only: put every call card back to "new" so the walkthrough can be repeated. Admin only. */
export async function POST(req: Request) {
  const id = meFromRequest(req);
  const me = id ? await loadMe(id) : null;
  const pin = process.env.DEMO_CONTROL_PIN;
  const ok = me?.role === "admin" || Boolean(pin && req.headers.get("x-demo-pin") === pin);
  if (!ok) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const db = await getDb();
  const n = await db.asService(async (q) => {
    const r = await q(`update call_cards set status = 'new', acted_at = null where status <> 'new' returning id`);
    await q(`insert into audit_log (actor_id, action, object_type, detail) values ($1, 'demo.reset_cards', 'call_card', $2::jsonb)`, [me?.id ?? null, JSON.stringify({ reset: r.length })]);
    return r.length;
  });
  return NextResponse.json({ ok: true, reset: n });
}
