import { describe, expect, it } from 'vitest';
import { openPglite } from '../src/lib/db/pglite';
import { uid } from '../src/lib/util/id';
import { holdings } from '../src/lib/live/reports';
import { classify } from '../src/lib/live/classify';
import { computeWeekly, fmtPct, fmtUsd, parseDaily, type DailySeries } from '../src/lib/live/weekly';
import type { Holding } from '../src/lib/live/types';

const DATES = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09'];
const series = (symbol: string, closes: number[]): DailySeries => ({
  symbol,
  closes: closes.map((close, i) => ({ date: DATES[i], close })),
  at: '2026-11-09T21:00:00.000Z',
  source: 'test',
  url: 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol,
});
const holding = (clientId: string, symbol: string, direction: 'Long' | 'Short', quantity: number): Holding => ({
  id: clientId + symbol + direction,
  clientId,
  client: 'Client ' + clientId,
  accountId: 'a' + clientId,
  account: 'A' + clientId,
  fund: 'Fund ' + clientId,
  symbol,
  direction,
  quantity: String(quantity),
  currentValue: '0',
  initialValue: '0',
  spread: '0',
  margin: '0',
  currency: 'USD',
  valuationDate: null,
});

describe('weekly client moves', () => {
  const book = [
    holding('1', 'AAA', 'Long', 100),
    holding('1', 'BBB', 'Short', 50),
    holding('2', 'BBB', 'Long', 10),
    holding('3', 'CCC', 'Long', 10),
  ];
  const data = new Map([
    ['AAA', series('AAA', [100, 101, 102, 104, 108, 110])],
    ['BBB', series('BBB', [200, 198, 195, 190, 185, 180])],
  ]);
  const w = computeWeekly(book, data);

  it('values each position from real-style closes, with shorts gaining as the stock falls', () => {
    const aaa = w.positions.find((p) => p.symbol === 'AAA')!;
    expect(aaa.pnl).toBe(1000);
    expect(aaa.pricePct).toBeCloseTo(10);
    const shortB = w.positions.find((p) => p.symbol === 'BBB' && p.direction === 'Short')!;
    expect(shortB.pnl).toBe(1000);
    expect(shortB.pricePct).toBeCloseTo(-10);
    expect(shortB.positionPct).toBeCloseTo(10);
  });

  it('aggregates clients on gross exposure and ranks movers', () => {
    const c1 = w.clients.find((c) => c.clientId === '1')!;
    expect(c1.exposure).toBe(100 * 100 + 50 * 200);
    expect(c1.pct).toBeCloseTo((2000 / 20000) * 100);
    expect(c1.path.map((p) => p.date)).toEqual(DATES);
    expect(c1.path[0].pct).toBe(0);
    expect(c1.path.at(-1)!.pct).toBeCloseTo(c1.pct);
    expect(w.up.map((c) => c.clientId)).toEqual(['1']);
    expect(w.down.map((c) => c.clientId)).toEqual(['2']);
    expect(w.total.pnl).toBe(2000 - 200);
  });

  it('leaves out unpriced positions and says so', () => {
    expect(w.unpriced).toEqual(['CCC']);
    expect(w.clients.some((c) => c.clientId === '3')).toBe(false);
    expect(w.narrative.at(-1)).toContain('CCC');
    expect(w.narrative.join(' ')).not.toMatch(/NaN|undefined|Infinity/);
    expect(w.from).toBe('2026-11-02');
    expect(w.to).toBe('2026-11-09');
  });

  it('returns an empty week when no prices load', () => {
    const none = computeWeekly(book, new Map());
    expect(none.clients).toEqual([]);
    expect(none.unpriced).toEqual(['AAA', 'BBB', 'CCC']);
  });

  it('formats signed percent and dollar figures', () => {
    expect(fmtPct(1.234)).toBe('+1.23%');
    expect(fmtPct(-0.5)).toBe('−0.50%');
    expect(fmtPct(0)).toBe('0.00%');
    expect(fmtUsd(1_250_000)).toBe('+$1.25M');
    expect(fmtUsd(-3400)).toBe('−$3.4K');
    expect(fmtUsd(25_000_000, false)).toBe('$25.00M');
  });
});

describe('daily close parsing', () => {
  const at = (d: string) => Date.parse(d + 'T14:30:00Z') / 1000;
  const chart = (price: number, time: number) =>
    JSON.stringify({
      chart: {
        result: [
          {
            meta: { regularMarketPrice: price, regularMarketTime: time },
            timestamp: [at('2026-11-05'), at('2026-11-06'), at('2026-11-09')],
            indicators: { quote: [{ close: [10, null, 12] }] },
          },
        ],
      },
    });
  it('keys closes by US session, skips gaps and uses the latest market price', () => {
    const s = parseDaily(chart(12.5, at('2026-11-09') + 3600), 'X', 'u');
    expect(s.closes).toEqual([
      { date: '2026-11-05', close: 10 },
      { date: '2026-11-09', close: 12.5 },
    ]);
    expect(s.at).toBe(new Date((at('2026-11-09') + 3600) * 1000).toISOString());
  });
  it('rejects a malformed response', () => {
    expect(() => parseDaily('{"chart":{"result":[]}}', 'X', 'u')).toThrow('SOURCE_SCHEMA');
  });
});

describe('growth client book', () => {
  it('brings the active book to twelve clients holding the requested names', async () => {
    const { db } = await openPglite();
    const active = await db.asService((q) => q('select name from live_clients where active order by name'));
    const names = active.map((r) => String(r.name));
    for (const n of [
      'Vantage Quantum Partners',
      'Ironclad Compute Capital',
      'Fairhaven Fintech Fund',
      'Sterling Peak Growth',
      'Tidewater Energy Innovation',
      'Granite Arch Capital',
    ])
      expect(names).toContain(n);
    const book = await db.asUser(uid('live:sales-1'), (q) => holdings(q));
    const symbols = new Set(book.map((h) => h.symbol));
    for (const s of [
      'SMCI',
      'AVGO',
      'IREN',
      'OKLO',
      'IONQ',
      'RGTI',
      'QBTS',
      'SNDK',
      'CRWV',
      'SOFI',
      'TSLA',
      'HOOD',
      'GOOG',
    ])
      expect(symbols.has(s)).toBe(true);
    const second = await db.asUser(uid('live:sales-2'), (q) => holdings(q));
    expect(second.some((h) => h.client === 'Vantage Quantum Partners')).toBe(false);
    expect(second.some((h) => h.client === 'Granite Arch Capital')).toBe(true);
  });
  it('tags news about the new issuers', () => {
    expect(classify('CoreWeave and Super Micro rally on AI demand', ['CRWV', 'SMCI']).symbols).toEqual(
      expect.arrayContaining(['CRWV', 'SMCI']),
    );
    expect(classify('Rigetti, D-Wave and IonQ jump as quantum stocks rally', []).symbols).toEqual(
      expect.arrayContaining(['RGTI', 'QBTS', 'IONQ']),
    );
  });
});
