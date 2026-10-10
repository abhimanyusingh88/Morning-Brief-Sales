import { TOPICS, type Filters, type Report, type Story, type Metric } from './types';
export function parseFilters(params: URLSearchParams): Filters {
  return {
    q: (params.get('q') ?? '').trim().slice(0, 160),
    topic: TOPICS.includes(params.get('topic') as (typeof TOPICS)[number]) ? params.get('topic')! : '',
    symbol: /^[A-Z0-9.\-]{1,15}$/.test(params.get('symbol') ?? '') ? params.get('symbol')! : '',
  };
}
const HEADLINE_STOP = new Set([
  'the',
  'a',
  'an',
  'and',
  'to',
  'of',
  'for',
  'on',
  'in',
  'by',
  'with',
  'as',
  'at',
  'is',
  'are',
  'says',
  'new',
  'after',
  'over',
  'amid',
  'from',
]);
const headlineWords = (title: string) =>
  new Set(
    title
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3 && !HEADLINE_STOP.has(w))
      .map((w) => (w.endsWith('s') ? w.slice(0, -1) : w)),
  );
export function sameNewsEvent(a: Story, b: Story): boolean {
  if (a.category !== b.category) return false;
  try {
    if (
      a.publisher === b.publisher &&
      new URL(a.url).hostname === new URL(b.url).hostname &&
      new URL(a.url).pathname === new URL(b.url).pathname
    )
      return true;
  } catch {}
  const x = headlineWords(a.title),
    y = headlineWords(b.title);
  const common = [...x].filter((w) => y.has(w)).length;
  return common >= 4 && common / Math.min(x.size, y.size) >= 0.6;
}
export function filterStories(report: Report, f: Filters): Story[] {
  const selected = report.articles.filter(
    (a) =>
      (!f.topic || a.topics.includes(f.topic)) &&
      (!f.symbol || a.symbols.includes(f.symbol) || a.matches.some((m) => m.symbol === f.symbol)) &&
      (!f.q ||
        (a.title + ' ' + a.excerpt + ' ' + a.publisher + ' ' + a.reason).toLowerCase().includes(f.q.toLowerCase())),
  );
  const groups: Story[] = [];
  for (const article of selected) {
    const existing = groups.find((a) => sameNewsEvent(a, article));
    if (existing) {
      existing.relatedSources ??= [];
      existing.relatedSources.push({
        id: article.id,
        title: article.title,
        url: article.url,
        publisher: article.publisher,
        publishedAt: article.publishedAt,
      });
    } else
      groups.push({
        ...article,
        matches: f.symbol ? article.matches.filter((m) => m.symbol === f.symbol) : article.matches,
        relatedSources: [],
      });
  }
  return groups;
}
export function formatMetric(m: Metric): string {
  if (m.value === null) return '—';
  const n = m.value.toLocaleString('en-US', {
    minimumFractionDigits: m.unit === 'bp' ? 0 : 2,
    maximumFractionDigits: m.unit === 'bp' ? 0 : 2,
  });
  return m.unit === 'yield' ? n + '%' : m.unit === 'bp' ? n + ' bp' : m.unit.startsWith('USD') ? '$' + n : n;
}
export function metricChange(m: Metric): { value: number; label: string } | null {
  if (m.value === null || m.previous === null || m.previous === 0) return null;
  const value =
    m.unit === 'yield'
      ? (m.value - m.previous) * 100
      : m.unit === 'bp'
        ? m.value - m.previous
        : (m.value / m.previous - 1) * (m.unit === 'index' ? 10000 : 100);
  const unit = m.unit === 'yield' || m.unit === 'bp' || m.unit === 'index' ? 'bp' : '%';
  return { value, label: (value > 0 ? '+' : '') + value.toFixed(1) + unit };
}
/** Signed change tokens already carry "+"/"-": avoid "down -6.0bp" and "up +0.5%" after substitution. */
export function tidySigns(text: string): string {
  return text
    .replace(
      /\b(down|lower|fell|falls|declined|declines|dropped|drops|lost|loses|off|eased|eases|slipped|slips)(\s+(?:by\s+)?)-(?=\d)/gi,
      '$1$2',
    )
    .replace(
      /\b(up|higher|rose|rises|gained|gains|added|adds|climbed|climbs|rallied|rallies|jumped|jumps)(\s+(?:by\s+)?)\+(?=\d)/gi,
      '$1$2',
    );
}
/** The brief's headline set: market-moving news first (war, oil, Fed, AI…), then the stories closest to the book. */
export function briefSelection(stories: Story[], size = 30): Story[] {
  const market = [...stories]
    .sort((a, b) => (b.importance ?? b.score) - (a.importance ?? a.score))
    .slice(0, Math.round(size * 0.4));
  const picked = new Set(market.map((a) => a.id));
  const book = stories
    .filter((a) => !picked.has(a.id) && (a.importance ?? a.score) > 12)
    .slice(0, size - market.length);
  return [...market, ...book].sort((a, b) => b.score - a.score);
}
