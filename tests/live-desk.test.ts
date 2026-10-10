import { describe, expect, it } from 'vitest';
import { parsePublisherFeed, googleNewsFeeds } from '../src/lib/live/feeds';
import { sinceClose } from '../src/lib/live/time';
import { routeIntent } from '../src/lib/live/assistant';
import { templateDesk, deskFacts } from '../src/lib/live/desk';
import { parseChart, parseCalendar } from '../src/lib/live/intraday';
import { renderEmail, dueToSend, chartUrl, recipients } from '../src/lib/live/email';
import { matchArticles } from '../src/lib/live/reports';
import { validateText } from '../src/lib/ai/validator';
import type { Article, Holding, Metric, Report } from '../src/lib/live/types';
const now = new Date('2026-10-09T13:00:00Z');
const art = (id: string, title: string, topics: string[], symbols: string[] = [], publisher = 'Reuters'): Article => ({
  id,
  url: 'https://news.google.com/rss/articles/' + id,
  title,
  excerpt: title,
  publisher,
  publishedAt: '2026-10-09T11:00:00.000Z',
  eventDate: '2026-10-09',
  verifiedAt: now.toISOString(),
  evidenceHash: id,
  symbols,
  topics,
  summaryTemplate: null,
  verification: 'test',
});
const hold = (symbol: string, direction: 'Long' | 'Short' = 'Long'): Holding => ({
  id: 'h-' + symbol,
  clientId: 'c1',
  client: 'Meridian Ridge Capital',
  accountId: 'a1',
  account: 'MR101',
  fund: 'Fund',
  symbol,
  direction,
  quantity: '1',
  currentValue: '1',
  initialValue: '1',
  spread: '1',
  margin: '1',
  currency: 'USD',
  valuationDate: '2026-10-08',
});
const metric = (key: string, unit: string, value: number, previous: number): Metric => ({
  key,
  label: key,
  group: 'Equities',
  unit,
  value,
  previous,
  observedDate: '2026-10-09',
  observedAt: now.toISOString(),
  fetchedAt: null,
  source: 'Yahoo',
  url: null,
  cadence: 'delayed',
  note: '',
});
describe('news window and wider sources', () => {
  it('starts the window at the prior US close, skipping weekends', () => {
    expect(new Date(sinceClose(now)).toISOString()).toBe('2026-10-08T20:00:00.000Z');
    expect(new Date(sinceClose(new Date('2026-10-12T13:00:00Z'))).toISOString()).toBe('2026-10-09T20:00:00.000Z');
  });
  it('attributes Google News items to the original publisher and strips the suffix', () => {
    const xml =
      '<rss><channel><title>t</title><link>https://news.google.com/</link><item><title>Oil jumps as OPEC cuts output - Reuters</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Fri, 09 Oct 2026 10:00:00 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item><item><title>Old oil story - Reuters</title><link>https://news.google.com/rss/articles/old</link><pubDate>Thu, 08 Oct 2026 12:00:00 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item></channel></rss>';
    const a = parsePublisherFeed(xml, ['XOM'], now);
    expect(a).toHaveLength(1);
    expect(a[0].publisher).toBe('Reuters');
    expect(a[0].title).toBe('Oil jumps as OPEC cuts output');
    expect(a[0].topics).toContain('Oil');
  });
  it('builds company queries for held names', () => {
    expect(
      googleNewsFeeds(['NVDA', 'XOM']).some((u) => decodeURIComponent(u).includes('"NVIDIA" OR "Exxon Mobil"')),
    ).toBe(true);
  });
});
describe('relevance and exposure graph', () => {
  it('ranks direct > peer read-across > macro and explains why', () => {
    const s = matchArticles(
      [
        art('m', 'Fed signals rates on hold', ['Rates']),
        art('p', 'AMD unveils new AI accelerator', ['AI', 'Semiconductors'], ['AMD']),
        art('d', 'NVIDIA beats estimates', ['Earnings'], ['NVDA']),
      ],
      [hold('NVDA')],
      { sectors: [], symbols: [], timezone: '' },
      now.getTime(),
    );
    expect(s.map((x) => x.id)).toEqual(['d', 'p', 'm']);
    expect(s[1].reason).toContain('Read-across');
    expect(s[1].matches[0].reason).toBe('Peer read-across');
  });
});
describe('desk note', () => {
  it('template note uses verified figures and the top headlines', () => {
    const d = templateDesk(
      [art('a', 'Oil surges on Hormuz tension', ['Oil', 'Geopolitics'])],
      [metric('SPX', 'index', 6010, 6000)],
      now,
    );
    expect(d.keyEvents[0].storyIds).toEqual(['a']);
    expect(d.wrap[0]).toContain('S&P 500 +16.7bp');
  });
  it('fact tokens make model prose pass the numeric validator', () => {
    const f = deskFacts([metric('SPX', 'index', 6010, 6000)]);
    expect(validateText('The {{name.SPX}} is {{m.SPX.chg}} on tech.', { allowedKeys: new Set(f.keys()) }).ok).toBe(
      true,
    );
    expect(validateText('The S&P 500 is up 0.2% on tech.', { allowedKeys: new Set(f.keys()) }).ok).toBe(false);
  });
});
describe('assistant routing', () => {
  it('routes desk intents', () => {
    expect(routeIntent('Give me talking points for my call')).toBe('talking_points');
    expect(routeIntent('Should I buy NVDA here?')).toBe('scenario');
    expect(routeIntent('Draft a note to send to the client')).toBe('draft');
    expect(routeIntent('Which positions are exposed to oil?')).toBe('exposure');
    expect(routeIntent('What data releases are on today?')).toBe('catalysts');
  });
});
describe('charts, calendar and email', () => {
  const chart = JSON.stringify({
    chart: {
      result: [
        {
          meta: { regularMarketPrice: 6020, chartPreviousClose: 6000, regularMarketTime: 1791550800, currency: 'USD' },
          timestamp: [1791540000, 1791543600, 1791547200],
          indicators: { quote: [{ close: [6001, null, 6020] }] },
        },
      ],
    },
  });
  it('parses chart data and skips empty prints', () => {
    const s = parseChart(chart, 'ES=F', 'ES', 'https://query1.finance.yahoo.com/x');
    expect(s.points).toHaveLength(2);
    expect(s.changePct).toBeCloseTo(0.3333, 3);
    expect(chartUrl(s)).toBeNull();
  });
  it("keeps today's releases with estimates and priors", () => {
    const c = parseCalendar(
      JSON.stringify([
        {
          title: 'UoM Consumer Sentiment',
          country: 'USD',
          date: '2026-10-09T10:00:00-04:00',
          impact: 'High',
          forecast: '47.6',
          previous: '48.1',
        },
        { title: 'Old', country: 'USD', date: '2026-10-07T10:00:00-04:00', impact: 'High', forecast: '', previous: '' },
      ]),
      now,
    );
    expect(c.scope).toBe('today');
    expect(c.events).toHaveLength(1);
    expect(c.events[0].forecast).toBe('47.6');
  });
  it('sends only on weekdays from the configured time', () => {
    expect(dueToSend(new Date('2026-10-09T13:29:00Z'))).toBe(false);
    expect(dueToSend(new Date('2026-10-09T13:31:00Z'))).toBe(true);
    expect(dueToSend(new Date('2026-10-10T14:00:00Z'))).toBe(false);
  });
  it('accepts only well-formed internal recipients', () => {
    process.env.BRIEF_RECIPIENTS = 'desk@firm.com, bad, x@y.io';
    expect(recipients()).toEqual(['desk@firm.com', 'x@y.io']);
    delete process.env.BRIEF_RECIPIENTS;
  });
  it('renders an escaped, sourced email with the client book', () => {
    const report = {
      id: 'r',
      profileId: 'p',
      salesperson: 'S',
      clientId: null,
      clientName: 'All my clients',
      businessDate: '2026-10-09',
      cutoff: now.toISOString(),
      coverageHash: '',
      holdings: [hold('NVDA', 'Short')],
      metrics: [metric('SPX', 'index', 6010, 6000)],
      articles: matchArticles(
        [art('d', 'NVIDIA <b>beats</b> estimates', ['Earnings'], ['NVDA'])],
        [hold('NVDA', 'Short')],
        { sectors: [], symbols: [], timezone: '' },
        now.getTime(),
      ),
      sources: [],
      preferences: { sectors: [], symbols: [], timezone: '' },
      coverage: ['NVDA'],
      desk: null,
    } as Report;
    const m = renderEmail(
      report,
      { overnight: [], movers: [parseChart(chart, 'NVDA', 'NVDA', 'u')], calendar: null },
      null,
    );
    expect(m.html).toContain('NVIDIA &lt;b&gt;beats&lt;/b&gt;');
    expect(m.html).toContain('+0.33%');
    expect(m.html).toContain('Short');
    expect(m.subject).toContain('Morning Brief');
  });
});
describe('sign wording', () => {
  it('drops a redundant sign after up/down words', async () => {
    const { tidySigns } = await import('../src/lib/live/presentation');
    expect(tidySigns('yields 5.22%, down -6.0bp; gold up +1.5%; S&P -0.2%')).toBe(
      'yields 5.22%, down 6.0bp; gold up 1.5%; S&P -0.2%',
    );
  });
});
describe('fact tokenization', () => {
  it('maps exact copies of supplied values to tokens and leaves invented figures to the validator', async () => {
    const { FactBook } = await import('../src/lib/ai/facts');
    const f = new FactBook();
    f.add({ key: 'px.COIN.chg', label: '', display: '+5.58%', value: null, unit: 'text', source: '', asOf: '' });
    f.add({ key: 'name.SPX', label: '', display: 'S&P 500', value: null, unit: 'text', source: '', asOf: '' });
    const t = f.tokenize('COIN is +5.58% while the S&P 500 lags; {{px.COIN.chg}} again; +15.58% is invented.');
    expect(t).toBe('COIN is {{px.COIN.chg}} while the {{name.SPX}} lags; {{px.COIN.chg}} again; +15.58% is invented.');
    expect(validateText(t, { allowedKeys: new Set(f.keys()) }).ok).toBe(false);
  });
});
describe('pdf with desk note', () => {
  it('renders key events and wrap into a valid PDF', async () => {
    const { renderPdf } = await import('../src/lib/live/pdf');
    const report = {
      id: 'r',
      profileId: 'p',
      salesperson: 'S',
      clientId: null,
      clientName: 'All my clients',
      businessDate: '2026-10-09',
      cutoff: now.toISOString(),
      coverageHash: '',
      holdings: [hold('NVDA')],
      metrics: [metric('SPX', 'index', 6010, 6000)],
      articles: matchArticles(
        [art('d', 'NVIDIA beats estimates', ['Earnings'], ['NVDA'])],
        [hold('NVDA')],
        { sectors: [], symbols: [], timezone: '' },
        now.getTime(),
      ),
      sources: [],
      preferences: { sectors: [], symbols: [], timezone: '' },
      coverage: ['NVDA'],
      desk: {
        generatedAt: now.toISOString(),
        method: 'template',
        keyEvents: [{ text: 'Rates: Fed on hold', storyIds: [] }],
        wrap: ['Stocks are firmer.'],
        sections: [],
      },
    } as Report;
    const b = await renderPdf(report, { q: '', topic: '', symbol: '' });
    expect(Buffer.from(b.slice(0, 4)).toString()).toBe('%PDF');
    expect(b.length).toBeGreaterThan(2000);
  });
});
describe('article reader', () => {
  it('resolves Google News ids and extracts the main text, rejecting stubs', async () => {
    const { googleArticleId, parseBatchUrl, extractMainText, matchesStory } = await import('../src/lib/live/resolve');
    const { openUrl } = await import('../src/lib/live/fetch');
    expect(googleArticleId('https://news.google.com/rss/articles/CBMiYkFVX3lxTE11dlNrd3RfTU5K?oc=5')).toBe(
      'CBMiYkFVX3lxTE11dlNrd3RfTU5K',
    );
    expect(googleArticleId('https://www.cnbc.com/a')).toBeNull();
    expect(
      parseBatchUrl(')]}\'\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://fortune.com/article/oil/\\",1]"]]'),
    ).toBe('https://fortune.com/article/oil/');
    const para =
      'Oil prices fell on Friday as traders weighed supply risks in the Gulf and fresh signals from producers about output.';
    const html =
      '<html><nav><p>' +
      'Menu item that is long enough to look like a paragraph of text here.' +
      '</p></nav><article><h1>Oil prices fall</h1>' +
      Array.from({ length: 6 }, () => '<p>' + para + '</p>').join('') +
      '<p>Subscribe to our newsletter for more.</p></article></html>';
    const t = extractMainText(html);
    expect(t).toContain('Oil prices fell');
    expect(t).not.toContain('Menu item');
    expect(t).not.toContain('Subscribe');
    expect(matchesStory(html, (t + ' ').repeat(8), 'Oil prices fall as Gulf supply risks grow')).toBe(true);
    expect(
      matchesStory(
        '<p>Please accept cookies</p>',
        'Please accept cookies',
        'Oil prices fall as Gulf supply risks grow',
      ),
    ).toBe(false);
    for (const bad of [
      'http://x.com/a',
      'https://127.0.0.1/a',
      'https://localhost/a',
      'https://u:p@x.com/a',
      'https://intranet/a',
    ])
      expect(() => openUrl(bad)).toThrow();
  });
});
