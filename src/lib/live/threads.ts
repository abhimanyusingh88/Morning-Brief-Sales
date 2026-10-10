import type { Db } from '../db/types';
// Analyst conversations. Every read and write runs as the user, so row-level security keeps threads private.
export type ThreadSummary = { id: string; title: string; updatedAt: string; messages: number };
export type ThreadMessage = {
  question: string;
  answer: string;
  notice: string | null;
  method: string;
  at: string;
  sources: { id: string; title: string; url: string; publishedAt: string; publisher: string }[];
};
const iso = (x: unknown) => (x instanceof Date ? x.toISOString() : String(x));
/** Newest first; with a business day, only conversations asked about that day's brief. */
export async function listThreads(db: Db, profileId: string, day?: string): Promise<ThreadSummary[]> {
  const rows = await db.asUser(profileId, (q) =>
    day
      ? q(
          'select t.id,t.title,t.updated_at,(select count(*)::int from live_assistant_messages m where m.thread_id=t.id) n from live_assistant_threads t where t.profile_id=$1 and exists(select 1 from live_assistant_messages m join live_reports r on r.id=m.report_id where m.thread_id=t.id and r.business_date=$2) order by t.updated_at desc limit 100',
          [profileId, day],
        )
      : q(
          'select t.id,t.title,t.updated_at,(select count(*)::int from live_assistant_messages m where m.thread_id=t.id) n from live_assistant_threads t where t.profile_id=$1 order by t.updated_at desc limit 100',
          [profileId],
        ),
  );
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    updatedAt: iso(r.updated_at),
    messages: Number(r.n),
  }));
}
export async function getThreadMessages(db: Db, profileId: string, threadId: string): Promise<ThreadMessage[] | null> {
  return db.asUser(profileId, async (q) => {
    const [t] = await q('select id from live_assistant_threads where id=$1 and profile_id=$2', [threadId, profileId]);
    if (!t) return null;
    const rows = await q(
      "select m.question,m.answer,m.notice,m.method,m.created_at,coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'url',a.url,'publishedAt',a.published_at,'publisher',a.publisher)) from live_articles a where a.id=any(m.source_ids)),'[]'::jsonb) sources from live_assistant_messages m where m.thread_id=$1 order by m.created_at",
      [threadId],
    );
    return rows.map((r) => ({
      question: String(r.question),
      answer: String(r.answer),
      notice: r.notice ? String(r.notice) : null,
      method: String(r.method),
      at: iso(r.created_at),
      sources: (r.sources as ThreadMessage['sources']) ?? [],
    }));
  });
}
/** The thread's own last exchanges: the only conversation context the model receives. */
export async function threadHistory(
  db: Db,
  profileId: string,
  threadId: string,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const rows = await db.asUser(profileId, (q) =>
    q(
      'select question,answer from (select question,answer,created_at from live_assistant_messages where thread_id=$1 and profile_id=$2 order by created_at desc limit 3) x order by created_at',
      [threadId, profileId],
    ),
  );
  return rows.flatMap((r) => [
    { role: 'user' as const, content: String(r.question).slice(0, 5000) },
    { role: 'assistant' as const, content: String(r.answer).slice(0, 5000) },
  ]);
}
export async function ensureThread(
  db: Db,
  profileId: string,
  threadId: string | null | undefined,
  question: string,
): Promise<string | null> {
  return db.asUser(profileId, async (q) => {
    if (threadId) {
      const [t] = await q('select id from live_assistant_threads where id=$1 and profile_id=$2', [threadId, profileId]);
      return t ? String(t.id) : null;
    }
    const title = question.replace(/\s+/g, ' ').trim().slice(0, 90);
    const [t] = await q('insert into live_assistant_threads(profile_id,title) values($1,$2) returning id', [
      profileId,
      title,
    ]);
    return String(t.id);
  });
}
export async function deleteThread(db: Db, profileId: string, threadId: string): Promise<boolean> {
  return (
    (
      await db.asUser(profileId, (q) =>
        q('delete from live_assistant_threads where id=$1 and profile_id=$2 returning id', [threadId, profileId]),
      )
    ).length > 0
  );
}
