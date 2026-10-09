import * as React from "react";

type Point = { t: number; v: number };
const fmtTime = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(t));
const fmtNum = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Intraday line chart with prior-close reference, right-hand price axis and ET time axis. Dark terminal styling. */
export function IntradayChart({ points, previousClose, height = 220, label }: { points: Point[]; previousClose: number | null; height?: number; label: string }) {
  if (points.length < 2) return <div className="flex h-[160px] items-center justify-center rounded-lg bg-navy text-xs text-white/60">No intraday prints yet</div>;
  const W = 640, H = height, padR = 58, padB = 22, padT = 10;
  const vals = points.map((p) => p.v).concat(previousClose ? [previousClose] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || hi * 0.001; lo -= span * 0.08; hi += span * 0.08;
  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * (W - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const last = points[points.length - 1].v;
  const up = previousClose == null || last >= previousClose;
  const stroke = up ? "#3ddc97" : "#ff6b6b";
  const path = points.map((p, i) => (i ? "L" : "M") + x(p.t).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ");
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 5);
  const times = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label + " intraday chart"} className="h-auto w-full rounded-lg bg-[#0b1520]">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={0} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#ffffff" strokeOpacity={0.06} />
          <text x={W - padR + 6} y={y(v) + 3} fontSize={10} fill="#9fb3c8" className="num">{fmtNum(v)}</text>
        </g>
      ))}
      {times.map((t, i) => (
        <text key={t} x={i === 0 ? 4 : i === 4 ? W - padR - 4 : x(t)} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} y={H - 6} fontSize={10} fill="#9fb3c8">{fmtTime(t)}</text>
      ))}
      {previousClose ? (
        <g>
          <line x1={0} x2={W - padR} y1={y(previousClose)} y2={y(previousClose)} stroke="#e8a33d" strokeDasharray="3 4" strokeOpacity={0.8} />
          <text x={4} y={y(previousClose) - 4} fontSize={9} fill="#e8a33d">Prior close {fmtNum(previousClose)}</text>
        </g>
      ) : null}
      <path d={path + ` L${x(t1).toFixed(1)} ${H - padB} L0 ${H - padB} Z`} fill={stroke} fillOpacity={0.08} />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
      <rect x={W - padR + 1} y={y(last) - 8} width={padR - 2} height={16} rx={2} fill={stroke} />
      <text x={W - padR + 6} y={y(last) + 4} fontSize={10} fontWeight={600} fill="#0b1520" className="num">{fmtNum(last)}</text>
    </svg>
  );
}

/** Compact trend line for tables. Colour follows the move versus the prior close. */
export function Sparkline({ points, previousClose, width = 96, height = 26 }: { points: Point[]; previousClose: number | null; width?: number; height?: number }) {
  if (points.length < 2) return <span className="text-[11px] text-muted">—</span>;
  const vals = points.map((p) => p.v);
  const lo = Math.min(...vals, previousClose ?? Infinity), hi = Math.max(...vals, previousClose ?? -Infinity);
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => 2 + (1 - (v - lo) / (hi - lo || 1)) * (height - 4);
  const up = previousClose == null || vals[vals.length - 1] >= previousClose;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {previousClose ? <line x1={0} x2={width} y1={y(previousClose)} y2={y(previousClose)} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 3" /> : null}
      <path d={points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ")} fill="none" stroke={up ? "var(--color-up)" : "var(--color-down)"} strokeWidth={1.4} />
    </svg>
  );
}
