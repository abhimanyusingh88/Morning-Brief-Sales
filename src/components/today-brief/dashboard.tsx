import * as React from 'react';
import { GeneratorBadge } from '@/components/brief/sections';
import type { Tile } from '@/components/brief/snapshot';
import { SpxChart } from '@/components/brief/spx-chart';
import { F, Tpl, toneOfDisplay, type Facts } from '@/components/brief/tpl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import type { SectionRow } from '@/lib/data/brief';
import { barWidths, groupBy, groupTiles, magnitude, scopeOf } from './lib';

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- stored jsonb, narrowed per section below
type Tone = 'up' | 'down' | 'flat' | 'none';
const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

const CHIP: Record<Tone, string> = {
  up: 'bg-up-50 text-up',
  down: 'bg-down-50 text-down',
  flat: 'bg-sunken text-muted',
  none: 'bg-sunken text-muted',
};
const ARROW: Record<Tone, string> = { up: '▲', down: '▼', flat: '', none: '' };
const etHM = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

/** ------------------------------------------------------------------ hero */
export function Hero({
  first,
  dateLabel,
  stamp,
  coverage,
  oneLine,
  facts,
}: {
  first: string;
  dateLabel: string;
  stamp: string;
  coverage: React.ReactNode;
  oneLine?: string;
  facts: Facts;
}) {
  return (
    <header className="relative rounded-xl border border-slate-800 bg-slate-900 px-6 py-6 text-white shadow-sm sm:px-8 sm:py-7 [&_.fact]:border-slate-500/70! [&_.fact]:text-slate-100! [&_.fact:hover]:bg-slate-800! [&_.fact:hover]:text-white!">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Pre-open brief
            </span>
            <span className="font-mono text-slate-300">{dateLabel}</span>
            <span className="text-slate-600">•</span>
            <span className="font-mono text-slate-400">{stamp}</span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Good morning, {first}.</h1>
          <p className="mt-1.5 text-sm text-slate-300 leading-relaxed">{coverage}</p>
        </div>

        {oneLine ? (
          <div className="mt-2 rounded-lg border border-slate-800 border-l-4 border-l-blue-500 bg-slate-950/70 p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>The Open in One Line</span>
            </div>
            <p className="mt-1.5 text-sm sm:text-[15px] font-medium leading-relaxed text-slate-100">
              <Tpl t={oneLine} facts={facts} />
            </p>
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** ------------------------------------------------------------------ card frame */
export function DashCard({
  s,
  children,
  right,
}: {
  s: SectionRow;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const id = `tb-${s.kind}`;
  const personal = scopeOf(s.kind) === 'personal';
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-[12px] border border-line bg-surface p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.01em] text-ink">
          <span aria-hidden className="h-4 w-1 rounded-full bg-brand" />
          {s.title}
        </h2>
        <span className="flex items-center gap-2">
          {s.status === 'ok' ? right : null}
          <Badge tone={personal ? 'brand' : 'neutral'} className="uppercase tracking-[0.06em] text-[10px]">
            {personal ? 'For you' : 'Market-wide'}
          </Badge>
        </span>
      </div>
      {s.status === 'unavailable' ? (
        <p className="flex items-center gap-2 rounded-[10px] border border-dashed border-amber/40 bg-amber-50/60 px-3 py-3 text-[13px] text-muted">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-amber" />
          {s.note ?? 'Data temporarily unavailable — this section is held back rather than showing stale data.'}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn('mono mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-subtle', className)}>
    {children}
  </p>
);
const Ticker = ({ t }: { t: string }) => (
  <span className="mono shrink-0 rounded bg-navy/[0.06] px-1.5 py-0.5 text-[10.5px] font-medium text-navy">{t}</span>
);

/** ------------------------------------------------------------------ snapshot */
export function SnapshotCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const groups = groupTiles(arr<Tile>((s.data as Data).tiles));
  return (
    <DashCard s={s}>
      <div className="divide-y divide-line">
        {groups.map((g) => (
          <div
            key={g.title}
            className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[150px_minmax(0,1fr)] md:items-center"
          >
            <Label className="mb-0">{g.title}</Label>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {g.tiles.map((t) => (
                <li key={t.symbol} className="min-w-0 rounded-[10px] bg-sunken/70 px-3 py-2.5">
                  <p className="truncate text-xs text-muted">{(t.labelKey && facts[t.labelKey]?.display) || t.label}</p>
                  <p className="num mt-0.5 text-[18px] font-semibold leading-tight text-ink">
                    <F k={t.level} facts={facts} />
                  </p>
                  <span
                    className={cn(
                      'num mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                      CHIP[t.tone],
                    )}
                  >
                    {ARROW[t.tone] ? (
                      <span aria-hidden className="text-[8px]">
                        {ARROW[t.tone]}
                      </span>
                    ) : null}
                    <F k={t.sub} facts={facts} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </DashCard>
  );
}

/** ------------------------------------------------------------------ chart */
function ChartCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const d = s.data as Data;
  const points = arr<{ d: string; key: string; v: number }>(d.points);
  return (
    <DashCard s={s}>
      {points.length >= 2 ? (
        <SpxChart
          points={points}
          facts={facts}
          nowKey={d.nowKey}
          chgKey={d.chgKey}
          hiKey={d.hiKey}
          loKey={d.loKey}
          tone={d.tone ?? 'flat'}
          title={s.title}
        />
      ) : (
        <p className="text-[13px] text-muted">Not enough sessions to draw the chart yet.</p>
      )}
    </DashCard>
  );
}

/** ------------------------------------------------------------------ catalysts */
function CatalystsCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const paras = arr<{ body: string; generator?: string }>((s.data as Data).paragraphs);
  const bodies = paras.length ? paras.map((p) => p.body) : s.template.split(/\n{2,}/).filter(Boolean);
  return (
    <DashCard s={s} right={<GeneratorBadge generator={s.generator} paragraphs={paras} />}>
      <div className="space-y-3 text-[14.5px] leading-[1.7] text-ink">
        {bodies.map((b, i) => (
          <p key={i}>
            <Tpl t={b} facts={facts} />
          </p>
        ))}
      </div>
    </DashCard>
  );
}

/** ------------------------------------------------------------------ news */
function NewsCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const items = arr<{ titleKey: string; why: string }>((s.data as Data).items);
  return (
    <DashCard s={s}>
      <ul className="-mx-2 space-y-0.5">
        {items.map((it) => {
          const f = facts[it.titleKey];
          return (
            <li
              key={it.titleKey}
              className="grid grid-cols-[60px_minmax(0,1fr)] gap-3 rounded-lg px-2 py-2 hover:bg-sunken/60"
            >
              <span className="num pt-0.5 text-xs text-subtle">{f ? etHM(f.asOf) : '—'}</span>
              <div className="min-w-0">
                <p className="text-[14px] leading-snug text-ink">
                  <F k={it.titleKey} facts={facts} />
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {f ? <span>{f.source}</span> : null}
                  <Badge tone={it.why === 'market-wide' ? 'neutral' : 'brand'} className="font-medium">
                    {it.why}
                  </Badge>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </DashCard>
  );
}

/** ------------------------------------------------------------------ earnings */
function EarningsCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const items = arr<{
    dayKey: string;
    nameKey: string;
    symbol?: string;
    timing: string;
    noteTemplate: string;
    heldBy?: number;
  }>((s.data as Data).items);
  const days = groupBy(items, (it) => facts[it.dayKey]?.display ?? '—');
  return (
    <DashCard s={s}>
      <div className="space-y-4">
        {days.map((d) => (
          <div key={d.key} className="flex gap-3">
            <span className="mono h-fit w-11 shrink-0 rounded-md bg-navy py-1 text-center text-[10.5px] font-semibold uppercase text-white">
              {d.key}
            </span>
            <ul className="min-w-0 flex-1 space-y-2.5">
              {d.items.map((it) => (
                <li key={it.dayKey} className="text-[14px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {it.symbol ? <Ticker t={it.symbol} /> : null}
                    <b className="font-medium text-ink">
                      <F k={it.nameKey} facts={facts} />
                    </b>
                    <Badge tone="outline" className="font-medium">
                      {it.timing === 'before the open' ? 'Before open' : 'After close'}
                    </Badge>
                  </div>
                  <p className={cn('mt-1 text-[13px]', it.heldBy ? 'text-brand-600' : 'text-muted')}>
                    ↳ <Tpl t={it.noteTemplate} facts={facts} />
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </DashCard>
  );
}

/** ------------------------------------------------------------------ macro and Fed */
function MacroCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const d = s.data as Data;
  const rel = arr<{ titleKey: string; timeKey: string; estKey: string | null; priorKey: string | null }>(d.releases);
  const fed = arr<{ label: string; template: string }>(d.fed);
  return (
    <DashCard s={s}>
      {rel.length ? (
        <div className="overflow-hidden rounded-[10px] border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-sunken/70 text-left">
              <tr className="mono text-[10.5px] uppercase tracking-[0.06em] text-subtle">
                <th scope="col" className="px-3 py-2 font-medium">
                  ET
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Release
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Est.
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Prior
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rel.map((r) => (
                <tr key={r.titleKey}>
                  <td className="num whitespace-nowrap px-3 py-2 text-xs text-brand-600">
                    <F k={r.timeKey} facts={facts} />
                  </td>
                  <td className="px-3 py-2 text-ink">
                    <F k={r.titleKey} facts={facts} />
                  </td>
                  <td className="num px-3 py-2 text-right text-xs">
                    {r.estKey ? <F k={r.estKey} facts={facts} /> : '—'}
                  </td>
                  <td className="num px-3 py-2 text-right text-xs text-muted">
                    {r.priorKey ? <F k={r.priorKey} facts={facts} /> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {fed.length ? (
        <>
          <Label className={rel.length ? 'mt-4' : ''}>Fed watch</Label>
          <ul className="space-y-1.5">
            {fed.map((f, i) => (
              <li key={i} className="flex items-start gap-3 text-[13.5px] text-ink">
                <span className="num mt-0.5 w-20 shrink-0 text-xs text-muted">{f.label}</span>
                <span>
                  <Tpl t={f.template} facts={facts} />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </DashCard>
  );
}

/** ------------------------------------------------------------------ sector leaders and laggards, as diverging bars */
function SectorCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const d = s.data as Data;
  const rows = [
    ...arr<{ sector: string; key: string }>(d.leaders),
    ...arr<{ sector: string; key: string }>(d.laggards),
  ];
  const vals = rows.map((r) => magnitude(facts[r.key]?.display));
  const widths = barWidths(vals);
  return (
    <DashCard s={s}>
      <ul className="space-y-2">
        {rows.map((r, i) => {
          const v = vals[i],
            w = `${widths[i]}%`;
          const tone = toneOfDisplay(facts[r.key]?.display);
          return (
            <li
              key={r.key}
              className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_4rem] items-center gap-3 text-[13px]"
            >
              <span className="leading-tight text-ink">{r.sector}</span>
              <span aria-hidden className="grid grid-cols-2">
                <span className="flex justify-end border-r border-line-strong pr-px">
                  {v < 0 ? <span className="h-3 rounded-l bg-down/80" style={{ width: w }} /> : null}
                </span>
                <span className="flex pl-px">
                  {v > 0 ? <span className="h-3 rounded-r bg-up/80" style={{ width: w }} /> : null}
                </span>
              </span>
              <span
                className={cn(
                  'num text-right text-xs',
                  tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-muted',
                )}
              >
                <F k={r.key} facts={facts} />
              </span>
            </li>
          );
        })}
      </ul>
    </DashCard>
  );
}

/** ------------------------------------------------------------------ movers in your sectors */
function MoverList({
  title,
  rows,
  facts,
}: {
  title: string;
  rows: { symbol: string; nameKey: string; chgKey: string }[];
  facts: Facts;
}) {
  return (
    <div>
      <Label>{title}</Label>
      {rows.length === 0 ? <p className="py-1 text-[13px] text-subtle">None today</p> : null}
      <ul className="space-y-1.5">
        {rows.map((m) => (
          <li
            key={m.symbol}
            className="flex items-center justify-between gap-3 rounded-lg bg-sunken/60 px-2.5 py-2 text-[13px]"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Ticker t={m.symbol} />
              <span className="truncate text-ink">
                <F k={m.nameKey} facts={facts} />
              </span>
            </span>
            <span
              className={cn(
                'num shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold',
                CHIP[toneOfDisplay(facts[m.chgKey]?.display)],
              )}
            >
              <F k={m.chgKey} facts={facts} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoversCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const d = s.data as Data;
  type M = { symbol: string; nameKey: string; chgKey: string };
  const sectors = arr<string>(d.sectors);
  return (
    <DashCard s={s}>
      {sectors.length ? <p className="-mt-2 mb-3 text-xs text-subtle">{sectors.join(' · ')}</p> : null}
      <div className="space-y-4">
        <MoverList title="Gaining" rows={arr<M>(d.leaders)} facts={facts} />
        <MoverList title="Falling" rows={arr<M>(d.laggards)} facts={facts} />
      </div>
    </DashCard>
  );
}

/** ------------------------------------------------------------------ overnight in your products */
function OvernightCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const rows = arr<{ label: string; labelKey?: string; level: string | null; move: string }>((s.data as Data).rows);
  return (
    <DashCard s={s}>
      <table className="w-full text-[13px]">
        <thead className="sr-only">
          <tr>
            <th scope="col">Instrument</th>
            <th scope="col">Level</th>
            <th scope="col">Move</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.move}>
              <td className="py-2 pr-3 text-ink">{(r.labelKey && facts[r.labelKey]?.display) || r.label}</td>
              <td className="num py-2 text-right text-ink-2">{r.level ? <F k={r.level} facts={facts} /> : null}</td>
              <td className="py-2 pl-3 text-right">
                <span
                  className={cn(
                    'num inline-block rounded-md px-1.5 py-0.5 text-xs font-medium',
                    CHIP[toneOfDisplay(facts[r.move]?.display)],
                  )}
                >
                  <F k={r.move} facts={facts} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DashCard>
  );
}

/** ------------------------------------------------------------------ dividends */
function DividendsCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const items = arr<{ nameKey: string; amountKey: string; priorKey: string; change: 'up' | 'down' | 'unchanged' }>(
    (s.data as Data).items,
  );
  return (
    <DashCard s={s}>
      <ul className="divide-y divide-line">
        {items.map((d) => (
          <li key={d.amountKey} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
            <span className="min-w-0 truncate text-ink">
              <F k={d.nameKey} facts={facts} />
            </span>
            <span className="shrink-0 text-right">
              <span className="num font-semibold text-ink">
                <F k={d.amountKey} facts={facts} />
              </span>
              <span className="block text-[11px] text-muted">
                Quarterly ·{' '}
                {d.change === 'unchanged' ? (
                  'Unchanged'
                ) : (
                  <>
                    {d.change === 'up' ? 'Raised' : 'Cut'} from <F k={d.priorKey} facts={facts} />
                  </>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

/** ------------------------------------------------------------------ index rebalance */
function RebalanceCard({ s, facts }: { s: SectionRow; facts: Facts }) {
  const items = arr<{ titleKey: string; note: string }>((s.data as Data).items);
  return (
    <DashCard s={s}>
      <ul className="space-y-3">
        {items.map((r) => (
          <li key={r.titleKey} className="text-[13px] leading-relaxed">
            <p className="font-medium text-ink">
              <F k={r.titleKey} facts={facts} />
            </p>
            <p className="text-ink-2">{r.note}</p>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

/** Routes a stored section to its dashboard card. Unknown kinds are skipped rather than guessed at. */
export function DashSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  switch (s.kind) {
    case 'chart':
      return <ChartCard s={s} facts={facts} />;
    case 'catalysts':
      return <CatalystsCard s={s} facts={facts} />;
    case 'news':
      return <NewsCard s={s} facts={facts} />;
    case 'earnings':
      return <EarningsCard s={s} facts={facts} />;
    case 'macro_fed':
      return <MacroCard s={s} facts={facts} />;
    case 'sector_lead_lag':
      return <SectorCard s={s} facts={facts} />;
    case 'movers':
      return <MoversCard s={s} facts={facts} />;
    case 'overnight':
      return <OvernightCard s={s} facts={facts} />;
    case 'dividends':
      return <DividendsCard s={s} facts={facts} />;
    case 'index_rebalance':
      return <RebalanceCard s={s} facts={facts} />;
    default:
      return null;
  }
}
