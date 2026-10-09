export const BUSINESS_TZ = 'America/New_York';
export function businessDate(at = new Date()): string { return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
export function sameDay(at: string, day: string): boolean { const d = new Date(at); return Number.isFinite(d.getTime()) && businessDate(d) === day; }
export function stamp(at: string): string { return new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(at)); }
export function displayDay(day: string): string { return new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}); }
