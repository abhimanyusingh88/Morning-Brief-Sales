import { answer, type HistoryTurn } from "@/lib/ai/chat";
import type { Db } from "@/lib/db";
import type { Me } from "@/lib/auth/session";
import { demoBusinessDate } from "@/lib/config";
import { isUuid, titleFrom } from "./threads";
import type { MessageMeta } from "./types";
import { DEFAULT_TITLE } from "./types";

/** Who may use the assistant. */
export const canUseAgent = (me: { role: string } | null): boolean => !!me && (me.role === "sales" || me.role === "desk_head");

export interface TurnContext { exists: boolean; clientId: string | null; history: HistoryTurn[] }

/** The thread's scope and its last turns (text only), read as the signed-in person. `exists` is false for another person's thread. */
export async function loadTurnContext(db: Db, meId: string, threadId?: string): Promise<TurnContext> {
  if (!threadId || !isUuid(threadId)) return { exists: false, clientId: null, history: [] };
  return db.asUser(meId, async (q) => {
    const [t] = await q(`select client_id from chat_threads where id = $1`, [threadId]);
    if (!t) return { exists: false, clientId: null, history: [] };
    const rows = await q(`select role, content, meta from chat_messages where thread_id = $1 order by created_at desc, id desc limit 6`, [threadId]);
    const history = rows.reverse().map((r): HistoryTurn => {
      const m = (r.meta ?? {}) as MessageMeta;
      return { role: r.role as "user" | "assistant", text: String(r.content), meta: { clientId: m.clientId, clientName: m.clientName, intent: m.intent } };
    });
    return { exists: true, clientId: (t.client_id as string) ?? null, history };
  });
}

export type Send = (event: string, data: unknown) => void;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One conversational turn, shared by POST /api/agent/chat and POST /api/chat:
 * answer (as the person) -> persist both messages -> stream the steps -> final answer.
 * Nothing is persisted if the answer fails, so a retry never leaves an orphan question behind.
 * The agent drafts; nothing in here sends anything anywhere.
 */
export async function runTurn(o: { db: Db; me: Me; message: string; threadId?: string; clientId?: string; ctx: TurnContext; send: Send; stepDelayMs?: number }) {
  const { db, me, message, send } = o;
  const a = await answer({
    db, meId: me.id, firstName: me.fullName.split(" ")[0], message, businessDate: demoBusinessDate(),
    history: o.ctx.history, clientId: o.ctx.clientId ?? o.clientId,
  });
  const subject = a.subject;
  const meta: MessageMeta = {
    steps: a.steps, followups: a.followups, draft: a.draft, intent: a.intent, generator: a.generator,
    clientId: subject?.id, clientName: subject?.name,
  };
  const citations = Object.values(a.facts);
  const explicitClient = subject?.explicit ? subject.id : null;

  const saved = await db.asUser(me.id, async (q) => {
    let id = o.ctx.exists ? o.threadId! : undefined;
    let created = false;
    if (!id) {
      // A client scope given by the deep link only sticks for a client this person can see.
      let scope: string | null = null;
      if (o.clientId && isUuid(o.clientId)) scope = (await q<{ id: string }>(`select id from clients where id = $1`, [o.clientId]))[0]?.id ?? null;
      id = (await q<{ id: string }>(`insert into chat_threads (profile_id, title, client_id) values ($1, $2, $3) returning id`, [me.id, titleFrom(message), scope]))[0].id;
      created = true;
    }
    await q(`insert into chat_messages (thread_id, profile_id, role, content, created_at) values ($1, $2, 'user', $3, clock_timestamp())`, [id, me.id, message]);
    const [m] = await q(
      `insert into chat_messages (thread_id, profile_id, role, content, citations, meta, created_at) values ($1, $2, 'assistant', $3, $4::jsonb, $5::jsonb, clock_timestamp() + interval '1 millisecond') returning id, created_at`,
      [id, me.id, a.template, JSON.stringify(citations), JSON.stringify(meta)]);
    const [t] = await q(
      `update chat_threads set updated_at = clock_timestamp(), client_id = coalesce(client_id, $2::uuid), title = case when title = $3 then $4 else title end where id = $1 returning title, client_id`,
      [id, explicitClient, DEFAULT_TITLE, titleFrom(message)]);
    await q(`insert into audit_log (actor_id, action, object_type, object_id, detail) values ($1, 'chat.ask', 'chat_thread', $2, $3::jsonb)`,
      [me.id, id, JSON.stringify({ intent: a.intent, generator: a.generator, chars: message.length })]);
    const [cl] = t.client_id ? await q<{ name: string }>(`select name from clients where id = $1`, [t.client_id]) : [];
    return { threadId: id, created, messageId: String(m.id), createdAt: new Date(m.created_at as string).toISOString(), title: String(t.title), clientId: (t.client_id as string) ?? null, clientName: cl?.name ?? null };
  });

  if (a.record) {
    // Model usage bookkeeping only: carries no client data.
    await db.asService((q) => q(
      `insert into generation_records (profile_id, target, provider, model, status, attempts, prompt_tokens, completion_tokens, latency_ms) values ($1, 'chat', 'openai', $2, $3, $4, $5, $6, $7)`,
      [me.id, a.record!.model, a.record!.status, a.record!.attempts, a.record!.promptTokens, a.record!.completionTokens, a.record!.latencyMs]));
  }

  send("thread", { threadId: saved.threadId, created: saved.created, title: saved.title, clientId: saved.clientId, clientName: saved.clientName, updatedAt: saved.createdAt });
  for (const s of a.steps) { send("step", { label: s }); await sleep(o.stepDelayMs ?? 260); }
  send("answer", {
    threadId: saved.threadId, messageId: saved.messageId, createdAt: saved.createdAt,
    template: a.template, facts: a.facts, followups: a.followups, steps: a.steps, draft: a.draft, generator: a.generator, intent: a.intent,
    clientId: subject?.id, clientName: subject?.name,
  });
}
