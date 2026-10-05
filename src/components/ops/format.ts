/** Time and number formatting for the operations pages. Everything is shown in New York time, as the firm's morning runs on ET. */
const TZ = "America/New_York";

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", ...opts });
const HM = fmt({ hour: "2-digit", minute: "2-digit" });
const HMS = fmt({ hour: "2-digit", minute: "2-digit", second: "2-digit" });
const DAY = fmt({ weekday: "short" });
const DATE = fmt({ weekday: "short", month: "short", day: "numeric" });
const YMD = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

export const etHM = (iso: string) => HM.format(new Date(iso));
export const etHMS = (iso: string) => HMS.format(new Date(iso));
export const etDate = (iso: string) => DATE.format(new Date(iso));
/** "06:30:01" on the business date, "Fri 16:00:00" on any other day, so a prior-session record is never mistaken for this morning's. */
export const etOnDate = (iso: string, businessDate: string) => (YMD.format(new Date(iso)) === businessDate ? HMS.format(new Date(iso)) : `${DAY.format(new Date(iso))} ${HMS.format(new Date(iso))}`);

export const n0 = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const bytes = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
