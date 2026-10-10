import { formatLevel, formatMove } from './market/format';

export const fmtMove = formatMove;
export const fmtLevel = formatLevel;

export const SEGMENT_LABEL: Record<string, string> = {
  hedge_fund: 'Hedge fund',
  asset_manager: 'Asset manager',
  pension: 'Pension',
  insurer: 'Insurer',
  bank: 'Bank',
  corporate: 'Corporate',
};

export const fmtDate = (
  d: string,
  opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' },
) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

export const fmtTimeET = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  });

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
