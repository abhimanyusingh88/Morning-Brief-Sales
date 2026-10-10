/** New York wall-clock helpers. The firm's day runs on ET, including across the daylight-saving change. */
const TZ = 'America/New_York';

/** UTC offset of New York at a given instant, in minutes (EDT = -240, EST = -300). */
function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).formatToParts(at);
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5';
  const m = /GMT([+-])(\d+)(?::(\d+))?/.exec(name);
  if (!m) return -300;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** The instant at which the New York clock reads hh:mm(:ss) on the given calendar date (YYYY-MM-DD). */
export function etInstant(date: string, hh: number, mm = 0, ss = 0): Date {
  const guess = new Date(
    `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}Z`,
  );
  const off = offsetMinutes(new Date(guess.getTime() + 5 * 3600_000)); // offset at roughly that moment
  return new Date(guess.getTime() - off * 60_000);
}

export const etClock = (d: Date | string) =>
  new Date(d).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: TZ,
  });

export const etHM = (d: Date | string) =>
  new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false, timeZone: TZ });

/** Next weekday after a date (YYYY-MM-DD). */
export function nextBusinessDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export function prevBusinessDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** Monday..Friday of the week containing the date. */
export function weekOf(date: string): string[] {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() - dow + i);
    return x.toISOString().slice(0, 10);
  });
}

export const weekdayShort = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
