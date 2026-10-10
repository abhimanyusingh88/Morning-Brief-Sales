import { beforeAll, describe, expect, it } from 'vitest';
import { testDb, pid, installTestDb } from './helpers/testdb';
import { runPipeline } from '../src/lib/pipeline/run';
import { signSession } from '../src/lib/auth/session';
import { answer } from '../src/lib/ai/chat';
import { validateText } from '../src/lib/ai/validator';

const D = '2026-10-05';
let db: Awaited<ReturnType<typeof testDb>>;
let rahman: string, other: string, delaney: string, overton: string, whitaker: string;
let threads: typeof import('../src/app/api/agent/threads/route');
let thread: typeof import('../src/app/api/agent/threads/[id]/route');
let chat: typeof import('../src/app/api/agent/chat/route');
let drawer: typeof import('../src/app/api/chat/route');

const cookie = (id: string) => `mb_session=${signSession(id)}`;
const req = (id: string | null, method: string, url: string, body?: unknown) =>
  new Request(`http://x${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { ...(id ? { cookie: cookie(id) } : {}), 'content-type': 'application/json' },
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

interface Frame {
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}
async function frames(res: Response): Promise<Frame[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((f) => ({ event: /event: (\w+)/.exec(f)![1], data: JSON.parse(/data: (.*)/.exec(f)![1]) }));
}
async function say(who: string, message: string, extra: Record<string, unknown> = {}) {
  const res = await chat.POST(req(who, 'POST', '/api/agent/chat', { message, ...extra }));
  expect(res.status).toBe(200);
  const fs = await frames(res);
  const ans = fs.find((f) => f.event === 'answer');
  expect(ans, JSON.stringify(fs)).toBeTruthy();
  return { fs, ans: ans!.data, threadId: fs.find((f) => f.event === 'thread')!.data.threadId as string };
}

beforeAll(async () => {
  installTestDb();
  db = await testDb();
  rahman = await pid('rahman');
  delaney = await pid('delaney');
  overton = await pid('overton');
  whitaker = await pid('whitaker');
  other = (
    await db.asService((q) =>
      q<{ id: string }>(`select id from profiles where role = 'sales' and id <> $1 order by full_name limit 1`, [
        rahman,
      ]),
    )
  )[0].id;
  await runPipeline({ db, businessDate: D, useLlm: false });
  threads = await import('../src/app/api/agent/threads/route');
  thread = await import('../src/app/api/agent/threads/[id]/route');
  chat = await import('../src/app/api/agent/chat/route');
  drawer = await import('../src/app/api/chat/route');
}, 120_000);

describe('access', () => {
  it('answers 403 to roles without the agent', async () => {
    // No sign-in: requests without a session act as the demo desk profile (see tests/no-login.test.ts).
    for (const who of [overton, whitaker]) {
      expect((await threads.GET(req(who, 'GET', '/api/agent/threads'))).status).toBe(403);
      expect((await threads.POST(req(who, 'POST', '/api/agent/threads', {}))).status).toBe(403);
      expect((await thread.GET(req(who, 'GET', '/x'), ctx('00000000-0000-0000-0000-000000000000'))).status).toBe(403);
      expect(
        (await thread.PATCH(req(who, 'PATCH', '/x', { title: 'a' }), ctx('00000000-0000-0000-0000-000000000000')))
          .status,
      ).toBe(403);
      expect((await thread.DELETE(req(who, 'DELETE', '/x'), ctx('00000000-0000-0000-0000-000000000000'))).status).toBe(
        403,
      );
      expect((await chat.POST(req(who, 'POST', '/api/agent/chat', { message: 'hi' }))).status).toBe(403);
      expect((await drawer.POST(req(who, 'POST', '/api/chat', { message: 'hi' }))).status).toBe(403);
    }
  });

  it('lets a desk head use it too', async () => {
    const { threadId } = await say(delaney, 'Who should I call today?');
    expect((await thread.GET(req(delaney, 'GET', '/x'), ctx(threadId))).status).toBe(200);
  });
});

describe('threads CRUD', () => {
  it('creates, lists, renames and deletes a thread', async () => {
    const made = await threads.POST(req(rahman, 'POST', '/api/agent/threads', { title: 'Morning prep' }));
    expect(made.status).toBe(201);
    const { thread: t } = await made.json();
    expect(t.title).toBe('Morning prep');

    const list = (await (await threads.GET(req(rahman, 'GET', '/api/agent/threads'))).json()).threads as {
      id: string;
      title: string;
    }[];
    expect(list.map((x) => x.id)).toContain(t.id);

    const ren = await thread.PATCH(req(rahman, 'PATCH', '/x', { title: '  Renamed   thread ' }), ctx(t.id));
    expect(ren.status).toBe(200);
    expect((await (await thread.GET(req(rahman, 'GET', '/x'), ctx(t.id))).json()).thread.title).toBe('Renamed thread');
    expect((await thread.PATCH(req(rahman, 'PATCH', '/x', { title: '   ' }), ctx(t.id))).status).toBe(400);

    expect((await thread.DELETE(req(rahman, 'DELETE', '/x'), ctx(t.id))).status).toBe(200);
    expect((await thread.GET(req(rahman, 'GET', '/x'), ctx(t.id))).status).toBe(404);
    expect((await thread.DELETE(req(rahman, 'DELETE', '/x'), ctx(t.id))).status).toBe(404);
  });

  it('deleting a thread removes its messages', async () => {
    const { threadId } = await say(rahman, 'What moved overnight?');
    const before = await db.asService((q) => q(`select 1 from chat_messages where thread_id = $1`, [threadId]));
    expect(before.length).toBe(2);
    expect((await thread.DELETE(req(rahman, 'DELETE', '/x'), ctx(threadId))).status).toBe(200);
    expect((await db.asService((q) => q(`select 1 from chat_messages where thread_id = $1`, [threadId]))).length).toBe(
      0,
    );
  });

  it('rejects malformed ids without touching the database', async () => {
    expect((await thread.GET(req(rahman, 'GET', '/x'), ctx('not-a-uuid'))).status).toBe(404);
    expect((await thread.DELETE(req(rahman, 'DELETE', '/x'), ctx('1; drop table chat_threads'))).status).toBe(404);
  });
});

describe('ownership isolation (row-level security)', () => {
  it("never shows, renames, deletes or continues another person's thread", async () => {
    const { threadId } = await say(rahman, 'Who should I call today?');

    const theirs = (await (await threads.GET(req(other, 'GET', '/api/agent/threads'))).json()).threads as {
      id: string;
    }[];
    expect(theirs.map((t) => t.id)).not.toContain(threadId);
    expect((await thread.GET(req(other, 'GET', '/x'), ctx(threadId))).status).toBe(404);
    expect((await thread.PATCH(req(other, 'PATCH', '/x', { title: 'mine now' }), ctx(threadId))).status).toBe(404);
    expect((await thread.DELETE(req(other, 'DELETE', '/x'), ctx(threadId))).status).toBe(404);
    expect((await chat.POST(req(other, 'POST', '/api/agent/chat', { message: 'hello', threadId }))).status).toBe(404);

    // untouched for the owner
    const mine = await (await thread.GET(req(rahman, 'GET', '/x'), ctx(threadId))).json();
    expect(mine.thread.title).not.toBe('mine now');
    expect(mine.messages.length).toBe(2);
  });

  it('is enforced by the database itself, not only by the route', async () => {
    const { threadId } = await say(rahman, 'Which open follow-ups am I behind on?');
    const seen = await db.asUser(other, (q) => q(`select id from chat_threads where id = $1`, [threadId]));
    expect(seen).toEqual([]);
    const msgs = await db.asUser(other, (q) => q(`select id from chat_messages where thread_id = $1`, [threadId]));
    expect(msgs).toEqual([]);
    const upd = await db.asUser(other, (q) =>
      q(`update chat_threads set title = 'x' where id = $1 returning id`, [threadId]),
    );
    expect(upd).toEqual([]);
  });

  it('a deep-linked client scope only sticks for a client the person covers', async () => {
    const foreign = await db.asService((q) =>
      q<{ id: string }>(
        `select c.id from clients c where not exists (select 1 from coverage v where v.client_id = c.id and v.profile_id = $1) limit 1`,
        [rahman],
      ),
    );
    const { threadId } = await say(rahman, 'Hello', { clientId: foreign[0].id });
    const t = await (await thread.GET(req(rahman, 'GET', '/x'), ctx(threadId))).json();
    expect(t.thread.clientId).toBeNull();
  });
});

describe('persistence', () => {
  it('stores both messages with steps, follow-ups, intent, generator and the facts behind each figure', async () => {
    const { ans, threadId } = await say(rahman, 'Who should I call today?');
    expect(ans.steps.length).toBeGreaterThan(2);
    const got = await (await thread.GET(req(rahman, 'GET', '/x'), ctx(threadId))).json();
    expect(got.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    const a = got.messages[1];
    expect(a.meta.intent).toBe('calls');
    expect(a.meta.generator).toBe('rules');
    expect(a.meta.steps).toEqual(ans.steps);
    expect(a.meta.followups.length).toBeGreaterThan(0);
    expect(Object.keys(a.facts).length).toBeGreaterThan(0);
    for (const f of Object.values(a.facts) as { source: string; asOf: string }[]) {
      expect(f.source).toBeTruthy();
      expect(Number.isNaN(Date.parse(f.asOf))).toBe(false);
    }
    // stored text is a template: it passes the same validator as everything the model writes
    expect(validateText(a.content, { allowedKeys: new Set(Object.keys(a.facts)) }).errors).toEqual([]);
  });

  it('titles a new thread from the first message (at most 60 characters) and keeps it afterwards', async () => {
    const long = 'Who should I call today? ' + 'and why '.repeat(20);
    const { threadId } = await say(rahman, long);
    const first = (await (await thread.GET(req(rahman, 'GET', '/x'), ctx(threadId))).json()).thread;
    expect(first.title.length).toBeLessThanOrEqual(60);
    expect(first.title.startsWith('Who should I call today?')).toBe(true);
    await say(rahman, 'What moved overnight?', { threadId });
    expect((await (await thread.GET(req(rahman, 'GET', '/x'), ctx(threadId))).json()).thread.title).toBe(first.title);
  });

  it('names an untitled thread from its first message, but never overwrites a chosen title', async () => {
    const { thread: blank } = await (await threads.POST(req(rahman, 'POST', '/api/agent/threads', {}))).json();
    await say(rahman, 'What moved overnight?', { threadId: blank.id });
    expect((await (await thread.GET(req(rahman, 'GET', '/x'), ctx(blank.id))).json()).thread.title).toBe(
      'What moved overnight?',
    );
    const { thread: named } = await (
      await threads.POST(req(rahman, 'POST', '/api/agent/threads', { title: 'Keep me' }))
    ).json();
    await say(rahman, 'What moved overnight?', { threadId: named.id });
    expect((await (await thread.GET(req(rahman, 'GET', '/x'), ctx(named.id))).json()).thread.title).toBe('Keep me');
  });

  it('streams the thread, then each step, then the answer; and rejects empty or oversized messages', async () => {
    const { fs } = await say(rahman, 'Which open follow-ups am I behind on?');
    const order = fs.map((f) => f.event);
    expect(order[0]).toBe('thread');
    expect(order[order.length - 1]).toBe('answer');
    expect(order.filter((e) => e === 'step').length).toBeGreaterThan(2);
    expect((await chat.POST(req(rahman, 'POST', '/api/agent/chat', { message: '   ' }))).status).toBe(400);
    expect((await chat.POST(req(rahman, 'POST', '/api/agent/chat', { message: 'x'.repeat(501) }))).status).toBe(400);
  });

  it('bumps updated_at and orders the list by latest activity, with a last-message preview and no raw tokens', async () => {
    const a = await say(rahman, 'Who should I call today?');
    const b = await say(rahman, 'What moved overnight?');
    await say(rahman, 'Which open follow-ups am I behind on?', { threadId: a.threadId });
    const list = (await (await threads.GET(req(rahman, 'GET', '/api/agent/threads'))).json()).threads as {
      id: string;
      preview: string;
      updatedAt: string;
    }[];
    const ids = list.map((t) => t.id);
    expect(ids.indexOf(a.threadId)).toBeLessThan(ids.indexOf(b.threadId));
    for (const t of list) {
      expect(t.preview).not.toMatch(/\{\{/);
    }
    expect(list.find((t) => t.id === a.threadId)!.preview.length).toBeGreaterThan(0);
  });

  it('the drawer endpoint stores into the same threads', async () => {
    const res = await drawer.POST(req(rahman, 'POST', '/api/chat', { message: 'Who should I call today?' }));
    const fs = await frames(res);
    const id = fs.find((f) => f.event === 'thread')!.data.threadId;
    const got = await (await thread.GET(req(rahman, 'GET', '/x'), ctx(id))).json();
    expect(got.messages.length).toBe(2);
    expect(got.messages[1].meta.intent).toBe('calls');
  });
});

describe('conversation context', () => {
  it("resolves 'a note to them' from the previous answer's client", async () => {
    const card = await db.asUser(rahman, (q) =>
      q<{ name: string; id: string }>(
        `select cl.name, cl.id from call_cards c join clients cl on cl.id = c.client_id order by c.rank limit 1`,
      ),
    );
    const first = await say(rahman, `Tell me about ${card[0].name}`);
    expect(first.ans.clientId).toBe(card[0].id);
    const second = await say(rahman, 'Draft a note to them', { threadId: first.threadId });
    expect(second.ans.intent).toBe('draft');
    expect(second.ans.draft).toBeTruthy();
    expect(second.ans.template).toMatch(/never send/i);
    expect(second.ans.steps.join(' ')).toContain(card[0].name);
    const got = await (await thread.GET(req(rahman, 'GET', '/x'), ctx(first.threadId))).json();
    expect(got.messages.length).toBe(4);
    expect(got.messages[3].meta.draft.to).toBeTruthy();
    expect(got.thread.clientName).toBe(card[0].name);
  });

  it("resolves 'a note to them' after the ranked call list too (the first name on it)", async () => {
    const first = await say(rahman, 'Who should I call today?');
    const second = await say(rahman, 'draft a note to them', { threadId: first.threadId });
    expect(second.ans.intent).toBe('draft');
  });

  it("a thread scoped to a client carries that client into 'draft a note'", async () => {
    const card = await db.asUser(rahman, (q) =>
      q<{ name: string; id: string }>(
        `select cl.name, cl.id from call_cards c join clients cl on cl.id = c.client_id order by c.rank limit 1`,
      ),
    );
    const first = await say(rahman, `Brief me on ${card[0].name}`, { clientId: card[0].id });
    const got = await (await thread.GET(req(rahman, 'GET', '/x'), ctx(first.threadId))).json();
    expect(got.thread.clientId).toBe(card[0].id);
    const second = await say(rahman, 'Draft a note', { threadId: first.threadId });
    expect(second.ans.intent).toBe('draft');
  });

  it('does not leak a client from one conversation into a fresh one', async () => {
    const card = await db.asUser(rahman, (q) =>
      q<{ name: string }>(
        `select cl.name from call_cards c join clients cl on cl.id = c.client_id order by c.rank limit 1`,
      ),
    );
    await say(rahman, `Tell me about ${card[0].name}`);
    const fresh = await say(rahman, 'Draft a note to them');
    expect(fresh.ans.intent).not.toBe('draft');
  });

  it('answer() accepts history without changing how a standalone question behaves', async () => {
    const a = await answer({
      db,
      meId: rahman,
      firstName: 'Aisha',
      message: 'What moved overnight?',
      businessDate: D,
      useLlm: false,
      history: [{ role: 'user', text: 'hello' }],
    });
    expect(a.intent).toBe('market');
  });

  it('a client the person does not cover is not carried as context', async () => {
    const foreign = await db.asService((q) =>
      q<{ id: string }>(
        `select c.id from clients c where not exists (select 1 from coverage v where v.client_id = c.id and v.profile_id = $1) limit 1`,
        [rahman],
      ),
    );
    const a = await answer({
      db,
      meId: rahman,
      firstName: 'Aisha',
      message: 'Draft a note to them',
      businessDate: D,
      useLlm: false,
      history: [{ role: 'assistant', text: 'x', meta: { clientId: foreign[0].id, clientName: 'Hidden' } }],
    });
    expect(a.intent).not.toBe('draft');
    expect(JSON.stringify(a)).not.toContain('Hidden');
  });
});

describe('connected sources', () => {
  it('lists what the agent can read, never names a real vendor, and hides run health from sales', async () => {
    const { connectedSources } = await import('../src/lib/agent/sources');
    const sales = await connectedSources(db, rahman);
    expect(sales.map((s) => s.key)).toEqual([
      'crm',
      'positions',
      'trades',
      'market',
      'news',
      'calendars',
      'restricted',
      'email',
    ]);
    expect(sales.find((s) => s.key === 'market')!.status).toBe('Simulated connector');
    expect(sales.find((s) => s.key === 'restricted')!.detail).toMatch(/never shown/);
    expect(sales.find((s) => s.key === 'email')!.detail).toMatch(/never sends/);
    expect(JSON.stringify(sales)).not.toMatch(/bloomberg|refinitiv|factset|reuters/i);
    const head = await connectedSources(db, delaney);
    expect(head.find((s) => s.key === 'market')!.tone).not.toBe('bad');
  });
});
