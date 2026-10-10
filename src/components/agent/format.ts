const ET = 'America/New_York';

export const timeET = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ET });
export const asOfLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ET,
    timeZoneName: 'short',
  });
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(d);
const dayNum = (d: Date) => Date.parse(dayKey(d)) / 86_400_000;

export type Group = 'Today' | 'Yesterday' | 'This week' | 'Earlier';
export const GROUPS: Group[] = ['Today', 'Yesterday', 'This week', 'Earlier'];

/** Calendar-day grouping in the desk's time zone. */
export function groupOf(iso: string, now = new Date()): Group {
  const diff = dayNum(now) - dayNum(new Date(iso));
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This week' : 'Earlier';
}

/** Compact label for a list row: time today, weekday this week, otherwise the date. */
export function whenShort(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const g = groupOf(iso, now);
  if (g === 'Today') return timeET(iso);
  if (g === 'Yesterday') return 'Yesterday';
  if (g === 'This week') return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: ET });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: ET });
}
