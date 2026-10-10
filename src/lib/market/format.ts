import type { MoveUnit } from './types';

const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

/** Equity/FX/commodity moves are percent; yields and spreads are basis points; VIX is points. */
export function formatMove(unit: MoveUnit, chg: number): string {
  const a = Math.abs(chg);
  if (unit === 'bp') return `${sign(chg)}${a.toFixed(a >= 10 ? 1 : 1)} bp`;
  if (unit === 'pct') return `${sign(chg)}${a.toFixed(2)}%`;
  return `${sign(chg)}${a.toFixed(2)} pts`;
}

export function formatLevel(assetClass: string, last: number, decimals: number): string {
  if (assetClass === 'rates') return `${last.toFixed(3)}%`;
  if (assetClass === 'credit') return `${last.toFixed(1)} bp`;
  return last.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}bn`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e8 ? 0 : 1)}mm`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
