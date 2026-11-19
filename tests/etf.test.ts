import { describe, expect, it } from 'vitest';
import { openPglite } from '../src/lib/db/pglite';
import { publicAddress } from '../src/lib/live/fetch';
import { validateText } from '../src/lib/ai/validator';
import {
  FUNDS,
  completedCloses,
  computeEtf,
  etfFacts,
  fingerprintOf,
  flowLines,
  loadEtfRows,
  money,
  parseDirexion,
  parseProShares,
  plainNote,
  realizedVol,
  templateCommentary,
  type ShareRow,
} from '../src/lib/live/etf';
import type { DailySeries } from '../src/lib/live/weekly';

const S = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18'];
const row = (ticker: string, asOf: string, shares: number, nav: number): ShareRow => ({
  ticker,
  asOf,
  shares,
  nav,
  source: 'test',
  url: 'https://example.test/' + ticker,
});
/** A fund's rows from a list of share counts on consecutive sessions at a fixed NAV. */
const series = (ticker: string, shares: number[], nav: number, from = 0) =>
  shares.map((s, i) => row(ticker, S[from + i], s, nav));
const closes = (symbol: string, values: number[], dates = S): DailySeries => ({
  symbol,
  closes: values.map((close, i) => ({ date: dates[i], close })),
  at: dates[values.length - 1] + 'T21:00:00.000Z',
  source: 'test',
  url: 'u',
});

describe('issuer files', () => {
  it('reads ProShares history, scaling shares reported in thousands', () => {
    const csv = [
      'Date,ProShares Name,Ticker,NAV,Prior NAV,NAV Change (%),NAV Change ($),Shares Outstanding (000),Assets Under Management',
      '11/18/2026,ProShares UltraPro QQQ,TQQQ,52.49,51.8487,1.23687,0.6413,571950,30021655500',
      '11/17/2026,ProShares UltraPro QQQ,TQQQ,51.8487,53.0103,-2.19127,-1.1616,571650,29639309355',
      '11/16/2026,ProShares UltraPro QQQ,SQQQ,1,1,0,0,1,1',
      'garbage line',
    ].join('\r\n');
    const r = parseProShares(csv, 'TQQQ', 'u');
    expect(r.map((x) => x.asOf)).toEqual(['2026-11-17', '2026-11-18']);
    expect(r[1].shares).toBe(571950000);
    expect(r[1].nav).toBe(52.49);
    expect(() => parseProShares('a,b\n1,2', 'TQQQ', 'u')).toThrow('SOURCE_SCHEMA');
  });
  it('reads the Direxion holdings header and trade date', () => {
    const csv = [
      'Direxion Daily Semiconductor Bull 3X ETF',
      'SOXL',
      'Shares Outstanding:317800060',
      '',
      '"TradeDate","AccountTicker","StockTicker","SecurityDescription","Shares","Price","MarketValue","Cusip","HoldingsPercent"',
      '"11/19/2026 12:00:00 AM","SOXL","AMD","ADVANCED MICRO DEVICES","2141443.0000","530.1400","1135264592.0200","007903107","7.2"',
    ].join('\r\n');
    expect(parseDirexion(csv, 'SOXL')).toEqual({ shares: 317800060, tradeDate: '2026-11-19' });
    expect(() => parseDirexion(csv, 'SOXS')).toThrow('SOURCE_SCHEMA');
  });
});

describe('flow and target exposure', () => {
  // SOXL: 3x long, NAV 10. SOXS: 3x inverse, NAV 20. TQQQ: 3x long, SQQQ: 3x inverse. USD/SSG/QLD/UPRO/SPXU flat.
  const rows = [
    ...series('SOXL', [100e6, 100e6, 150e6, 160e6, 170e6, 180e6, 190e6], 10),
    ...series('SOXS', [50e6, 50e6, 40e6, 40e6, 40e6, 40e6, 30e6], 20),
    ...series('TQQQ', [500e6, 501e6, 502e6, 503e6, 504e6, 505e6, 506e6], 50),
    ...series('SQQQ', [40e6, 40e6, 40e6, 40e6, 40e6, 40e6, 39e6], 45),
    ...['USD', 'SSG', 'QLD', 'UPRO', 'SPXU'].flatMap((t) => series(t, [1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6], 30)),
  ];
  const book = computeEtf(rows, {
    index: {
      '^SOX': closes('^SOX', [100, 99, 98, 97, 96, 95, 94]),
      '^NDX': closes('^NDX', [100, 100, 100, 100, 100, 100, 101]),
    },
  })!;
  const fund = (t: string) => book.funds.find((f) => f.ticker === t)!;

  it('values a session flow at that session NAV and multiplies by leverage', () => {
    expect(book.latest).toBe('2026-11-18');
    expect(fund('SOXL').latest!.flow).toBe(10e6 * 10);
    expect(fund('SOXL').latest!.exposure).toBe(10e6 * 10 * 3);
    // Redeeming an inverse fund removes shorts: a negative flow with a positive (long-ward) exposure change.
    expect(fund('SOXS').latest!.flow).toBe(-10e6 * 20);
    expect(fund('SOXS').latest!.exposure).toBe(10e6 * 20 * 3);
  });
  it('matches the desk convention: +$5.10B of a 3x fund is about $15.3B of target exposure', () => {
    const b = computeEtf([row('TQQQ', S[0], 0, 51), row('TQQQ', S[1], 100e6, 51)])!;
    expect(money(b.funds.find((f) => f.ticker === 'TQQQ')!.latest!.flow)).toBe('+$5.10B');
    expect(money(b.funds.find((f) => f.ticker === 'TQQQ')!.latest!.exposure, false)).toBe('$15.30B');
  });
  it('sums the last five sessions and nets each group', () => {
    expect(book.weekFrom).toBe('2026-11-12');
    expect(fund('SOXL').week!.flow).toBe(90e6 * 10);
    expect(fund('SOXL').week!.sessions).toBe(5);
    const semis = book.groups.week.find((g) => g.key === 'semis')!;
    expect(semis.net).toBe(90e6 * 10 * 3 + 20e6 * 20 * 3);
    expect(semis.bull.funds).toContain('SOXL');
    expect(semis.complete).toBe(true);
    expect(book.daily.at(-1)!.semis).toBe(10e6 * 10 * 3 + 10e6 * 20 * 3);
  });
  it('reports index moves for the same sessions as the flows', () => {
    const sox = book.indices.find((i) => i.symbol === '^SOX')!;
    expect(sox.day).toBeCloseTo((94 / 95 - 1) * 100);
    // The window's first flow runs from the close before it, so the index move uses that same close.
    expect(sox.week).toBeCloseTo((94 / 99 - 1) * 100);
  });
  it('never assigns a multi-session gap to a single session', () => {
    const gap = [
      ...series('TQQQ', [1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6], 50),
      row('SOXL', S[3], 100e6, 10),
      row('SOXL', S[6], 130e6, 10),
    ];
    const b = computeEtf(gap)!;
    const soxl = b.funds.find((f) => f.ticker === 'SOXL')!;
    expect(soxl.latest).toBeNull();
    expect(soxl.week).toEqual({ flow: 300e6, exposure: 900e6, sessions: 3 });
    expect(b.partial).toContain('SOXL');
    expect(flowLines(b, 'week').find((g) => g.key === 'semis')!.lines[0].text).toContain('(3 of 5 sessions reported)');
  });
  it('a fund with a single snapshot has no flow yet and is flagged', () => {
    const b = computeEtf([...series('TQQQ', [1e6, 2e6], 50), row('SOXS', S[1], 19e6, 58)])!;
    const soxs = b.funds.find((f) => f.ticker === 'SOXS')!;
    expect(soxs.latest).toBeNull();
    expect(soxs.week).toBeNull();
    expect(soxs.shares).toBe(19e6);
    expect(b.partial).toContain('SOXS');
  });
  it('returns nothing without two sessions', () => {
    expect(computeEtf([row('TQQQ', S[0], 1, 1)])).toBeNull();
    expect(computeEtf([])).toBeNull();
  });
  it('covers every configured fund', () => {
    expect(book.funds.map((f) => f.ticker)).toEqual(FUNDS.map((f) => f.ticker));
  });

  it('writes desk-style CR/RD lines with the effect on net exposure', () => {
    const semis = flowLines(book, 'latest').find((g) => g.key === 'semis')!;
    const soxl = semis.lines.find((l) => l.ticker === 'SOXL')!;
    expect(soxl.text).toBe('SOXL: +$100M → approximately $300M of new semiconductor-long target exposure.');
    expect(soxl.effect).toBe('long');
    const soxs = semis.lines.find((l) => l.ticker === 'SOXS')!;
    expect(soxs.text).toBe('SOXS: −$200M → removed approximately $600M of semiconductor shorts.');
    expect(soxs.effect).toBe('long');
    expect(semis.combined!.text).toBe('Combined semiconductor shift: approximately $900M toward long exposure.');
  });
  it('commentary leads with the largest material group and reads flows against the index', () => {
    const c = templateCommentary(book);
    expect(c.bottomLine).toMatch(/^Over the past 5 sessions \(Nov 12–Nov 18\)/);
    expect(c.bottomLine).toContain('added to SOXL while redeeming SOXS');
    expect(c.bottomLine).toContain('dip-buying');
    expect(c.bottomLine).toContain('Wednesday');
    const all = [c.bottomLine, c.volatility ?? '', ...c.interpretation].join(' ');
    expect(all).not.toMatch(/NaN|undefined|Infinity|null/);
  });
  it('says so plainly when flows are immaterial', () => {
    const quiet = computeEtf(FUNDS.flatMap((f) => series(f.ticker, [1e6, 1.001e6], 10)))!;
    expect(templateCommentary(quiet).bottomLine).toContain('light');
  });
  it('fingerprints change when a flow changes', () => {
    const other = computeEtf(rows.map((r) => (r.ticker === 'SOXL' && r.asOf === S[6] ? { ...r, shares: 191e6 } : r)))!;
    expect(fingerprintOf(other)).not.toBe(fingerprintOf(book));
  });
});

describe('volatility', () => {
  it('computes annualised 21-day realized volatility', () => {
    const flat = Array.from({ length: 22 }, () => 100);
    expect(realizedVol(flat)).toBe(0);
    const alt = Array.from({ length: 22 }, (_, i) => (i % 2 ? 101 : 100));
    const r = Math.log(101 / 100);
    const expected = Math.sqrt(((r * r * 21) / 20) * (21 / 21)) * Math.sqrt(252) * 100;
    expect(realizedVol(alt)!).toBeGreaterThan(0);
    expect(Math.abs(realizedVol(alt)! - expected)).toBeLessThan(1);
    expect(realizedVol([1, 2, 3])).toBeNull();
  });
  it('drops the in-progress session before the 16:00 ET close', () => {
    const s = closes('^GSPC', [1, 2, 3], ['2026-11-17', '2026-11-18', '2026-11-19']);
    expect(completedCloses(s, new Date('2026-11-19T15:00:00Z')).map((c) => c.date)).toEqual([
      '2026-11-17',
      '2026-11-18',
    ]);
    expect(completedCloses(s, new Date('2026-11-19T22:00:00Z')).map((c) => c.date)).toHaveLength(3);
  });
  it('computes VIX, prior close and the implied-minus-realized premium', () => {
    const dates = Array.from({ length: 25 }, (_, i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10));
    const spx = closes(
      '^GSPC',
      dates.map((_, i) => 100 * (1 + (i % 2 ? 0.01 : 0))),
      dates,
    );
    const vix = closes(
      '^VIX',
      dates.map((_, i) => 20 + i * 0.1),
      dates,
    );
    const b = computeEtf([...series('TQQQ', [1e6, 2e6], 50)], { vix, spx }, new Date('2026-12-01T12:00:00Z'))!;
    expect(b.vol!.vixNow).toBeCloseTo(22.4);
    expect(b.vol!.vixPrev).toBeCloseTo(22.3);
    expect(b.vol!.premiumNow).toBeCloseTo(b.vol!.vixNow - b.vol!.rvNow!);
    const c = templateCommentary(b);
    expect(c.volatility).toContain('VIX is ~22.40 versus the prior close of 22.30');
  });
});

describe('model guardrails', () => {
  const book = computeEtf([...series('TQQQ', [500e6, 510e6], 50), ...series('SQQQ', [40e6, 39e6], 45)])!;
  const facts = etfFacts(book);
  it('accepts prose that carries figures only as tokens', () => {
    const text =
      'On {{date.latest}} TQQQ took in {{f.TQQQ.d}} while the {{name.ndx}} complex shifted {{g.ndx.d.net}} toward long.';
    expect(validateText(text, { allowedKeys: new Set(facts.keys()) }).ok).toBe(true);
    expect(facts.render(text)).toContain('+$500M');
  });
  it('rejects a model-typed number', () => {
    expect(validateText('TQQQ took in $500M.', { allowedKeys: new Set(facts.keys()) }).ok).toBe(false);
    expect(validateText('Flows hit 3x leverage.', { allowedKeys: new Set(facts.keys()) }).ok).toBe(false);
  });
});

describe('network safety', () => {
  it('judges NAT64 and IPv4-mapped addresses by the IPv4 they carry', () => {
    expect(publicAddress('64:ff9b::d04d:fc51')).toBe(true); // 208.77.252.81
    expect(publicAddress('64:ff9b::a00:1')).toBe(false); // 10.0.0.1
    expect(publicAddress('64:ff9b::7f00:1')).toBe(false); // 127.0.0.1
    expect(publicAddress('::ffff:192.168.1.1')).toBe(false);
    expect(publicAddress('::ffff:8.8.8.8')).toBe(true);
    expect(publicAddress('2606:4700::1')).toBe(true);
    expect(publicAddress('fe80::1')).toBe(false);
  });
});

describe('storage', () => {
  it('stores issuer rows, reads them back and keeps public read access', async () => {
    const { db } = await openPglite();
    const today = new Date();
    const d = (n: number) => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
    await db.asService((q) =>
      q(
        "insert into live_etf_shares(ticker,as_of,shares,nav,source,source_url) values('TQQQ',$1,500000000,50,'s','u'),('TQQQ',$2,510000000,51,'s','u') on conflict(ticker,as_of) do update set shares=excluded.shares",
        [d(2), d(1)],
      ),
    );
    const rows = await db.asService((q) => loadEtfRows(q));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ ticker: 'TQQQ', shares: 510000000, nav: 51 });
    const b = computeEtf(rows)!;
    expect(b.funds.find((f) => f.ticker === 'TQQQ')!.latest!.flow).toBe(10e6 * 51);
    await expect(
      db.asService((q) =>
        q("insert into live_etf_shares(ticker,as_of,shares,nav,source,source_url) values('bad!',now(),1,1,'s','u')"),
      ),
    ).rejects.toThrow();
    await db.asService((q) =>
      q('insert into live_etf_notes(business_date,fingerprint,payload) values($1,\'fp\',\'{"method":"template"}\')', [
        d(1),
      ]),
    );
    const [n] = await db.asService((q) => q('select payload from live_etf_notes'));
    expect((n.payload as { method: string }).method).toBe('template');
  });
});

describe('audit fixes', () => {
  it('rolls amounts over to the next unit instead of printing $1000M', () => {
    expect(money(999.6e6)).toBe('+$1.00B');
    expect(money(-999_700)).toBe('−$1M');
    expect(money(0.4e6)).toBe('$400K');
  });
  it('the note fingerprint ignores intraday VIX so the model is not re-run on every tick', () => {
    const rows = FUNDS.flatMap((f) => series(f.ticker, [1e6, 2e6], 10));
    const vix = (v: number) => closes('^VIX', [20, v], S.slice(0, 2));
    expect(fingerprintOf(computeEtf(rows, { vix: vix(21) })!)).toBe(fingerprintOf(computeEtf(rows, { vix: vix(29) })!));
  });
  it('model facts leave out live VIX values', () => {
    const b = computeEtf(
      FUNDS.flatMap((f) => series(f.ticker, [1e6, 3e6], 30)),
      {
        vix: closes('^VIX', [20, 21], S.slice(0, 2)),
      },
    )!;
    expect(etfFacts(b, true).keys()).not.toContain('vix.now');
    expect(etfFacts(b).keys()).toContain('vix.now');
  });
});

describe('quick-read note', () => {
  const rows = [
    ...series('TQQQ', [500e6, 501e6, 502e6, 503e6, 504e6, 505e6, 510e6], 50),
    ...series('SQQQ', [40e6, 40e6, 40e6, 40e6, 40e6, 40e6, 39e6], 45),
    ...['SOXL', 'SOXS', 'USD', 'SSG', 'QLD', 'UPRO', 'SPXU'].flatMap((t) => series(t, Array(7).fill(1e6), 30)),
  ];
  const book = computeEtf(rows, { index: { '^NDX': closes('^NDX', [100, 99, 98, 97, 96, 95, 94]) } })!;
  const note = templateCommentary(book);
  it('leads with a one-line takeaway in desk language', () => {
    expect(note.headline).toBe(
      'The selloff did not clear bullish leverage: Nasdaq-100 $1.49B toward long over 5 sessions, Wednesday added $885M more.',
    );
  });
  it('keeps the bottom line to two sentences', () => {
    expect(note.bottomLine.split(/(?<=\.)\s+(?=[A-Z])/).length).toBeLessThanOrEqual(2);
    expect(note.bottomLine).toContain('dip-buying, not capitulation');
  });
  it('reverses the headline when the latest session cuts against the window', () => {
    const cut = computeEtf(
      // Window still long (TQQQ +3M shares), but Wednesday redeems TQQQ and leaves SQQQ unchanged.
      rows.map((r) =>
        r.asOf !== S[6]
          ? r
          : r.ticker === 'TQQQ'
            ? { ...r, shares: 503e6 }
            : r.ticker === 'SQQQ'
              ? { ...r, shares: 40e6 }
              : r,
      ),
      { index: { '^NDX': closes('^NDX', [100, 99, 98, 97, 96, 95, 94]) } },
    )!;
    expect(templateCommentary(cut).headline).toContain('but Wednesday reversed');
  });
  it('copies as plain text in the chat format, with no markup or empty sections', () => {
    const text = plainNote(book, note, flowLines(book, 'latest'), flowLines(book, 'week'));
    expect(
      text.startsWith('Leveraged ETF color – Wednesday, November 18\n\n' + note.headline + '\n\nBottom line: '),
    ).toBe(true);
    expect(text).toContain('Wednesday CR/RD:\n- TQQQ: +$250M');
    expect(text).toContain('Past 5 sessions CR/RD (Nov 12–Nov 18):');
    expect(text).not.toMatch(/undefined|null|<|\n{3}/);
  });
  it('quiet markets still get a headline', () => {
    const quiet = computeEtf(FUNDS.flatMap((f) => series(f.ticker, [1e6, 1.001e6], 10)))!;
    expect(templateCommentary(quiet).headline).toMatch(/^Quiet leveraged flows/);
  });
});
