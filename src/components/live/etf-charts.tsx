'use client';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Check, Copy } from 'lucide-react';

// Client copies of the formatters (the ETF module fetches issuer files, so it stays on the server).
const money = (v: number, signed = true) => {
  const a = Math.abs(v),
    s = signed ? (a < 0.5e6 ? '' : v > 0 ? '+' : '−') : '';
  if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + '$' + Math.round(a / 1e6) + 'M';
  if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + 'K';
  return '$0';
};
const day = (d: string, long = false) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString(
    'en-US',
    long
      ? { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
      : { month: 'short', day: 'numeric', timeZone: 'UTC' },
  );

export type DailyShift = { date: string; semis: number; ndx: number; spx: number };
const SERIES = [
  { key: 'semis', label: 'Semiconductors', color: '#7c3aed' },
  { key: 'ndx', label: 'Nasdaq-100', color: '#1f6feb' },
  { key: 'spx', label: 'S&P 500', color: '#0e9f8e' },
] as const;

/**
 * Net target-exposure shift per session and group: bars above zero moved toward long, below toward short. Hover a
 * session to read every group's figure; the session total is shown too.
 */
export function ShiftChart({ rows }: { rows: DailyShift[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (rows.length < 2)
    return (
      <p className="py-10 text-center text-sm text-muted">The chart starts once two issuer sessions are stored.</p>
    );
  const W = 760,
    H = 260,
    padL = 8,
    padR = 70,
    padT = 14,
    padB = 28;
  const vals = rows.flatMap((r) => [r.semis, r.ndx, r.spx]).concat(0);
  const hi = Math.max(...vals),
    lo = Math.min(...vals);
  const span = hi - lo || 1;
  const top = hi + span * 0.1,
    bottom = lo - span * 0.1;
  const y = (v: number) => padT + ((top - v) / (top - bottom)) * (H - padT - padB);
  const slot = (W - padL - padR) / rows.length;
  const bw = Math.min(16, (slot - 10) / 3);
  const ticks = Array.from({ length: 5 }, (_, i) => bottom + ((top - bottom) * (i + 0.5)) / 5);
  const h = hover == null ? null : rows[hover];
  const tipLeft = hover == null ? 0 : ((padL + slot * (hover + 0.5)) / W) * 100;
  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Net leveraged ETF exposure shift by session and group"
          className="h-auto w-full select-none"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={0.07} />
              <text x={W - padR + 8} y={y(v) + 4} fontSize={11} fill="currentColor" fillOpacity={0.6} className="num">
                {money(v)}
              </text>
            </g>
          ))}
          <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.4} />
          {rows.map((r, i) => {
            const x0 = padL + slot * i + (slot - bw * 3 - 4) / 2;
            return (
              <g key={r.date} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
                <rect
                  x={padL + slot * i}
                  y={padT}
                  width={slot}
                  height={H - padT - padB}
                  fill="currentColor"
                  fillOpacity={hover === i ? 0.05 : 0}
                />
                {SERIES.map((s, k) => {
                  const v = r[s.key];
                  return (
                    <rect
                      key={s.key}
                      x={x0 + k * (bw + 2)}
                      y={Math.min(y(v), y(0))}
                      width={bw}
                      height={Math.max(Math.abs(y(v) - y(0)), v ? 1.5 : 0)}
                      rx={2}
                      fill={s.color}
                      fillOpacity={hover == null || hover === i ? 0.95 : 0.4}
                    />
                  );
                })}
                <text
                  x={padL + slot * (i + 0.5)}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  fillOpacity={hover === i ? 1 : 0.6}
                  fontWeight={hover === i ? 600 : 400}
                >
                  {day(r.date)}
                </text>
              </g>
            );
          })}
          <text x={padL + 4} y={padT + 10} fontSize={10.5} fill="var(--color-up)" fontWeight={600}>
            ▲ toward long
          </text>
          <text x={padL + 4} y={H - padB - 6} fontSize={10.5} fill="var(--color-down)" fontWeight={600}>
            ▼ toward short
          </text>
        </svg>
        {h ? (
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 min-w-[210px] rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-card"
            style={tipLeft > 55 ? { right: 100 - tipLeft + 3 + '%' } : { left: tipLeft + 3 + '%' }}
          >
            <p className="mb-1.5 font-semibold text-ink">{day(h.date, true)} — net shift</p>
            <ul className="space-y-1">
              {SERIES.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span className="flex-1 text-ink-2">{s.label}</span>
                  <span
                    className={cn(
                      'num font-semibold',
                      h[s.key] > 0 ? 'text-up' : h[s.key] < 0 ? 'text-down' : 'text-ink',
                    )}
                  >
                    {money(h[s.key])}
                  </span>
                </li>
              ))}
              <li className="mt-1 flex items-center gap-2 border-t border-line pt-1">
                <span className="flex-1 font-semibold text-ink">Total</span>
                {(() => {
                  const t = h.semis + h.ndx + h.spx;
                  return (
                    <span className={cn('num font-semibold', t > 0 ? 'text-up' : t < 0 ? 'text-down' : 'text-ink')}>
                      {money(t)}
                    </span>
                  );
                })()}
              </li>
            </ul>
          </div>
        ) : null}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
        <li className="text-muted">Hover a session for exact figures.</li>
      </ul>
    </div>
  );
}

/** Copies the note as plain text in the desk's chat format. Falls back to a hidden textarea where the async
 * clipboard API is blocked (for example on plain http). */
export function CopyNote({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const t = document.createElement('textarea');
        t.value = text;
        t.style.position = 'fixed';
        t.style.opacity = '0';
        document.body.appendChild(t);
        t.select();
        const ok = document.execCommand('copy');
        t.remove();
        if (!ok) throw new Error('copy');
      }
      setState('done');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2200);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        state === 'done'
          ? 'bg-[#3ddc97] text-navy'
          : state === 'failed'
            ? 'bg-down text-white'
            : 'bg-white text-navy hover:bg-white/90',
      )}
      aria-live="polite"
    >
      {state === 'done' ? <Check size={14} /> : <Copy size={14} />}
      {state === 'done' ? 'Copied — paste into chat' : state === 'failed' ? 'Copy blocked' : 'Copy note'}
    </button>
  );
}
