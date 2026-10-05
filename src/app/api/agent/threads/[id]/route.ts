import { z } from "zod";
import { agentMe, forbidden, notFound } from "@/lib/agent/auth";
import { deleteThread, getThread, renameThread } from "@/lib/agent/threads";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** A thread with its messages (steps, follow-ups, draft, intent, generator and the facts behind every figure). Another person's thread is a 404. */
export async function GET(req: Request, { params }: Ctx) {
  const me = await agentMe(req);
  if (!me) return forbidden();
  const { id } = await params;
  const found = await getThread(await getDb(), me.id, id);
  return found ? Response.json(found) : notFound();
}

const Rename = z.object({ title: z.string().trim().min(1).max(80) });

export async function PATCH(req: Request, { params }: Ctx) {
  const me = await agentMe(req);
  if (!me) return forbidden();
  const parsed = Rename.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "title required (max 80 characters)" }, { status: 400 });
  const { id } = await params;
  const db = await getDb();
  if (!(await renameThread(db, me.id, id, parsed.data.title))) return notFound();
  return Response.json({ ok: true, title: parsed.data.title.replace(/\s+/g, " ").slice(0, 80) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const me = await agentMe(req);
  if (!me) return forbidden();
  const { id } = await params;
  return (await deleteThread(await getDb(), me.id, id)) ? Response.json({ ok: true }) : notFound();
}
