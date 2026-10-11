export const BUSINESS_TZ = 'America/New_York';
export function businessDate(at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
export function sameDay(at: string, day: string): boolean {
  const d = new Date(at);
  return Number.isFinite(d.getTime()) && businessDate(d) === day;
}
export function stamp(at: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(at));
}
export function displayDay(day: string): string {
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
/** US index futures do not trade from Friday 17:00 ET until Sunday 18:00 ET, so no intraday chart exists then. */
export function futuresClosed(at = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at);
  const day = parts.find((x) => x.type === 'weekday')?.value,
    hour = Number(parts.find((x) => x.type === 'hour')?.value);
  return day === 'Sat' || (day === 'Fri' && hour >= 17) || (day === 'Sun' && hour < 18);
}
/** Offset of New York from UTC at a given instant, e.g. "-04:00". */
export function etOffset(at: Date): string {
  const p =
    new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((x) => x.type === 'timeZoneName')?.value ?? 'GMT-5';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(p);
  return m ? m[1] + m[2].padStart(2, '0') + ':' + (m[3] ?? '00') : '-05:00';
}
/** The previous US cash-equity close (16:00 ET on the prior weekday): the start of "since the close". */
export function sinceClose(now = new Date()): number {
  const today = businessDate(now);
  let d = new Date(today + 'T12:00:00Z');
  do {
    d = new Date(d.getTime() - 86400000);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  const day = d.toISOString().slice(0, 10);
  return Date.parse(day + 'T16:00:00' + etOffset(new Date(day + 'T16:00:00Z')));
}
