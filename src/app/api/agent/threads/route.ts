import { z } from 'zod';
import { agentMe, forbidden } from '@/lib/agent/auth';
import { UUID_RE } from '@/lib/agent/types';
import { createThread, listThreads } from '@/lib/agent/threads';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Own threads, newest activity first, each with its client (if any) and a plain-text preview of the last message. */
export async function GET(req: Request) {
  const me = await agentMe(req);
  if (!me) return forbidden();
  return Response.json({ threads: await listThreads(await getDb(), me.id) });
}

const Create = z.object({ title: z.string().trim().max(80).optional(), clientId: z.string().regex(UUID_RE).nullish() });

export async function POST(req: Request) {
  const me = await agentMe(req);
  if (!me) return forbidden();
  const parsed = Create.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'invalid thread' }, { status: 400 });
  const thread = await createThread(await getDb(), me.id, parsed.data);
  return Response.json({ thread }, { status: 201 });
}
