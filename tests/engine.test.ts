import { describe, expect, it } from 'vitest';
import { testDb } from './helpers/testdb';
import { ingestMarket, ingestNews } from '../src/lib/pipeline/ingest';
import { loadSnapshot } from '../src/lib/pipeline/snapshot';
import { buildCandidates, selectCards } from '../src/lib/pipeline/rank';
import { suppressedByBarrier } from '../src/lib/pipeline/match';
import { defaultScenarios, SCENARIOS } from '../src/lib/market/scenarios';
import { SimulatedProvider } from '../src/lib/market/simulator';
import { formatMove } from '../src/lib/market/format';
import type { InstrumentRef } from '../src/lib/market/types';

const D = '2026-10-05';

async function snapshot() {
  const db = await testDb();
  return db.asService(async (q) => {
    const sc = defaultScenarios(D);
    await ingestMarket(q, D, sc);
    await ingestNews(q, D, sc);
    return loadSnapshot(q, D);
  });
}

describe('market simulator', () => {
  const refs: InstrumentRef[] = [
    {
      id: '1',
      symbol: 'UST10Y',
      name: '10Y',
      assetClass: 'rates',
      sector: 'Government',
      unit: 'bp',
      decimals: 3,
      prevClose: 4.0,
      vol: 5.6,
    },
    {
      id: '2',
      symbol: 'NVDA',
      name: 'NVDA',
      assetClass: 'equity',
      sector: 'Semiconductors',
      unit: 'pct',
      decimals: 2,
      prevClose: 180,
      vol: 2.6,
    },
    {
      id: '3',
      symbol: 'SPX',
      name: 'SPX',
      assetClass: 'index',
      sector: 'Index',
      unit: 'pct',
      decimals: 2,
      prevClose: 6700,
      vol: 0.85,
    },
  ];

  it('is deterministic per business date', async () => {
    const p = new SimulatedProvider();
    const a = await p.quotes(D, refs);
    const b = await p.quotes(D, refs);
    expect(a).toEqual(b);
    const c = await p.quotes('2026-10-06', refs);
    expect(c[2].chg).not.toBe(a[2].chg);
  });

  it('expresses yields in bp and equities in percent, and levels follow', async () => {
    const [ust, nvda] = await new SimulatedProvider().quotes(D, refs, { scenarios: ['rates_up', 'semis_selloff'] });
    expect(ust.unit).toBe('bp');
    expect(ust.chg).toBeGreaterThan(7);
    expect(ust.last).toBeCloseTo(4.0 + ust.chg / 100, 6);
    expect(nvda.unit).toBe('pct');
    expect(nvda.last).toBeCloseTo(180 * (1 + nvda.chg / 100), 6);
    expect(nvda.chg).toBeLessThan(-2);
  });

  it('formats moves with the right unit', () => {
    expect(formatMove('bp', 9.54)).toBe('+9.5 bp');
    expect(formatMove('pct', -3.1)).toBe('−3.10%');
  });

  it('every day has a storyline and every scenario key resolves', () => {
    for (const d of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-11-02']) {
      const keys = defaultScenarios(d);
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) expect(SCENARIOS.some((s) => s.key === k)).toBe(true);
    }
  });
});

describe('matching and ranking', () => {
  it('produces a ranked list for every salesperson, within preferences', async () => {
    const s = await snapshot();
    const sel = selectCards(s, buildCandidates(s));
    const reps = [...s.coverage.values()].flat();
    expect(new Set(reps).size).toBeGreaterThanOrEqual(12);
    for (const [, list] of sel) {
      expect(list.length).toBeLessThanOrEqual(8);
      const scores = list.map((c) => c.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });

  it('rates desk leads with rates stories and equity desk with sector stories', async () => {
    const s = await snapshot();
    const sel = selectCards(s, buildCandidates(s));
    const groups = [...sel.values()].map((l) => l[0]?.primary.trigger.group ?? '');
    expect(groups.some((g) => g === 'rates')).toBe(true);
    expect(groups.some((g) => g.startsWith('sector:'))).toBe(true);
  });

  it('keeps a single story from filling the whole list', async () => {
    const s = await snapshot();
    for (const [, list] of selectCards(s, buildCandidates(s))) {
      const counts = new Map<string, number>();
      for (const c of list) counts.set(c.primary.trigger.group, (counts.get(c.primary.trigger.group) ?? 0) + 1);
      expect(Math.max(0, ...counts.values())).toBeLessThanOrEqual(5);
    }
  });

  it('never builds a trigger on a restricted-list instrument', async () => {
    const s = await snapshot();
    expect(s.restrictedInstrumentIds.size).toBeGreaterThan(0);
    expect(suppressedByBarrier(s)).toBeGreaterThanOrEqual(0);
    for (const c of buildCandidates(s)) {
      for (const t of [c.primary, ...c.others]) {
        for (const id of t.trigger.instrumentIds) expect(s.restrictedInstrumentIds.has(id)).toBe(false);
      }
    }
  });

  it('scores are bounded and explainable', async () => {
    const s = await snapshot();
    for (const c of buildCandidates(s)) {
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(100);
      for (const v of Object.values(c.primary.factors)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('is idempotent for a rerun of the same day', async () => {
    const a = buildCandidates(await snapshot()).map((c) => [c.profileId, c.clientId, c.score]);
    const b = buildCandidates(await snapshot()).map((c) => [c.profileId, c.clientId, c.score]);
    expect(b).toEqual(a);
  });
});
