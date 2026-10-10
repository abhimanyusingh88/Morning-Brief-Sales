import { z } from 'zod';
import { agentMe, forbidden, notFound } from '@/lib/agent/auth';
import { streamTurn } from '@/lib/agent/sse';
import { loadTurnContext } from '@/lib/agent/turn';
import { MAX_MESSAGE, UUID_RE } from '@/lib/agent/types';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Body = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE),
  threadId: z.string().regex(UUID_RE).optional(),
  clientId: z.string().regex(UUID_RE).optional(),
});

/**
 * Continue a thread (or start one) as server-sent events: `thread`, then one `step` per action, then `answer` (or `error`).
 * Both messages are saved with the answer's steps, follow-ups, draft, intent and generator. Nothing here sends anything to a client.
 */
export async function POST(req: Request) {
  const me = await agentMe(req);
  if (!me) return forbidden();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: `message required (max ${MAX_MESSAGE} characters)` }, { status: 400 });
  const { message, threadId, clientId } = parsed.data;
  const ctx = await loadTurnContext(await getDb(), me.id, threadId);
  if (threadId && !ctx.exists) return notFound();
  return streamTurn({ me, message, threadId, clientId, ctx });
}
