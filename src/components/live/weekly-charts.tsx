'use client';
import { useState } from 'react';
import { cn } from '@/lib/cn';

// Client-side copies of the weekly formatters: the weekly module also fetches prices, so it stays server-only.
const pct = (v: number, digits = 2) => {
  const r = Number(v.toFixed(digits));
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(digits) + '%';
};
const usd = (v: number) => {
  const a = Math.abs(v),
    s = Math.round(a) === 0 ? '' : v > 0 ? '+' : '−';
  if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(1) + 'K';
  return s + '$' + a.toFixed(0);
};
const shortDay = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const longDay = (d: string) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
const tone = (v: number) => (v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-ink');

export type ChartLine = { label: string; path: { pct: number }[] };
const LINE_COLORS = ['#1f6feb', 'var(--color-up)', 'var(--color-down)'];

/**
 * Cumulative percent move through the week, session by session. Hovering (or tapping) anywhere snaps to the
 * nearest session close: a guide line, enlarged points and a tooltip with every line's value and its day change.
 */
export function WeekLines({ dates, lines }: { dates: string[]; lines: ChartLine[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720,
    H = 240,
    padL = 8,
    padR = 64,
    padT = 12,
    padB = 26;
  const vals = lines.flatMap((l) => l.path.map((p) => p.pct)).concat(0);
  let lo = Math.min(...vals),
    hi = Math.max(...vals);
  const span = hi - lo || 1;
  lo -= span * 0.1;
  hi += span * 0.1;
  const x = (i: number) => padL + (i / Math.max(dates.length - 1, 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 5);
  const peak = (l: ChartLine) => l.path.reduce((b, p, i) => (Math.abs(p.pct) > Math.abs(l.path[b].pct) ? i : b), 0);
  const pick = (clientX: number, rect: DOMRect) => {
    const sx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((sx - padL) / (W - padL - padR)) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  };
  const tipLeft = hover == null ? 0 : (x(hover) / W) * 100;
  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Cumulative weekly move by session"
          className="h-auto w-full touch-none select-none"
          onMouseMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
          onTouchStart={(e) => pick(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchMove={(e) => pick(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.07} />
              <text x={W - padR + 8} y={y(v) + 4} fontSize={11} fill="currentColor" fillOpacity={0.6} className="num">
                {pct(v, 1)}
              </text>
            </g>
          ))}
          <line
            x1={padL}
            x2={W - padR}
            y1={y(0)}
            y2={y(0)}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="3 4"
          />
          {dates.map((d, i) => (
            <text
              key={d}
              x={x(i)}
              y={H - 6}
              fontSize={11}
              fill="currentColor"
              fillOpacity={hover === i ? 1 : 0.6}
              fontWeight={hover === i ? 600 : 400}
              textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}
            >
              {shortDay(d)}
            </text>
          ))}
          {hover != null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padT}
              y2={H - padB}
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeDasharray="2 3"
            />
          ) : null}
          {lines.map((l, k) => {
            const pk = peak(l);
            return (
              <g key={l.label}>
                <path
                  d={l.path.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.pct).toFixed(1)).join(' ')}
                  fill="none"
                  stroke={LINE_COLORS[k]}
                  strokeWidth={k === 0 ? 2.4 : 1.6}
                  strokeLinejoin="round"
                />
                {l.path.map((p, i) => (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(p.pct)}
                    r={hover === i ? 5 : k === 0 ? 3 : 2.2}
                    fill={hover === i ? 'var(--color-surface, #fff)' : LINE_COLORS[k]}
                    stroke={LINE_COLORS[k]}
                    strokeWidth={hover === i ? 2.4 : 0}
                  />
                ))}
                {/* The line's largest move of the week stays labelled, so the peak reads without hovering. */}
                {hover == null && l.path.length > 1 && pk > 0 ? (
                  <text
                    x={x(pk)}
                    y={y(l.path[pk].pct) + (l.path[pk].pct >= 0 ? -9 : 16)}
                    textAnchor={pk === l.path.length - 1 ? 'end' : 'middle'}
                    fontSize={10.5}
                    fontWeight={600}
                    fill={LINE_COLORS[k]}
                    className="num"
                  >
                    {pct(l.path[pk].pct)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {hover != null ? (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 min-w-[190px] rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-card"
            style={tipLeft > 55 ? { right: 100 - tipLeft + 2 + '%' } : { left: tipLeft + 2 + '%' }}
          >
            <p className="mb-1.5 font-semibold text-ink">
              {longDay(dates[hover])} close{hover === 0 ? ' (start)' : ''}
            </p>
            <ul className="space-y-1">
              {lines.map((l, k) => {
                const v = l.path[hover].pct,
                  day = hover ? v - l.path[hover - 1].pct : null;
                return (
                  <li key={l.label} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: LINE_COLORS[k] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-ink-2">{l.label}</span>
                    <span className={cn('num font-semibold', tone(v))}>{pct(v)}</span>
                    {day != null ? (
                      <span className={cn('num w-14 text-right text-[11px]', tone(day))}>{pct(day)} d</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        {lines.map((l, k) => (
          <li key={l.label} className="flex items-center gap-2">
            <span className="inline-block h-[3px] w-4 rounded" style={{ background: LINE_COLORS[k] }} />
            <span className="text-ink-2">{l.label}</span>
            <span className={cn('num font-semibold', tone(l.path.at(-1)!.pct))}>{pct(l.path.at(-1)!.pct)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-muted">Hover over the chart to see each session close.</p>
    </div>
  );
}

export type BarClient = { clientId: string; name: string; pct: number; pnl: number; exposure: number };
/** Diverging bars: each client's five-session move. Hovering a row shows its P&L and exposure. */
export function ClientBars({ clients }: { clients: BarClient[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720,
    row = 30,
    labelW = 210,
    valueW = 78,
    H = clients.length * row + 8;
  const max = Math.max(...clients.map((c) => Math.abs(c.pct)), 0.01);
  const plot = W - labelW - valueW;
  const zero = labelW + plot / 2;
  const scale = (v: number) => (v / max) * (plot / 2 - 4);
  const h = hover == null ? null : clients[hover];
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Weekly move by client, in percent"
        className="h-auto w-full select-none"
        onMouseLeave={() => setHover(null)}
      >
        <line x1={zero} x2={zero} y1={0} y2={H} stroke="currentColor" strokeOpacity={0.2} />
        {clients.map((c, i) => {
          const y = i * row + 4,
            w = scale(c.pct);
          return (
            <g key={c.clientId} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={0} y={y} width={W} height={row} fill="currentColor" fillOpacity={hover === i ? 0.05 : 0} />
              <text x={labelW - 10} y={y + row / 2 + 4} textAnchor="end" fontSize={12} fill="currentColor">
                {c.name.length > 28 ? c.name.slice(0, 27) + '…' : c.name}
              </text>
              <rect
                x={w >= 0 ? zero : zero + w}
                y={y + 6}
                width={Math.max(Math.abs(w), 1.5)}
                height={row - 12}
                rx={3}
                fill={c.pct >= 0 ? 'var(--color-up)' : 'var(--color-down)'}
                fillOpacity={hover == null || hover === i ? 1 : 0.45}
              />
              <text
                x={W - 4}
                y={y + row / 2 + 4}
                textAnchor="end"
                fontSize={12}
                fontWeight={600}
                className="num"
                fill={c.pct > 0 ? 'var(--color-up)' : c.pct < 0 ? 'var(--color-down)' : 'currentColor'}
              >
                {pct(c.pct)}
              </text>
            </g>
          );
        })}
      </svg>
      {h ? (
        <div
          role="status"
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-card"
          style={{
            top: (((hover! + 1) * row + 8) / H) * 100 + '%',
            left: (labelW / W) * 100 + '%',
          }}
        >
          <p className="font-semibold text-ink">{h.name}</p>
          <p className="mt-1 text-muted">
            Week <span className={cn('num font-semibold', tone(h.pct))}>{pct(h.pct)}</span> · P&amp;L{' '}
            <span className={cn('num font-semibold', tone(h.pnl))}>{usd(h.pnl)}</span> · exposure{' '}
            <span className="num text-ink-2">{usd(h.exposure).replace(/^[+−]/, '')}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
