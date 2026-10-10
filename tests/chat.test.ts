import { beforeAll, describe, expect, it } from 'vitest';
import { testDb, pid } from './helpers/testdb';
import { runPipeline } from '../src/lib/pipeline/run';
import { answer, type ChatAnswer } from '../src/lib/ai/chat';
import { validateText } from '../src/lib/ai/validator';

const D = '2026-10-05';
let db: Awaited<ReturnType<typeof testDb>>;
let rahman: string, delaney: string;

const ask = (meId: string, message: string, extra: Partial<Parameters<typeof answer>[0]> = {}) =>
  answer({ db, meId, firstName: 'Aisha', message, businessDate: D, useLlm: false, ...extra });

const clean = (a: ChatAnswer) => {
  const v = validateText(a.template, { allowedKeys: new Set(Object.keys(a.facts)) });
  expect(v.errors).toEqual([]);
  for (const f of Object.values(a.facts)) {
    expect(f.source).toBeTruthy();
    expect(Number.isNaN(Date.parse(f.asOf))).toBe(false);
  }
};

beforeAll(async () => {
  db = await testDb();
  rahman = await pid('rahman');
  delaney = await pid('delaney');
  await runPipeline({ db, businessDate: D, useLlm: false });
}, 120_000);

describe('chat assistant', () => {
  it("ranks today's calls from the published brief", async () => {
    const a = await ask(rahman, 'Who should I call today?');
    clean(a);
    expect(a.template).toMatch(/•/);
    expect(Object.keys(a.facts).length).toBeGreaterThan(0);
    expect(a.steps.some((s) => /call list/i.test(s))).toBe(true);
  });

  it('reports movers with the right units', async () => {
    const a = await ask(rahman, 'what moved overnight?');
    clean(a);
    const shown = Object.values(a.facts)
      .map((f) => f.display)
      .join(' ');
    expect(shown).toMatch(/%|bp/);
  });

  it('summarises a client the person covers, and refuses one they do not', async () => {
    const mine = await db.asUser(rahman, (q) => q<{ name: string }>(`select name from clients limit 1`));
    const a = await ask(rahman, `Tell me about ${mine[0].name}`);
    clean(a);
    expect(a.template).toContain(mine[0].name);
    const theirs = await db.asService((q) =>
      q<{ name: string }>(
        `select c.name from clients c where not exists (select 1 from coverage v where v.client_id = c.id and v.profile_id = $1) limit 1`,
        [rahman],
      ),
    );
    const b = await ask(rahman, `Tell me about ${theirs[0].name}`);
    expect(b.template).not.toContain(theirs[0].name);
  });

  it('every client summary passes the figure checks', async () => {
    const mine = await db.asUser(rahman, (q) => q<{ name: string }>(`select name from clients`));
    for (const c of mine) clean(await ask(rahman, `summary of ${c.name}`));
  });

  it('drafts a note from the call card, without sending anything', async () => {
    const card = await db.asUser(rahman, (q) =>
      q<{ name: string }>(
        `select cl.name from call_cards c join clients cl on cl.id = c.client_id order by c.rank limit 1`,
      ),
    );
    const a = await ask(rahman, `Draft an email to ${card[0].name}`);
    expect(a.draft).toBeTruthy();
    expect(a.draft!.template).toMatch(/Hi \w+/);
    expect(a.template).toMatch(/never send/i);
    clean(a);
  });

  it('never exposes restricted-list names', async () => {
    const a = await ask(rahman, 'who is exposed to MU or UNP?');
    expect(JSON.stringify(a)).not.toMatch(/Micron|Union Pacific/);
  });

  it('uses the model answer only when it validates, otherwise the rule-based one', async () => {
    process.env.OPENAI_API_KEY = 'test';
    const good = await ask(rahman, 'who should I call today?', {
      useLlm: true,
      complete: async () => ({
        text: JSON.stringify({ answer: 'Start with your top names.' }),
        model: 'fake',
        promptTokens: 1,
        completionTokens: 1,
        latencyMs: 1,
      }),
    });
    expect(good.generator).toBe('llm');
    const bad = await ask(rahman, 'who should I call today?', {
      useLlm: true,
      complete: async () => ({
        text: JSON.stringify({ answer: 'Call them, they are up 5% and 12 bp wider.' }),
        model: 'fake',
        promptTokens: 1,
        completionTokens: 1,
        latencyMs: 1,
      }),
    });
    expect(bad.generator).toBe('rules');
    expect(bad.record?.status).toBe('fallback');
    process.env.OPENAI_API_KEY = '';
  });

  it('gives a desk head the same safe behaviour on their own coverage', async () => {
    const a = await ask(delaney, 'Who should I call today?');
    clean(a);
    expect(a.template).toContain('•');
    expect(a.subject).toBeTruthy();
    expect(Object.keys(a.facts).length).toBeGreaterThan(0);
    const visible = await db.asUser(delaney, (q) => q<{ id: string }>('select id from clients'));
    expect(visible.map((client) => client.id)).toContain(a.subject!.id);
    const draft = await ask(delaney, `Draft a note to ${a.subject!.name}`);
    expect(draft.draft).toBeTruthy();
    clean(draft);
  });

  it('does not use an unpublished brief for call recommendations', async () => {
    await db.asService((q) => q("update briefs set status = 'draft' where profile_id = $1", [rahman]));
    try {
      const a = await ask(rahman, 'Who should I call first this morning, and why?');
      expect(a.subject).toBeUndefined();
      expect(a.template).toContain('No published brief');
      expect(a.template).not.toContain('Here is where I would start');
    } finally {
      await db.asService((q) => q("update briefs set status = 'published' where profile_id = $1", [rahman]));
    }
  });
});
