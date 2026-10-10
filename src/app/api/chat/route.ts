import { z } from 'zod';
import { agentMe, forbidden } from '@/lib/agent/auth';
import { streamTurn } from '@/lib/agent/sse';
import { loadTurnContext } from '@/lib/agent/turn';
import { MAX_MESSAGE, UUID_RE } from '@/lib/agent/types';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({ message: z.string().min(1).max(MAX_MESSAGE), threadId: z.string().regex(UUID_RE).optional() });

/** The Ask drawer. Same engine and storage as /api/agent/chat; an unknown thread id simply starts a new thread. */
export async function POST(req: Request) {
  const me = await agentMe(req);
  if (!me) return forbidden();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: `message required (max ${MAX_MESSAGE} characters)` }, { status: 400 });
  const ctx = await loadTurnContext(await getDb(), me.id, parsed.data.threadId);
  return streamTurn({ me, message: parsed.data.message, threadId: ctx.exists ? parsed.data.threadId : undefined, ctx });
}
