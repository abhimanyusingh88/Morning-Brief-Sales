import type { Me } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { runTurn, type TurnContext } from './turn';

const enc = new TextEncoder();
const frame = (event: string, data: unknown) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/** Server-sent events: thread, step (one per action), answer, or error. */
export async function streamTurn(o: {
  me: Me;
  message: string;
  threadId?: string;
  clientId?: string;
  ctx: TurnContext;
}): Promise<Response> {
  const db = await getDb();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (e: string, d: unknown) => {
        if (open)
          try {
            controller.enqueue(frame(e, d));
          } catch {
            open = false;
          }
      };
      try {
        await runTurn({ db, ...o, send });
      } catch (e) {
        // Details stay in the server log; the person gets a retryable message.
        console.error('[agent] turn failed:', e instanceof Error ? e.message : 'unknown');
        send('error', { message: 'I could not finish that answer. Nothing was saved; please try again.' });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* client went away */
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
