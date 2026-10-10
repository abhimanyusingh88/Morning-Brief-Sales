import type { FactBook } from '../ai/facts';
import type { Metric, Report, Story } from './types';
import { formatMetric, metricChange, sameNewsEvent } from './presentation';
import { displayDay, stamp } from './time';
// Day-over-day comparison of two published briefs for the same client scope. Everything here is computed in code
// from the two saved snapshots: level-to-level moves use the same unit rules as the brief (indices and yields in bp,
// commodities and crypto in percent, VIX as level plus percent). A model may narrate it, but never computes it.
export type MetricDelta = {
  key: string;
  label: string;
  unit: string;
  base: string;
  current: string;
  baseAsOf: string | null;
  currentAsOf: string | null;
  move: { value: number; label: string } | null;
  levelChange: string | null;
  baseSession: string | null;
  currentSession: string | null;
  stale: boolean;
  session: string | null;
  source: string | null;
};
export type ThemeShift = { topic: string; base: number; current: number };
export type HoldingShift = { symbol: string; direction: string; clients: string[]; base: number; current: number };
export type Comparison = {
  current: { day: string; cutoff: string; stories: number };
  base: { day: string; cutoff: string; stories: number };
  scope: string;
  metrics: MetricDelta[];
  themes: ThemeShift[];
  holdings: HoldingShift[];
  continuing: { current: Story; base: Story }[];
  newStories: Story[];
  faded: Story[];
  keyEvents: { current: string[]; base: string[] };
};
const session = (m: Metric) => metricChange(m)?.label ?? null;
function delta(now: Metric, then: Metric): MetricDelta {
  const pseudo = { ...now, value: now.value, previous: then.value } as Metric;
  const move = now.value !== null && then.value !== null ? metricChange(pseudo) : null;
  // VIX is quoted as a level: report the point change alongside the percent move.
  const levelChange =
    now.unit === 'level' && now.value !== null && then.value !== null
      ? (now.value - then.value > 0 ? '+' : '') + (now.value - then.value).toFixed(2) + ' pts'
      : null;
  return {
    key: now.key,
    label: now.label,
    unit: now.unit,
    base: formatMetric(then),
    current: formatMetric(now),
    baseAsOf: then.observedAt ?? then.observedDate,
    currentAsOf: now.observedAt ?? now.observedDate,
    move,
    levelChange,
    baseSession: session(then),
    currentSession: session(now), // Same quote on both days (a closed market), or two quotes from one session (an intraday read, then the close).
    stale: Boolean(
      (now.observedAt ?? now.observedDate) &&
      (now.observedAt ?? now.observedDate) === (then.observedAt ?? then.observedDate) &&
      now.value === then.value,
    ),
    session: now.observedDate && now.observedDate === then.observedDate ? now.observedDate : null,
    source: now.source ?? then.source,
  };
}
const directCount = (r: Report, symbol: string) =>
  r.articles.filter(
    (a) =>
      a.category !== 'macro' &&
      (a.symbols.includes(symbol) || a.matches.some((m) => m.symbol === symbol && m.reason !== 'Sector connection')),
  ).length;
export function compareReports(current: Report, base: Report): Comparison {
  const metrics = current.metrics.flatMap((m) => {
    const b = base.metrics.find((x) => x.key === m.key);
    return b && (m.value !== null || b.value !== null) ? [delta(m, b)] : [];
  });
  const topics = new Set([...current.articles, ...base.articles].flatMap((a) => a.topics));
  const count = (r: Report, t: string) => r.articles.filter((a) => a.topics.includes(t)).length;
  const themes = [...topics]
    .map((topic) => ({ topic, base: count(base, topic), current: count(current, topic) }))
    .filter((t) => t.base || t.current)
    .sort((a, b) => Math.abs(b.current - b.base) - Math.abs(a.current - a.base) || b.current - a.current)
    .slice(0, 10);
  const held = new Map<string, HoldingShift>();
  for (const h of [...current.holdings, ...base.holdings]) {
    const k = h.symbol + ':' + h.direction;
    const x = held.get(k) ?? { symbol: h.symbol, direction: h.direction, clients: [], base: 0, current: 0 };
    if (!x.clients.includes(h.client)) x.clients.push(h.client);
    held.set(k, x);
  }
  const holdings = [...held.values()]
    .map((h) => ({ ...h, base: directCount(base, h.symbol), current: directCount(current, h.symbol) }))
    .sort((a, b) => Math.abs(b.current - b.base) - Math.abs(a.current - a.base) || b.current - a.current);
  // The same event on both days is a continuing story; the rest are new today or no longer in the top of the book.
  const top = (r: Report) => [...r.articles].sort((a, b) => b.score - a.score).slice(0, 40);
  const nowTop = top(current),
    thenTop = top(base);
  const continuing = nowTop
    .flatMap((c) => {
      const b = thenTop.find((x) => sameNewsEvent(c, x));
      return b ? [{ current: c, base: b }] : [];
    })
    .slice(0, 8);
  const newStories = nowTop.filter((c) => !thenTop.some((x) => sameNewsEvent(c, x))).slice(0, 8);
  const faded = thenTop.filter((b) => !nowTop.some((x) => sameNewsEvent(x, b))).slice(0, 6);
  return {
    current: { day: current.businessDate, cutoff: current.cutoff, stories: current.articles.length },
    base: { day: base.businessDate, cutoff: base.cutoff, stories: base.articles.length },
    scope: current.clientName,
    metrics,
    themes,
    holdings,
    continuing,
    newStories,
    faded,
    keyEvents: {
      current: current.desk?.keyEvents.map((e) => e.text).slice(0, 5) ?? [],
      base: base.desk?.keyEvents.map((e) => e.text).slice(0, 5) ?? [],
    },
  };
}
export type ComparisonFocus = 'markets' | 'book' | 'news' | 'all';
/** What a comparison question is about, so the answer leads with that rather than everything. */
export function comparisonFocus(question: string): ComparisonFocus {
  const q = question.toLowerCase();
  if (/\b(position|positions|book|client|clients|holding|holdings|exposure|exposed|portfolio)\b/.test(q)) return 'book';
  if (/\b(news|stor(y|ies)|headline|headlines|theme|themes|narrative|coverage)\b/.test(q)) return 'news';
  if (
    /\b(market|markets|price|prices|yield|yields|rate|rates|treasur|vix|volatility|oil|crude|brent|wti|gold|silver|bitcoin|crypto|equit|index|indices|s&p|nasdaq|dow|russell|stoxx|bond|tape|risk)/.test(
      q,
    )
  )
    return 'markets';
  return 'all';
}
const moveOf = (c: Comparison, key: string) => c.metrics.find((m) => m.key === key)?.move ?? null;
const sessionNote = (m: MetricDelta) =>
  m.stale
    ? ' · unchanged quote (market closed)'
    : m.session
      ? ' · same ' + displayDay(m.session) + ' session, later quote'
      : '';
/** One computed line on how the market picture changed: equities, rates and volatility. */
function bottomLine(c: Comparison): string {
  const eq = ['SPX', 'NDX', 'RUT', 'DJI'].map((k) => moveOf(c, k)).filter((m): m is NonNullable<typeof m> => !!m);
  const avg = eq.length ? eq.reduce((s, m) => s + m.value, 0) / eq.length : null;
  const two = moveOf(c, 'UST2Y'),
    vix = c.metrics.find((m) => m.key === 'VIX');
  const parts = [
    avg === null
      ? null
      : Math.abs(avg) < 25
        ? 'US equities little changed'
        : avg > 0
          ? 'US equities higher'
          : 'US equities lower',
    two
      ? two.value > 0
        ? 'front-end yields up ' + two.label
        : two.value < 0
          ? 'front-end yields down ' + two.label
          : null
      : null,
    vix?.move ? (vix.move.value < 0 ? 'volatility lower' : vix.move.value > 0 ? 'volatility higher' : null) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'No market level is comparable across the two briefs';
}
/**
 * The code-written comparison, used when no model answer verifies. Like an analyst it answers the question asked:
 * a computed bottom line, then only the markets, book or news view the question is about (all three, briefly, if general).
 */
export function comparisonAnswer(c: Comparison, question = ''): string {
  const a = displayDay(c.current.day),
    b = displayDay(c.base.day),
    focus = comparisonFocus(question),
    n = focus === 'all' ? 4 : 8;
  const moved = c.metrics
    .filter((m) => m.move)
    .sort(
      (x, y) =>
        Math.abs(y.move!.value) / (y.move!.label.endsWith('bp') ? 100 : 1) -
        Math.abs(x.move!.value) / (x.move!.label.endsWith('bp') ? 100 : 1),
    );
  const markets = [
    '## Markets',
    ...(moved.length
      ? moved
          .slice(0, n)
          .map(
            (m) =>
              `• **${m.label}** ${m.move!.label}${m.levelChange ? ' (' + m.levelChange + ')' : ''}: ${m.base} → ${m.current}${sessionNote(m)}`,
          )
      : ['• No market level is available on both days.']),
  ];
  const touched = c.holdings.filter((h) => h.base !== h.current).slice(0, n);
  const book = [
    '## Your book',
    ...(touched.length
      ? touched.map(
          (h) =>
            `• **${h.symbol}** ${h.direction} (${h.clients.join(', ')}): ${h.base} → ${h.current} relevant stories`,
        )
      : ['• News flow on held names is unchanged between the two briefs.']),
  ];
  const news = [
    '## News flow',
    ...c.themes
      .filter((t) => t.base !== t.current)
      .slice(0, focus === 'news' ? 5 : 3)
      .map((t) => `• **${t.topic}** coverage ${t.current > t.base ? 'up' : 'down'}: ${t.base} → ${t.current} stories`),
    ...c.newStories.slice(0, focus === 'news' ? 5 : 2).map((s) => `• New: ${s.title} (${s.publisher})`),
    ...c.continuing
      .slice(0, focus === 'news' ? 3 : 1)
      .map((s) => `• Continuing: ${s.current.title} (${s.current.publisher})`),
  ];
  const sections =
    focus === 'markets' ? [markets] : focus === 'book' ? [book] : focus === 'news' ? [news] : [markets, book, news];
  return [
    `**${a} versus ${b}: ${bottomLine(c)}.**`,
    ...sections.flat(),
    `Compared within ${c.scope}; figures are each brief's latest timestamped observation.`,
  ].join('\n');
}
/** The comparison as model evidence: every figure is a fact token, so the validator still rejects invented numbers. */
export function comparisonContext(c: Comparison, facts: FactBook) {
  const add = (key: string, label: string, display: string, source: string, asOf: string) =>
    facts.add({ key, label, display, value: null, unit: 'text', source, asOf });
  const at = c.current.cutoff;
  const stories = [...c.continuing.map((x) => x.current), ...c.newStories, ...c.faded];
  const ref = (s: Story, i: number, kind: string) => ({
    id: s.id,
    title: add('cmp.' + kind + '.' + i + '.title', 'Published headline', s.title, s.publisher, s.publishedAt),
    publisher: s.publisher,
    published: add(
      'cmp.' + kind + '.' + i + '.at',
      'Publication time',
      stamp(s.publishedAt),
      s.publisher,
      s.publishedAt,
    ),
  });
  return {
    stories,
    context: {
      instruction:
        'Compare the current brief with the base day. Lead with the biggest change in the market picture, then what changed for the held names, then which stories are continuing versus new. Every figure must be one of these tokens.',
      current_day: add('cmp.day.current', 'Current brief day', displayDay(c.current.day), 'Report', at),
      base_day: add('cmp.day.base', 'Base brief day', displayDay(c.base.day), 'Report', c.base.cutoff),
      current_story_count: add(
        'cmp.count.current',
        'Stories in current brief',
        String(c.current.stories),
        'Report',
        at,
      ),
      base_story_count: add('cmp.count.base', 'Stories in base brief', String(c.base.stories), 'Report', c.base.cutoff),
      markets: c.metrics.map((m) => ({
        label: m.label,
        base_level: add(
          'cmp.m.' + m.key + '.base',
          m.label + ' on base day',
          m.base,
          m.source ?? '',
          m.baseAsOf ?? c.base.cutoff,
        ),
        current_level: add(
          'cmp.m.' + m.key + '.current',
          m.label + ' on current day',
          m.current,
          m.source ?? '',
          m.currentAsOf ?? at,
        ),
        move_between_days: m.move
          ? add(
              'cmp.m.' + m.key + '.move',
              m.label + ' move between the two briefs',
              m.move.label,
              m.source ?? '',
              m.currentAsOf ?? at,
            )
          : null,
        direction: m.move ? (m.move.value > 0 ? 'higher' : m.move.value < 0 ? 'lower' : 'unchanged') : null,
        points_change: m.levelChange
          ? add(
              'cmp.m.' + m.key + '.pts',
              m.label + ' point change',
              m.levelChange,
              m.source ?? '',
              m.currentAsOf ?? at,
            )
          : null,
        base_session_move: m.baseSession
          ? add(
              'cmp.m.' + m.key + '.bs',
              m.label + ' session move on base day',
              m.baseSession,
              m.source ?? '',
              m.baseAsOf ?? c.base.cutoff,
            )
          : null,
        current_session_move: m.currentSession
          ? add(
              'cmp.m.' + m.key + '.cs',
              m.label + ' session move on current day',
              m.currentSession,
              m.source ?? '',
              m.currentAsOf ?? at,
            )
          : null,
        same_observation_both_days: m.stale,
        same_session: m.session,
      })),
      themes: c.themes.map((t, i) => ({
        topic: t.topic,
        base_count: add(
          'cmp.t.' + i + '.base',
          t.topic + ' stories on base day',
          String(t.base),
          'Report',
          c.base.cutoff,
        ),
        current_count: add(
          'cmp.t.' + i + '.current',
          t.topic + ' stories on current day',
          String(t.current),
          'Report',
          at,
        ),
        trend: t.current > t.base ? 'more coverage' : t.current < t.base ? 'less coverage' : 'unchanged',
      })),
      holdings: c.holdings.slice(0, 20).map((h, i) => ({
        symbol: h.symbol,
        direction: h.direction,
        clients: h.clients,
        base_stories: add(
          'cmp.h.' + i + '.base',
          h.symbol + ' stories on base day',
          String(h.base),
          'Report',
          c.base.cutoff,
        ),
        current_stories: add(
          'cmp.h.' + i + '.current',
          h.symbol + ' stories on current day',
          String(h.current),
          'Report',
          at,
        ),
      })),
      continuing: c.continuing.map((x, i) => ref(x.current, i, 'cont')),
      new_on_current_day: c.newStories.map((s, i) => ref(s, i, 'new')),
      no_longer_leading: c.faded.map((s, i) => ref(s, i, 'faded')),
      key_events_untokenized_reference: c.keyEvents,
    },
  };
}
