import { z } from "zod";
import { answer } from "@/lib/ai/chat";
import { getDb } from "@/lib/db";
import { loadMe, meFromRequest } from "@/lib/auth/session";
import { demoBusinessDate } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ message: z.string().min(1).max(500), threadId: z.string().uuid().optional() });
const enc = new TextEncoder();
const sse = (event: string, data: unknown) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const id = meFromRequest(req);
  const me = id ? await loadMe(id) : null;
  if (!me || (me.role !== "sales" && me.role !== "desk_head")) return Response.json({ error: "not allowed" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "message required (max 500 characters)" }, { status: 400 });
  const db = await getDb();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: string, d: unknown) => controller.enqueue(sse(e, d));
      try {
        // Thread and user message, as the signed-in person.
        const threadId = await db.asUser(me.id, async (q) => {
          let t = parsed.data.threadId;
          if (t) {
            const own = await q(`select 1 from chat_threads where id = $1`, [t]);
            if (!own.length) t = undefined;
          }
          if (!t) t = (await q<{ id: string }>(`insert into chat_threads (profile_id, title) values ($1, $2) returning id`, [me.id, parsed.data.message.slice(0, 60)]))[0].id;
          await q(`insert into chat_messages (thread_id, profile_id, role, content) values ($1, $2, 'user', $3)`, [t, me.id, parsed.data.message]);
          return t;
        });
        send("thread", { threadId });

        const a = await answer({ db, meId: me.id, firstName: me.fullName.split(" ")[0], message: parsed.data.message, businessDate: demoBusinessDate() });
        for (const s of a.steps) { send("step", { label: s }); await sleep(260); }

        await db.asUser(me.id, async (q) => {
          await q(`insert into chat_messages (thread_id, profile_id, role, content, citations) values ($1, $2, 'assistant', $3, $4::jsonb)`,
            [threadId, me.id, a.template, JSON.stringify(Object.values(a.facts))]);
          await q(`insert into audit_log (actor_id, action, object_type, object_id, detail) values ($1, 'chat.ask', 'chat_thread', $2, $3::jsonb)`,
            [me.id, threadId, JSON.stringify({ intent: a.intent, generator: a.generator, chars: parsed.data.message.length })]);
        });
        if (a.record) {
          await db.asService((q) => q(
            `insert into generation_records (profile_id, target, provider, model, status, attempts, prompt_tokens, completion_tokens, latency_ms) values ($1, 'chat', 'openai', $2, $3, $4, $5, $6, $7)`,
            [me.id, a.record!.model, a.record!.status, a.record!.attempts, a.record!.promptTokens, a.record!.completionTokens, a.record!.latencyMs]));
        }
        send("answer", { threadId, ...a, record: undefined });
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : "failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
