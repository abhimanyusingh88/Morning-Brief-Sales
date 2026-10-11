import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { Figures } from '@/components/ui/figures';
import { IntradayChart, Sparkline } from '@/components/ui/chart';
import { NewsReader } from './news-reader';
import { NewsFeed } from './news-feed';
import type { Filters, Holding, Report, Story, Metric } from '@/lib/live/types';
import type { Series, Calendar } from '@/lib/live/intraday';
import { briefSelection, filterStories, formatMetric, metricChange } from '@/lib/live/presentation';
import { displayDay, stamp } from '@/lib/live/time';
export type MarketPanel = { overnight: Series[]; movers: Series[]; calendar: Calendar | null };
export const number = (s: string) => Number(s).toLocaleString('en-US', { maximumFractionDigits: 8 });
const time = (at: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(
    new Date(at),
  );
const pct = (v: number | null) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(2) + '%');
const tone = (v: number | null | undefined) =>
  v == null ? 'text-muted' : v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink-2';
function Section({
  id,
  title,
  right,
  children,
}: {
  id?: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <div className="mb-2.5 flex items-end justify-between gap-3 border-b-2 border-navy pb-1.5">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-navy">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}
export function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[750px] text-xs">
        <caption className="sr-only">Client holdings as recorded in the client database.</caption>
        <thead className="bg-sunken/60">
          <tr>
            {[
              'Client / fund',
              'Account',
              'Stock',
              'Position',
              'Quantity',
              'Current value',
              'Initial value',
              'Spread',
              'Margin',
            ].map((h, i) => (
              <th
                scope="col"
                key={h}
                className={
                  'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted ' +
                  (i >= 4 ? 'text-right' : 'text-left')
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {holdings.map((h) => (
            <tr key={h.id} className="hover:bg-sunken/40">
              <td className="px-3 py-2.5">
                <p className="font-semibold text-ink">{h.client}</p>
                <p className="mt-0.5 max-w-[260px] text-[11px] text-muted">{h.fund}</p>
              </td>
              <td className="mono px-3 text-[11px]">{h.account}</td>
              <td className="mono px-3 font-semibold">{h.symbol}</td>
              <td className="px-3">
                <Direction d={h.direction} />
              </td>
              {[h.quantity, h.currentValue, h.initialValue, h.spread, h.margin].map((s, i) => (
                <td key={i} className="num px-3 text-right">
                  {number(s)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const Direction = ({ d }: { d: string }) => (
  <span
    className={
      'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ' +
      (d === 'Long' ? 'bg-up-50 text-up' : 'bg-down-50 text-down')
    }
  >
    {d}
  </span>
);
const STRIP = ['SPX', 'DJI', 'NDX', 'RUT', 'SX5E', 'UST10Y', 'BRENT', 'GOLD', 'BTC', 'VIX'];
const SHORT: Record<string, string> = {
  SPX: 'S&P 500',
  DJI: 'Dow',
  NDX: 'Nasdaq 100',
  RUT: 'Russell 2000',
  SX5E: 'Euro Stoxx 50',
  UST10Y: 'UST 10Y',
  BRENT: 'Brent',
  GOLD: 'Gold',
  BTC: 'Bitcoin',
  VIX: 'VIX',
};
function Strip({ metrics }: { metrics: Metric[] }) {
  const cells = STRIP.map((k) => metrics.find((m) => m.key === k)).filter((m): m is Metric => !!m);
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-5 xl:grid-cols-10">
      {cells.map((m) => {
        const c = metricChange(m);
        return (
          <div
            key={m.key}
            title={(m.source ?? 'No source') + ' · ' + m.note}
            className="border-b border-r border-line px-3 py-2.5 text-center last:border-r-0 xl:border-b-0"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{SHORT[m.key]}</p>
            <p className={'num mt-1 text-[15px] font-bold ' + tone(c?.value)}>{c ? c.label : '—'}</p>
            <p className="num mt-0.5 text-[11px] text-ink-2">{formatMetric(m)}</p>
          </div>
        );
      })}
    </div>
  );
}
function StoryLink({ story, children }: { story?: Story; children: React.ReactNode }) {
  return story ? (
    <NewsReader story={story}>
      <button type="button" className="text-left hover:text-brand">
        {children}
      </button>
    </NewsReader>
  ) : (
    <>{children}</>
  );
}
/** The day's five biggest gainers and five biggest decliners among the held stocks, by move versus prior close. */
function BookMovers({ report, movers, stories }: { report: Report; movers: Series[]; stories: Story[] }) {
  const rows = report.holdings
    .map((h) => ({
      h,
      s: movers.find((m) => m.symbol === h.symbol),
      n: stories.filter((a) => a.matches.some((m) => m.symbol === h.symbol && m.clientId === h.clientId)),
      top: stories.find((a) => a.category === 'company' && a.symbols.includes(h.symbol)),
    }))
    .filter((r) => r.s?.changePct != null);
  const move = (r: (typeof rows)[number]) => r.s!.changePct!;
  const groups = [
    {
      label: 'Top gainers',
      rows: rows
        .filter((r) => move(r) > 0)
        .sort((x, y) => move(y) - move(x))
        .slice(0, 5),
    },
    {
      label: 'Top decliners',
      rows: rows
        .filter((r) => move(r) < 0)
        .sort((x, y) => move(x) - move(y))
        .slice(0, 5),
    },
  ].filter((g) => g.rows.length);
  if (!groups.length)
    return (
      <p className="px-4 py-6 text-xs text-muted">
        {report.archived
          ? 'No price moves were saved for these holdings on this day.'
          : movers.length
            ? 'None of these holdings has moved from its prior close yet.'
            : 'Price data for these holdings is unavailable right now. Refresh to try again; no values are estimated.'}
      </p>
    );
  const HEAD = ['Client', 'Stock', 'Position', 'Last', 'Day', 'Intraday', 'Stories', 'Lead headline'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="bg-sunken/60">
          <tr>
            {HEAD.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={
                  'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted ' +
                  ([3, 4, 6].includes(i) ? 'text-right' : 'text-left')
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.label} className="divide-y divide-line">
            <tr className="bg-sunken/30">
              <th
                scope="rowgroup"
                colSpan={HEAD.length}
                className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-navy"
              >
                {g.label}
              </th>
            </tr>
            {g.rows.map(({ h, s, n, top }) => (
              <tr key={h.id} className="hover:bg-sunken/40">
                <td className="px-3 py-2">
                  <p className="font-semibold">{h.client}</p>
                  <p className="text-[11px] text-muted">{h.account}</p>
                </td>
                <td className="mono px-3 font-bold">{h.symbol}</td>
                <td className="px-3">
                  <Direction d={h.direction} />
                </td>
                <td className="num px-3 text-right">
                  {s ? s.last.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </td>
                <td className={'num px-3 text-right font-semibold ' + tone(s?.changePct)}>
                  {pct(s?.changePct ?? null)}
                </td>
                <td className="px-3">{s ? <Sparkline points={s.points} previousClose={s.previousClose} /> : null}</td>
                <td className="num px-3 text-right">{n.length}</td>
                <td className="max-w-[320px] px-3 py-2">
                  <StoryLink story={top ?? n[0]}>
                    <span className="line-clamp-2 text-[12px] leading-snug">
                      {(top ?? n[0])?.title ?? <span className="text-muted">No direct story</span>}
                    </span>
                  </StoryLink>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      {movers.length ? (
        <p className="border-t border-line px-3 py-2 text-[10px] text-muted">
          Prices: {movers[0].source} · as of{' '}
          {stamp(
            movers
              .map((m) => m.at)
              .sort()
              .at(-1)!,
          )}{' '}
          · Stock moves in percent versus prior close.
        </p>
      ) : null}
    </div>
  );
}
export function ReportContent({ report, filters, market }: { report: Report; filters: Filters; market?: MarketPanel }) {
  const stories = filterStories(report, filters),
    byId = new Map(report.articles.map((a) => [a.id, a]));
  const newsCheck = report.sources.find((s) => s.key === 'news'),
    filtered = Boolean(filters.q || filters.topic || filters.symbol);
  const desk = report.desk,
    top = briefSelection(stories);
  const keyEvents = desk?.keyEvents?.length
    ? desk.keyEvents
    : top.slice(0, 6).map((a) => ({ text: a.title + ' — ' + a.publisher, storyIds: [a.id] }));
  return (
    <article className="space-y-6" id="report-content" data-report-id={report.id}>
      <header className="overflow-hidden rounded-xl border border-navy bg-navy text-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="serif text-[22px] font-semibold leading-tight tracking-[-0.01em] sm:text-[26px]">
                Sales &amp; Trading Morning Brief
              </h1>
              <p className="text-[12px] text-white/70">
                {report.clientName} · prepared for {report.salesperson}
              </p>
            </div>
          </div>
          <div className="text-right text-[12px] text-white/80">
            <p className="font-semibold text-white">{displayDay(report.businessDate)}</p>
            <p>Data cutoff {stamp(report.cutoff)}</p>
          </div>
        </div>
      </header>
      <section
        id="today-news"
        aria-label={report.archived ? 'Key events' : 'Key events today'}
        className="rounded-xl border border-line border-l-4 border-l-brand bg-surface px-5 py-4 shadow-card"
      >
        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-navy">
          {report.archived ? 'Key events' : 'Key events today'}
        </h2>
        {keyEvents.length ? (
          <ul className="mt-2.5 space-y-2">
            {keyEvents.map((e, i) => {
              const [label, ...rest] = e.text.split(/:\s([\s\S]+)/);
              const hasLabel = rest.length && label.length < 32;
              return (
                <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-ink">
                  <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-navy" />
                  <StoryLink story={byId.get(e.storyIds[0])}>
                    {hasLabel ? (
                      <>
                        <strong className="font-semibold">{label}:</strong> <Figures text={rest[0]} />
                      </>
                    ) : (
                      <Figures text={e.text} />
                    )}
                  </StoryLink>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            {newsCheck && !newsCheck.ok
              ? 'The news update did not complete. Refresh to try again; this does not mean markets are quiet.'
              : 'No qualifying events have been verified yet for this session.'}
          </p>
        )}
        {desk ? (
          <p className="mt-3 text-[10px] text-muted">
            {desk.method === 'model'
              ? 'Written by the desk model from the linked evidence; every figure is substituted from sourced market data.'
              : 'Compiled from the top-ranked verified headlines.'}{' '}
            Updated {stamp(desk.generatedAt)}.
          </p>
        ) : null}
      </section>
      <section id="market-snapshot" aria-label="Markets snapshot">
        <Strip metrics={report.metrics} />
        <p className="mt-1.5 text-[10px] text-muted">
          Index and yield moves in basis points versus the prior close; commodities and crypto in percent. Hover a cell
          for source and observation time.
        </p>
      </section>
      <Section id="market-detail" title="Market data &amp; sources">
        <Card>
          <CardBody className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
            {report.metrics.map((m) => {
              const change = metricChange(m);
              return (
                <div key={m.key} className="rounded-lg border border-line/60 bg-sunken/40 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[11px] font-medium text-ink-2">{m.label}</p>
                    {change ? (
                      <span className={'num text-[11px] font-semibold ' + tone(change.value)}>{change.label}</span>
                    ) : null}
                  </div>
                  <p className="num mt-0.5 text-[17px] font-semibold">{formatMetric(m)}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
                    {m.note}
                    {m.observedAt ? ' · ' + stamp(m.observedAt) : ''}
                    {m.url ? (
                      <>
                        {' '}
                        ·{' '}
                        <a className="underline" target="_blank" rel="noopener noreferrer" href={m.url}>
                          {m.source?.startsWith('Yahoo') ? 'Yahoo Finance' : m.source}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </Section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">
        <div className="space-y-6">
          <Section id="market-wrap" title="Market wrap">
            {desk?.wrap?.length ? (
              <div className="space-y-3.5">
                {desk.wrap.map((p, i) => (
                  <p
                    key={i}
                    className={
                      'serif text-[16px] leading-[1.7] text-ink ' + (i === 0 ? 'first-line:font-semibold' : '')
                    }
                  >
                    <Figures text={p} />
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                {report.archived
                  ? 'No market wrap was saved for this day.'
                  : 'The market wrap is prepared after the first source refresh of the session.'}
              </p>
            )}
          </Section>
          {desk?.sections?.length
            ? desk.sections.map((s) => (
                <Section key={s.title} title={s.title}>
                  <p className="serif text-[15px] leading-[1.7] text-ink-2">
                    <Figures text={s.text} />
                  </p>
                  {s.storyIds.length ? (
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px]">
                      {s.storyIds
                        .map((id) => byId.get(id))
                        .filter((x): x is Story => !!x)
                        .slice(0, 3)
                        .map((a) => (
                          <StoryLink key={a.id} story={a}>
                            <span className="text-brand underline decoration-brand/30 underline-offset-2">
                              {a.publisher}
                            </span>
                          </StoryLink>
                        ))}
                    </p>
                  ) : null}
                </Section>
              ))
            : null}
        </div>
        <aside className="space-y-6">
          {market?.overnight.length ? (
            market.overnight.map((s) => (
              <Section
                key={s.symbol}
                title={'Overnight · ' + s.label}
                right={<span className={'num text-[12px] font-bold ' + tone(s.changePct)}>{pct(s.changePct)}</span>}
              >
                <IntradayChart points={s.points} previousClose={s.previousClose} label={s.label} />
                <p className="mt-1 text-[10px] text-muted">
                  {s.source} · last {stamp(s.at)} ·{' '}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                    data
                  </a>
                </p>
              </Section>
            ))
          ) : (
            <Section title="Overnight futures">
              <p className="text-xs text-muted">
                {report.archived
                  ? 'No futures chart was saved for this day.'
                  : 'Futures chart data is unavailable right now. No values are estimated.'}
              </p>
            </Section>
          )}
          <Section title={'Economic data (ET)' + (market?.calendar?.scope === 'week' ? ' · this week' : '')}>
            {market?.calendar?.events.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1 text-left font-semibold">Time</th>
                    <th className="py-1 text-left font-semibold">Release</th>
                    <th className="py-1 text-right font-semibold">Est.</th>
                    <th className="py-1 text-right font-semibold">Prior</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {market.calendar.events.map((e, i) => (
                    <tr key={i}>
                      <td className="num whitespace-nowrap py-1.5 pr-2 text-ink-2">
                        {market.calendar!.scope === 'week'
                          ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(
                              new Date(e.time),
                            ) + ' '
                          : ''}
                        {time(e.time)}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span
                          className={
                            'mr-1.5 inline-block h-1.5 w-1.5 rounded-full ' +
                            (e.impact === 'High' ? 'bg-down' : e.impact === 'Medium' ? 'bg-amber' : 'bg-line-strong')
                          }
                        />
                        <span className="mono mr-1 text-[10px] text-muted">{e.country}</span>
                        {e.title}
                      </td>
                      <td className="num py-1.5 text-right">{e.forecast || '—'}</td>
                      <td className="num py-1.5 text-right text-muted">{e.previous || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-muted">
                {market?.calendar
                  ? 'No economic releases were scheduled for this day, and no major US releases remained that week.'
                  : report.archived
                    ? 'No economic calendar was saved for this day.'
                    : 'The economic calendar source is unavailable. No releases are assumed.'}
              </p>
            )}
            {market?.calendar ? (
              <p className="mt-1.5 text-[10px] text-muted">
                {market.calendar.source} · retrieved {stamp(market.calendar.fetchedAt)}
              </p>
            ) : null}
          </Section>
        </aside>
      </div>
      {market ? (
        <Section
          id="client-book"
          title="Your book today"
          right={
            <span className="text-[11px] text-muted">
              Top 5 gainers and top 5 decliners of {report.holdings.length} positions
            </span>
          }
        >
          <Card className="overflow-hidden">
            <BookMovers report={report} movers={market.movers} stories={stories} />
          </Card>
        </Section>
      ) : null}
      <Section
        id="coverage-news"
        title="Headlines since the close"
        right={
          <span className="text-[11px] text-muted">
            {top.length} of {stories.length} developments{filtered ? ' · filtered' : ''}
          </span>
        }
      >
        {!top.length ? (
          <Card>
            <EmptyState
              title={
                filtered
                  ? 'No stories match these filters'
                  : newsCheck && !newsCheck.ok
                    ? 'News sources are currently unavailable'
                    : 'No qualifying stories yet'
              }
              body={
                filtered
                  ? 'Clear the filters to see the full brief.'
                  : 'Only source-checked reporting since the prior US close is shown. An empty feed is not a signal that markets are quiet.'
              }
            />
          </Card>
        ) : (
          <NewsFeed stories={top} />
        )}
      </Section>
      <footer className="border-t border-line pb-16 pt-3 text-[10px] leading-relaxed text-muted">
        <p>
          {report.salesperson} · {report.clientName} · Brief {report.id.slice(0, 8)} · Prepared {stamp(report.cutoff)}
        </p>
        <p className="mt-1">
          For internal sales use. News connections indicate possible relevance; they do not establish the cause or
          direction of a price move. Not investment advice. Drafts are reviewed and sent by a person.
        </p>
      </footer>
    </article>
  );
}
