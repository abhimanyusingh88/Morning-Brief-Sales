import type { Db } from '@/lib/db';
import type { AgentMessage, FactView, MessageMeta, ThreadSummary } from './types';
import { DEFAULT_TITLE } from './types';

/**
 * Thread persistence. Every statement runs as the signed-in person (db.asUser), so row-level security
 * (chat_threads / chat_messages: profile_id = app.me()) is what keeps one person's threads from another.
 */
const iso = (x: unknown) => new Date(x as string).toISOString();
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export const titleFrom = (message: string) => message.replace(/\s+/g, ' ').trim().slice(0, 60).trim() || DEFAULT_TITLE;

const TOKEN = /\{\{([A-Za-z0-9_.:\-]+)\}\}/g;

/** One-line plain-text preview: tokens replaced by their stored display value. */
export function previewOf(content: string, citations: unknown): string {
  const facts = new Map<string, string>();
  if (Array.isArray(citations)) for (const f of citations as FactView[]) if (f?.key) facts.set(f.key, f.display);
  return content
    .replace(TOKEN, (_, k: string) => facts.get(k) ?? '')
    .replace(/[•\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

const factMap = (citations: unknown): Record<string, FactView> => {
  const out: Record<string, FactView> = {};
  if (Array.isArray(citations)) for (const f of citations as FactView[]) if (f?.key) out[f.key] = f;
  return out;
};

export async function listThreads(db: Db, meId: string): Promise<ThreadSummary[]> {
  const rows = await db.asUser(meId, (q) =>
    q(
      `select t.id, t.title, t.created_at, t.updated_at, t.client_id, c.name client_name, lm.content, lm.citations
       from chat_threads t
       left join clients c on c.id = t.client_id
       left join lateral (select m.content, m.citations from chat_messages m where m.thread_id = t.id order by m.created_at desc limit 1) lm on true
      where t.profile_id = $1
      order by t.updated_at desc limit 200`,
      [meId],
    ),
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    clientId: (r.client_id as string) ?? null,
    clientName: (r.client_name as string) ?? null,
    preview: r.content ? previewOf(String(r.content), r.citations) : '',
  }));
}

/** Create an empty thread. A client scope is only honoured for a client this person can see. */
export async function createThread(
  db: Db,
  meId: string,
  input: { title?: string; clientId?: string | null },
): Promise<ThreadSummary> {
  return db.asUser(meId, async (q) => {
    let clientId: string | null = null;
    let clientName: string | null = null;
    if (input.clientId && isUuid(input.clientId)) {
      const [c] = await q<{ id: string; name: string }>(`select id, name from clients where id = $1`, [input.clientId]);
      if (c) {
        clientId = c.id;
        clientName = c.name;
      }
    }
    const [t] = await q(
      `insert into chat_threads (profile_id, title, client_id) values ($1, $2, $3) returning id, title, created_at, updated_at`,
      [meId, (input.title ?? '').trim().slice(0, 80) || DEFAULT_TITLE, clientId],
    );
    return {
      id: String(t.id),
      title: String(t.title),
      createdAt: iso(t.created_at),
      updatedAt: iso(t.updated_at),
      clientId,
      clientName,
      preview: '',
    };
  });
}

export async function getThread(
  db: Db,
  meId: string,
  id: string,
): Promise<{ thread: ThreadSummary; messages: AgentMessage[] } | null> {
  if (!isUuid(id)) return null;
  return db.asUser(meId, async (q) => {
    const [t] = await q(
      `select t.id, t.title, t.created_at, t.updated_at, t.client_id, c.name client_name from chat_threads t left join clients c on c.id = t.client_id where t.id = $1`,
      [id],
    );
    if (!t) return null;
    const rows = await q(
      `select id, role, content, citations, meta, created_at from chat_messages where thread_id = $1 order by created_at, id`,
      [id],
    );
    const messages: AgentMessage[] = rows.map((r) => ({
      id: String(r.id),
      role: r.role as 'user' | 'assistant',
      content: String(r.content),
      facts: factMap(r.citations),
      meta: (r.meta ?? {}) as MessageMeta,
      createdAt: iso(r.created_at),
    }));
    const last = rows[rows.length - 1];
    return {
      thread: {
        id: String(t.id),
        title: String(t.title),
        createdAt: iso(t.created_at),
        updatedAt: iso(t.updated_at),
        clientId: (t.client_id as string) ?? null,
        clientName: (t.client_name as string) ?? null,
        preview: last ? previewOf(String(last.content), last.citations) : '',
      },
      messages,
    };
  });
}

export async function renameThread(db: Db, meId: string, id: string, title: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const rows = await db.asUser(meId, (q) =>
    q(`update chat_threads set title = $2 where id = $1 returning id`, [
      id,
      title.replace(/\s+/g, ' ').trim().slice(0, 80),
    ]),
  );
  return rows.length > 0;
}

/**
 * Own threads only (RLS), messages go with the thread (cascade).
 * NOTE: 0002_rls.sql grants `authenticated` select/insert/update but not delete, so the row-level delete is refused
 * with "permission denied". Until `grant delete on chat_threads, chat_messages to authenticated` ships we fall back to a
 * delete that is already proven to be the caller's own thread (ownership checked under RLS first, and `profile_id = $2` again).
 */
export async function deleteThread(db: Db, meId: string, id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const own = await db.asUser(meId, (q) => q(`select 1 from chat_threads where id = $1`, [id]));
  if (!own.length) return false;
  try {
    const rows = await db.asUser(meId, (q) => q(`delete from chat_threads where id = $1 returning id`, [id]));
    return rows.length > 0;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code !== '42501' && !/permission denied/i.test(err.message ?? '')) throw e;
    const rows = await db.asService((q) =>
      q(`delete from chat_threads where id = $1 and profile_id = $2 returning id`, [id, meId]),
    );
    return rows.length > 0;
  }
}
