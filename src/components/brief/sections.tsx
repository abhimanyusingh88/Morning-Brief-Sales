import * as React from 'react';
import { cn } from '@/lib/cn';
import type { SectionRow } from '@/lib/data/brief';
import { joinAnd } from './lib';
import { SnapshotGrid, type Tile } from './snapshot';
import { SpxChart } from './spx-chart';
import { F, TONE_TEXT, Tpl, toneOfDisplay, type Facts } from './tpl';

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- stored jsonb, narrowed per section below
const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

/** Section frame: a 13px heading, an optional right-hand badge, an optional hairline. Unavailable sections stop after the heading. */
export function Section({
  s,
  rule = true,
  right,
  sub,
  children,
}: {
  s: Pick<SectionRow, 'kind' | 'title' | 'status' | 'note'>;
  rule?: boolean;
  right?: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const id = `sec-${s.kind}`;
  return (
    <section aria-labelledby={id} className="mt-9 first:mt-0">
      <div className={cn('flex items-baseline justify-between gap-3', rule && 'border-b border-paper-line pb-2')}>
        <div className="min-w-0">
          <h2 id={id} className="text-[13px] font-semibold tracking-[-0.005em] text-ink">
            {s.title}
          </h2>
          {sub && s.status === 'ok' ? <p className="mt-0.5 text-[11.5px] text-muted">{sub}</p> : null}
        </div>
        {s.status === 'ok' ? right : null}
      </div>
      {s.status === 'unavailable' ? (
        <p className="mt-2.5 text-[13px] italic text-muted">{s.note ?? 'Data temporarily unavailable.'}</p>
      ) : (
        children
      )}
    </section>
  );
}

const Rows = ({ children }: { children: React.ReactNode }) => (
  <ul className="divide-y divide-paper-line text-[13.5px] leading-[1.55] text-ink">{children}</ul>
);

/** ------------------------------------------------------------------ 3.1 snapshot */
export function SnapshotSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const tiles = arr<Tile>((s.data as Data).tiles);
  return (
    <Section s={s} rule={false}>
      {tiles.length ? (
        <div className="mt-3">
          <SnapshotGrid tiles={tiles} facts={facts} />
        </div>
      ) : null}
    </Section>
  );
}

/** ------------------------------------------------------------------ 3.2 chart */
export function ChartSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const d = s.data as Data;
  const points = arr<{ d: string; key: string; v: number }>(d.points);
  return (
    <Section s={s} rule={false}>
      {points.length >= 2 ? (
        <div className="mt-3">
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
        </div>
      ) : null}
    </Section>
  );
}

/** ------------------------------------------------------------------ 3.3 catalysts */
const GENERATOR = {
  llm: {
    label: 'AI-written, validated',
    hint: "Written by a model from the day's facts; every figure was inserted by code and the text passed validation.",
  },
  hybrid: {
    label: 'Partly AI-written, validated',
    hint: 'Some paragraphs were written by a model and validated; the rest are rule-based.',
  },
  template: {
    label: 'Rule-based',
    hint: "Assembled from fixed templates and the day's facts. No model wrote this text.",
  },
} as const;

export function GeneratorBadge({
  generator,
  paragraphs,
}: {
  generator: string;
  paragraphs?: { generator?: string }[];
}) {
  const g = GENERATOR[generator as keyof typeof GENERATOR] ?? GENERATOR.template;
  const n = paragraphs?.filter((p) => p.generator === 'llm').length;
  return (
    <span
      title={
        n != null && paragraphs?.length ? `${g.hint} (${n} of ${paragraphs.length} paragraphs AI-written)` : g.hint
      }
      className="mono shrink-0 rounded-full border border-paper-line px-2 py-0.5 text-[10.5px] text-muted"
    >
      {g.label}
    </span>
  );
}

export function CatalystsSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const d = s.data as Data;
  const paras = arr<{ body: string; generator?: string }>(d.paragraphs);
  const bodies = paras.length ? paras.map((p) => p.body) : s.template.split(/\n{2,}/).filter(Boolean);
  return (
    <Section s={s} rule={false} right={<GeneratorBadge generator={s.generator} paragraphs={paras} />}>
      <div className="mt-3 space-y-3.5 text-[14.5px] leading-[1.7] text-ink">
        {bodies.map((b, i) => (
          <p key={i}>
            <Tpl t={b} facts={facts} />
          </p>
        ))}
      </div>
    </Section>
  );
}

/** The "Today in one line" callout (catalysts data.oneLine). */
export function OneLine({ s, facts }: { s: SectionRow | undefined; facts: Facts }) {
  const line = s && s.status === 'ok' ? ((s.data as Data).oneLine as string | undefined) : undefined;
  if (!line) return null;
  return (
    <div className="rounded-[8px] border border-callout bg-callout px-4 py-3">
      <p className="mono text-[10.5px] uppercase tracking-[0.06em] text-gold">Today in one line</p>
      <p className="mt-1 text-[15px] leading-[1.55] text-ink">
        <Tpl t={line} facts={facts} />
      </p>
    </div>
  );
}

/** ------------------------------------------------------------------ overnight in your products */
export function OvernightSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const rows = arr<{
    label: string;
    labelKey?: string;
    level: string | null;
    move: string;
    tone: 'up' | 'down' | 'flat';
  }>((s.data as Data).rows);
  return (
    <Section s={s} sub="Sector indices and instruments for the sectors and products you follow">
      <table className="mt-1 w-full text-[13px]">
        <thead className="sr-only">
          <tr>
            <th scope="col">Instrument</th>
            <th scope="col">Level</th>
            <th scope="col">Move</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-line">
          {rows.map((r) => (
            <tr key={r.move}>
              <td className="py-2.5 pr-3 text-ink">{(r.labelKey && facts[r.labelKey]?.display) || r.label}</td>
              <td className="num w-[28%] py-2.5 text-right text-ink-2">
                {r.level ? <F k={r.level} facts={facts} /> : null}
              </td>
              <td
                className={cn('num w-[24%] py-2.5 pl-3 text-right', TONE_TEXT[toneOfDisplay(facts[r.move]?.display)])}
              >
                <F k={r.move} facts={facts} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

/** ------------------------------------------------------------------ 3.4 sector leaders and laggards */
function Lead({
  title,
  tone,
  rows,
  facts,
}: {
  title: string;
  tone: 'up' | 'down';
  rows: { label: string; k: string; sub?: string }[];
  facts: Facts;
}) {
  return (
    <div>
      <p
        className={cn(
          'mono mb-1 mt-3 text-[10.5px] uppercase tracking-[0.08em]',
          tone === 'up' ? 'text-up' : 'text-down',
        )}
      >
        {title}
      </p>
      <ul className="divide-y divide-paper-line text-[13.5px]">
        {rows.map((r) => (
          <li key={r.k} className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="min-w-0 truncate text-ink">
              {r.label}
              {r.sub ? <span className="mono ml-1.5 text-[10.5px] text-subtle">{r.sub}</span> : null}
            </span>
            <span className={cn('num shrink-0 text-right', TONE_TEXT[toneOfDisplay(facts[r.k]?.display)])}>
              <F k={r.k} facts={facts} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
export const LeadLag = Lead;

export function SectorSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const d = s.data as Data;
  const l = arr<{ sector: string; key: string }>(d.leaders),
    g = arr<{ sector: string; key: string }>(d.laggards);
  return (
    <Section s={s}>
      <div className="grid gap-x-10 sm:grid-cols-2">
        <Lead title="Leaders" tone="up" rows={l.map((x) => ({ label: x.sector, k: x.key }))} facts={facts} />
        <Lead title="Laggards" tone="down" rows={g.map((x) => ({ label: x.sector, k: x.key }))} facts={facts} />
      </div>
    </Section>
  );
}

/** ------------------------------------------------------------------ 3.5 movers in your sectors */
export function MoversSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const d = s.data as Data;
  const mk = (x: { symbol: string; nameKey: string; chgKey: string }) => ({
    label: facts[x.nameKey]?.display ?? x.symbol,
    sub: x.symbol,
    k: x.chgKey,
  });
  const l = arr<{ symbol: string; nameKey: string; chgKey: string }>(d.leaders).map(mk),
    g = arr<{ symbol: string; nameKey: string; chgKey: string }>(d.laggards).map(mk);
  const sectors = arr<string>(d.sectors);
  return (
    <Section s={s} sub={sectors.length ? joinAnd(sectors) : undefined}>
      <div className="grid gap-x-10 sm:grid-cols-2">
        <Lead title="Leaders" tone="up" rows={l} facts={facts} />
        <Lead title="Laggards" tone="down" rows={g} facts={facts} />
      </div>
    </Section>
  );
}

/** ------------------------------------------------------------------ 3.6 earnings this week */
export function EarningsSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const items = arr<{ dayKey: string; nameKey: string; timing: string; noteTemplate: string }>((s.data as Data).items);
  return (
    <Section s={s}>
      <Rows>
        {items.map((it) => (
          <li key={it.dayKey} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 py-3">
            <span className="mono pt-[3px] text-[11px] uppercase text-gold">
              <F k={it.dayKey} facts={facts} />
            </span>
            <span>
              <Tpl t={`{{${it.nameKey}}} reports ${it.timing} — ${it.noteTemplate}.`} facts={facts} />
            </span>
          </li>
        ))}
      </Rows>
    </Section>
  );
}

/** ------------------------------------------------------------------ 3.7 breaking news */
export function NewsSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const items = arr<{ titleKey: string; why: string }>((s.data as Data).items);
  return (
    <Section s={s}>
      <Rows>
        {items.map((it) => {
          const f = facts[it.titleKey];
          return (
            <li key={it.titleKey} className="py-3">
              <p>
                <F k={it.titleKey} facts={facts} />
                <span className="text-muted"> — {it.why}</span>
              </p>
              {f ? (
                <p className="mono mt-0.5 text-[10.5px] text-subtle">
                  {f.source} ·{' '}
                  {new Date(f.asOf).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: 'America/New_York',
                  })}{' '}
                  ET
                </p>
              ) : null}
            </li>
          );
        })}
      </Rows>
    </Section>
  );
}

/** ------------------------------------------------------------------ 3.8 macro and Fed calendar */
export function MacroSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const d = s.data as Data;
  const rel = arr<{ titleKey: string; timeKey: string; estKey: string | null; priorKey: string | null }>(d.releases);
  const fed = arr<{ label: string; template: string }>(d.fed);
  return (
    <Section s={s}>
      {rel.length ? (
        <Rows>
          {rel.map((r) => (
            <li key={r.titleKey} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-3">
              <span className="mono pt-[3px] text-[11px] text-gold">
                <F k={r.timeKey} facts={facts} />
              </span>
              <span>
                <F k={r.titleKey} facts={facts} />
                {r.estKey ? (
                  <span className="text-muted">
                    {' '}
                    (est. <F k={r.estKey} facts={facts} />
                    {r.priorKey ? (
                      <>
                        , prior <F k={r.priorKey} facts={facts} />
                      </>
                    ) : null}
                    )
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </Rows>
      ) : null}
      {fed.length ? (
        <div className={rel.length ? 'mt-5' : 'mt-3'}>
          <h3 className="text-[11.5px] font-medium text-muted">Fed calendar</h3>
          <ul className="mt-1 divide-y divide-paper-line text-[13.5px] text-ink">
            {fed.map((f, i) => (
              <li key={i} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 py-2.5">
                <span className="mono pt-[3px] text-[11px] text-muted">{f.label}</span>
                <span>
                  <Tpl t={f.template} facts={facts} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}

/** ------------------------------------------------------------------ 3.9 dividends and 3.10 index rebalance: one line per item */
export function LinesSection({ s, facts }: { s: SectionRow; facts: Facts }) {
  const lines = s.template.split('\n').filter(Boolean);
  return (
    <Section s={s}>
      <Rows>
        {lines.map((l, i) => (
          <li key={i} className="py-3">
            <Tpl t={l} facts={facts} />
          </li>
        ))}
      </Rows>
    </Section>
  );
}

/** Routes a stored section to its renderer. Unknown kinds are skipped rather than guessed at. */
export function SectionView({ s, facts }: { s: SectionRow; facts: Facts }) {
  switch (s.kind) {
    case 'snapshot':
      return <SnapshotSection s={s} facts={facts} />;
    case 'chart':
      return <ChartSection s={s} facts={facts} />;
    case 'catalysts':
      return <CatalystsSection s={s} facts={facts} />;
    case 'overnight':
      return <OvernightSection s={s} facts={facts} />;
    case 'sector_lead_lag':
      return <SectorSection s={s} facts={facts} />;
    case 'movers':
      return <MoversSection s={s} facts={facts} />;
    case 'earnings':
      return <EarningsSection s={s} facts={facts} />;
    case 'news':
      return <NewsSection s={s} facts={facts} />;
    case 'macro_fed':
      return <MacroSection s={s} facts={facts} />;
    case 'dividends':
    case 'index_rebalance':
      return <LinesSection s={s} facts={facts} />;
    default:
      return null;
  }
}

export const SPEC_KINDS = [
  'snapshot',
  'chart',
  'catalysts',
  'overnight',
  'sector_lead_lag',
  'movers',
  'earnings',
  'news',
  'macro_fed',
  'dividends',
  'index_rebalance',
];
export const CALL_LIST_KINDS = ['book', 'flow', 'risks'];
