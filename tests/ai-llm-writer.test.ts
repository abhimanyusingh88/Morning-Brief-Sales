import { beforeAll, describe, expect, it } from 'vitest';
import { testDb } from './helpers/testdb';
import { ingestMarket, ingestNews } from '../src/lib/pipeline/ingest';
import { loadSnapshot } from '../src/lib/pipeline/snapshot';
import { buildCandidates, selectCards } from '../src/lib/pipeline/rank';
import { defaultScenarios } from '../src/lib/market/scenarios';
import { prepareProfile, type Prepared } from '../src/lib/ai/prepare';
import { templateBrief, templateCard } from '../src/lib/ai/templates';
import { writeBrief, writeCard, type Completer } from '../src/lib/ai/llm-writer';
import { LlmUnavailable } from '../src/lib/ai/gateway';

const D = '2026-10-05';
let p: Prepared;

const reply =
  (text: string): Completer =>
  async () => ({ text, model: 'fake-model', promptTokens: 10, completionTokens: 5, latencyMs: 3 });

beforeAll(async () => {
  const db = await testDb();
  const snap = await db.asService(async (q) => {
    const sc = defaultScenarios(D);
    await ingestMarket(q, D, sc);
    await ingestNews(q, D, sc);
    return loadSnapshot(q, D);
  });
  const prof = (
    await db.asService((q) =>
      q<{ id: string; full_name: string }>(
        "select id, full_name from profiles where role = 'sales' order by full_name",
      ),
    )
  )[0];
  const picks = selectCards(snap, buildCandidates(snap)).get(prof.id) ?? [];
  p = await prepareProfile({ db, snap, profileId: prof.id, firstName: prof.full_name.split(' ')[0], picks });
}, 120_000);

describe('LLM card writer', () => {
  it('accepts valid output and records lineage', async () => {
    const c = p.cards[0];
    const base = templateCard(c);
    const r = await writeCard(c, p, { complete: reply(JSON.stringify({ ...base, headline: base.headline })) });
    expect(r.generator).toBe('llm');
    expect(r.record.status).toBe('accepted');
    expect(r.record.model).toBe('fake-model');
    expect(r.record.attempts).toBe(1);
  });

  it('rejects a digit, retries once, and accepts the repaired answer', async () => {
    const c = p.cards[0];
    const base = templateCard(c);
    let n = 0;
    const flaky: Completer = async () => {
      n++;
      const body = n === 1 ? { ...base, why: 'They hold 460mm in this and it moved 9 bp.' } : base;
      return { text: JSON.stringify(body), model: 'fake', promptTokens: 1, completionTokens: 1, latencyMs: 1 };
    };
    const r = await writeCard(c, p, { complete: flaky });
    expect(r.record.status).toBe('repaired');
    expect(r.record.attempts).toBe(2);
    expect(r.text.why).toBe(base.why);
  });

  it('falls back to the template for fields that never validate, keeping the valid ones', async () => {
    const c = p.cards[0];
    const base = templateCard(c);
    const bad = { ...base, why: 'It is down 3% and we guarantee a rebound.', headline: 'Short and valid headline' };
    const r = await writeCard(c, p, { complete: reply(JSON.stringify(bad)) });
    expect(r.record.status).toBe('fallback');
    expect(r.generator).toBe('hybrid');
    expect(r.text.why).toBe(base.why);
    expect(r.text.headline).toBe('Short and valid headline');
  });

  it("rejects tokens that belong to another client's card", async () => {
    const [a, b] = p.cards;
    const base = templateCard(a);
    const foreign = b.exposureKey!;
    const r = await writeCard(a, p, {
      complete: reply(JSON.stringify({ ...base, why: `Look at {{${foreign}}} here.` })),
    });
    expect(r.record.status).toBe('fallback');
    expect(r.text.why).toBe(base.why);
  });

  it('uses the template when the model is unavailable or returns junk', async () => {
    const c = p.cards[0];
    const base = templateCard(c);
    const down = await writeCard(c, p, {
      complete: async () => {
        throw new LlmUnavailable('no key');
      },
    });
    expect(down.generator).toBe('template');
    expect(down.record.status).toBe('failed');
    expect(down.text).toEqual(base);
    const junk = await writeCard(c, p, { complete: reply('not json at all') });
    expect(junk.generator).toBe('template');
    expect(junk.record.status).toBe('fallback');
  });

  it('never lets a restricted name through', async () => {
    const c = p.cards[0];
    const base = templateCard(c);
    const r = await writeCard(c, p, {
      complete: reply(JSON.stringify({ ...base, why: `Also mention ${p.forbidden[0]} to them.` })),
    });
    expect(r.text.why).toBe(base.why);
  });
});

describe('LLM brief writer', () => {
  it('accepts valid sections', async () => {
    const base = templateBrief(p.brief);
    const r = await writeBrief(p, {
      complete: reply(
        JSON.stringify({
          headline: base.headline,
          sections: Object.fromEntries(base.sections.map((s) => [s.kind, s.body])),
        }),
      ),
    });
    expect(r.record.status).toBe('accepted');
    expect(Object.values(r.generators).every((g) => g === 'llm')).toBe(true);
  });

  it('replaces only the sections that fail validation', async () => {
    const base = templateBrief(p.brief);
    const secs = Object.fromEntries(base.sections.map((s) => [s.kind, s.body]));
    secs.book = 'You cover 22 clients.';
    const r = await writeBrief(p, { complete: reply(JSON.stringify({ headline: base.headline, sections: secs })) });
    expect(r.record.status).toBe('fallback');
    expect(r.generators.book).toBe('template');
    expect(r.generators.overnight).toBe('llm');
    expect(r.text.sections.find((s) => s.kind === 'book')!.body).toBe(
      base.sections.find((s) => s.kind === 'book')!.body,
    );
  });

  it('falls back wholesale when the model is down', async () => {
    const r = await writeBrief(p, {
      complete: async () => {
        throw new Error('boom');
      },
    });
    expect(r.text).toEqual(templateBrief(p.brief));
    expect(r.record.status).toBe('failed');
  });
});
