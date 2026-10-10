'use client';
import * as React from 'react';
import { Fact, type FactView } from '@/components/ui/fact';
import { cn } from '@/lib/cn';
import { chartGeometry, nearestIndex, shortMD, stampDate, type ChartPoint } from './lib';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  });
const W = 1000,
  H = 300;

/**
 * Last ten sessions plus the current level (spec 3.2), drawn by hand. Positions come from the stored closes; every
 * printed figure is a fact (header, axis labels, hover readout), so each one carries its source and time.
 */
export function SpxChart({
  points,
  facts,
  nowKey,
  chgKey,
  hiKey,
  loKey,
  tone,
  title,
}: {
  points: ChartPoint[];
  facts: Record<string, FactView>;
  nowKey: string;
  chgKey: string;
  hiKey: string;
  loKey: string;
  tone: 'up' | 'down' | 'flat';
  title: string;
}) {
  const g = React.useMemo(() => chartGeometry(points, W, H, { left: 0, right: 0, top: 22, bottom: 22 }), [points]);
  const [hover, setHover] = React.useState<number | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const id = React.useId().replace(/:/g, '');
  const last = points.length - 1;
  const active = hover ?? last;
  const pct = (x: number) => `${(x / W) * 100}%`;
  const pctY = (y: number) => `${(y / H) * 100}%`;
  const hi = facts[hiKey],
    lo = facts[loKey];
  const ptFact = (i: number): FactView | undefined => facts[points[i].key];
  const toneText = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-muted';
  const hiIdx = points.reduce((b, p, i) => (p.v > points[b].v ? i : b), 0);
  const loIdx = points.reduce((b, p, i) => (p.v < points[b].v ? i : b), 0);

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setHover(nearestIndex(g.xs, ((e.clientX - r.left) / r.width) * W));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover((h) => Math.max(0, (h ?? last) - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHover((h) => Math.min(last, (h ?? last) + 1));
    } else if (e.key === 'Escape') setHover(null);
  };
  const flip = g.xs[active] / W > 0.62;
  const af = ptFact(active);

  return (
    <figure className="rounded-[10px] border border-paper-line bg-white/55 px-4 pb-3 pt-4 sm:px-5" aria-label={title}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="mono text-[22px] font-medium tracking-[-0.01em] text-ink">
            <Fact f={facts[nowKey]} />
          </span>
          <span className={cn('mono text-[12.5px]', toneText)}>
            <Fact f={facts[chgKey]} /> today
          </span>
        </p>
        <p className="mono text-[11.5px] text-muted">
          10-session range: {lo ? <Fact f={lo} /> : '—'} – {hi ? <Fact f={hi} /> : '—'}
        </p>
      </figcaption>

      <div className="mt-3 flex gap-2">
        {/* y axis: only the two printed levels are figures, so only those are labelled */}
        <div className="relative w-[52px] shrink-0 sm:w-[60px]" aria-hidden>
          {hi ? (
            <span
              className="mono absolute right-0 -translate-y-1/2 text-[10.5px] text-subtle"
              style={{ top: pctY(g.yOf(points[hiIdx].v)) }}
            >
              {hi.display}
            </span>
          ) : null}
          {lo ? (
            <span
              className="mono absolute right-0 -translate-y-1/2 text-[10.5px] text-subtle"
              style={{ top: pctY(g.yOf(points[loIdx].v)) }}
            >
              {lo.display}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div
            ref={ref}
            tabIndex={0}
            role="group"
            aria-label={`${title}: ${points.length} points. Use the left and right arrow keys to read each close.`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            className="relative h-[190px] cursor-crosshair rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-brand/50 sm:h-[230px]"
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden
            >
              <defs>
                <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[points[hiIdx].v, points[loIdx].v].map((v, i) => (
                <line
                  key={i}
                  x1={0}
                  x2={W}
                  y1={g.yOf(v)}
                  y2={g.yOf(v)}
                  stroke="var(--color-paper-line)"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path d={g.area} fill={`url(#g${id})`} />
              <path
                d={g.line}
                fill="none"
                stroke="var(--color-gold)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {hover !== null ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-gold/30"
                style={{ left: pct(g.xs[active]) }}
              />
            ) : null}
            {/* the current level is always marked; the hovered session is marked as well */}
            <span
              aria-hidden
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-gold"
              style={{ left: pct(g.xs[last]), top: pctY(g.ys[last]) }}
            />
            {hover !== null && hover !== last ? (
              <span
                aria-hidden
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-gold/80"
                style={{ left: pct(g.xs[hover]), top: pctY(g.ys[hover]) }}
              />
            ) : null}

            {hover !== null && af ? (
              <div
                role="status"
                className={cn(
                  'pointer-events-none absolute z-10 w-[210px] rounded-lg border border-line bg-surface p-2.5 text-left shadow-[var(--shadow-pop)]',
                  flip ? '-translate-x-[calc(100%+10px)]' : 'translate-x-[10px]',
                )}
                style={{ left: pct(g.xs[active]), top: `clamp(0px, ${pctY(g.ys[active])}, 62%)` }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                  {stampDate(points[active].d)}
                </p>
                <p className="num text-[15px] font-semibold text-ink">{af.display}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">{af.source}</p>
                <p className="num text-[11.5px] text-muted">As of {when(af.asOf)}</p>
              </div>
            ) : null}
          </div>

          <div className="relative mt-1.5 h-4" aria-hidden>
            {points.map((p, i) => (
              <span
                key={p.d}
                className={cn(
                  'mono absolute -translate-x-1/2 text-[10.5px] text-subtle',
                  i % 2 === last % 2 ? '' : 'max-sm:hidden',
                  i === active && hover !== null && 'text-ink',
                )}
                style={{ left: pct(g.xs[i]) }}
              >
                {shortMD(p.d)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Session</th>
            <th>Close</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.d}>
              <td>{stampDate(p.d)}</td>
              <td>{facts[p.key]?.display ?? 'not available'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
