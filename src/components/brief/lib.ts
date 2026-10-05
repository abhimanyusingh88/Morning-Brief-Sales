/** Pure helpers for the brief and setup screens (no React, no I/O) so they can be tested on their own. */
import type { FactView } from "@/components/ui/fact";
import { FEED_BY_KEY } from "@/lib/feeds/registry";
import { INCLUDE_TOGGLES, PRODUCT_GROUPS, SPEC_SECTORS, type BriefPrefs, type SpecSector } from "@/lib/brief/spec";
import { MINUS } from "./format";

export const TOKEN = /\{\{([A-Za-z0-9_.:\-]+)\}\}/g;

/** "6:12 AM ET": the firm runs on New York time, so the zone is always written as ET. */
export const etTime = (iso: string) => `${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;

/** "Oct 5, 4:00 AM ET" */
export const etStamp = (iso: string) => `${new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;

export const stampDate = (businessDate: string) =>
  new Date(`${businessDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export const longDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** "9/21" from an ISO date. */
export const shortMD = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** "A", "A and B", "A, B and C" */
export const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Product names read mid-sentence: lower-case the first letter unless it starts an acronym ("FX", "SPACs"). */
export const midSentence = (p: string) => (/^[A-Z]{2}/.test(p) ? p : p.charAt(0).toLowerCase() + p.slice(1));

/** Every fact key a section points at: tokens in its template, tokens in its data strings, and bare key strings in its data. */
export function sectionKeys(section: { template: string; data: Record<string, unknown> }, facts: Record<string, FactView>): string[] {
  const out = new Set<string>();
  const scan = (s: string) => {
    for (const m of s.matchAll(TOKEN)) out.add(m[1]);
    if (facts[s]) out.add(s);
  };
  const walk = (v: unknown) => {
    if (typeof v === "string") scan(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  scan(section.template);
  walk(section.data);
  return [...out].filter((k) => facts[k]);
}

export interface FeedGroup { feedKey: string; feedName: string; rows: FactView[] }

/** Figures (not names) grouped by the feed they came from, in feed-registry order, for the audit table. */
export function groupByFeed(keys: string[], facts: Record<string, FactView>): FeedGroup[] {
  const order = [...FEED_BY_KEY.keys()];
  const groups = new Map<string, FactView[]>();
  for (const k of new Set(keys)) {
    const f = facts[k];
    if (!f || f.unit === "text") continue;
    const g = f.feedKey ?? "unknown";
    groups.set(g, [...(groups.get(g) ?? []), f]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)))
    .map(([feedKey, rows]) => ({ feedKey, feedName: FEED_BY_KEY.get(feedKey)?.name ?? "Unattributed", rows }));
}

/** ------------------------------------------------------------------ chart geometry */
export interface ChartPoint { d: string; key: string; v: number }
export interface ChartGeometry {
  w: number; h: number; left: number; right: number; top: number; bottom: number;
  xs: number[]; ys: number[]; line: string; area: string; yOf: (v: number) => number; min: number; max: number;
}

/** Plot geometry for the last-N-sessions chart. Values are used for position only; every printed figure is a fact. */
export function chartGeometry(points: ChartPoint[], w = 760, h = 260, pad = { left: 56, right: 18, top: 18, bottom: 30 }): ChartGeometry {
  const vals = points.map((p) => p.v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const min = lo - span * 0.12, max = hi + span * 0.12;
  const iw = w - pad.left - pad.right, ih = h - pad.top - pad.bottom;
  const xs = points.map((_, i) => pad.left + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw));
  const yOf = (v: number) => pad.top + (1 - (v - min) / (max - min)) * ih;
  const ys = vals.map(yOf);
  const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const base = pad.top + ih;
  const area = `${line} L${xs[xs.length - 1].toFixed(1)},${base} L${xs[0].toFixed(1)},${base} Z`;
  return { w, h, left: pad.left, right: pad.right, top: pad.top, bottom: pad.bottom, xs, ys, line, area, yOf, min, max };
}

/** Index of the point nearest an x position (in chart units). */
export const nearestIndex = (xs: number[], x: number) => xs.reduce((best, cx, i) => (Math.abs(cx - x) < Math.abs(xs[best] - x) ? i : best), 0);

/** ------------------------------------------------------------------ stock leaders and laggards (setup preview)
 * Mirrors the rule the pipeline applies in build.ts: equities in the chosen sectors, three best movers up and three down. */
export interface StockRow { symbol: string; name: string; sector: string; chg: number; asOf: string; source: string }
export function pickStocks<T extends { sector: string; chg: number }>(universe: T[], sectors: readonly string[]): { leaders: T[]; laggards: T[] } {
  const mine = universe.filter((r) => sectors.includes(r.sector));
  const sorted = [...mine].sort((a, b) => b.chg - a.chg);
  return { leaders: sorted.filter((r) => r.chg > 0).slice(0, 3), laggards: sorted.filter((r) => r.chg < 0).slice(-3).reverse() };
}

/** ------------------------------------------------------------------ pending change summary */
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const DELIVERY_LABEL = { dashboard: "Dashboard only", email: "Email digest", both: "Dashboard and email" } as const;

/** A short, plain list of what a saved-but-not-yet-active setup changes. Empty when nothing differs. */
export function diffPrefs(current: BriefPrefs, next: BriefPrefs): string[] {
  const out: string[] = [];
  const add = (label: string, before: readonly string[], after: readonly string[]) => {
    const plus = after.filter((x) => !before.includes(x)), minus = before.filter((x) => !after.includes(x));
    if (plus.length) out.push(`${label}: add ${joinAnd(plus)}`);
    if (minus.length) out.push(`${label}: remove ${joinAnd(minus)}`);
  };
  add("Sectors", current.sectors, next.sectors);
  add("Products", current.products, next.products);
  for (const t of INCLUDE_TOGGLES) {
    if (current.include[t.key] !== next.include[t.key]) out.push(`${t.label}: turn ${next.include[t.key] ? "on" : "off"}`);
  }
  if (current.delivery !== next.delivery) out.push(`Delivery: ${DELIVERY_LABEL[next.delivery]}`);
  if (current.sendTime !== next.sendTime) out.push(`Send time: ${clock12(next.sendTime)} ET`);
  return out;
}

export const prefsEqual = (a: Pick<BriefPrefs, "sectors" | "products" | "include" | "delivery" | "sendTime">, b: Pick<BriefPrefs, "sectors" | "products" | "include" | "delivery" | "sendTime">) =>
  sameSet(a.sectors, b.sectors) && sameSet(a.products, b.products) && INCLUDE_TOGGLES.every((t) => a.include[t.key] === b.include[t.key]) && a.delivery === b.delivery && a.sendTime === b.sendTime;

/** "06:30" to "6:30 AM" */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Order the user's chosen items the way the setup screen lists them. */
export const inSpecOrder = (sectors: readonly string[]): SpecSector[] => SPEC_SECTORS.filter((s) => sectors.includes(s));
export const inProductOrder = (products: readonly string[]): string[] => PRODUCT_GROUPS.flatMap((g) => g.options).filter((p) => products.includes(p));

/** Signed percent for the setup preview, formatted by code like the pipeline does. */
export const fmtPct1 = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${Math.abs(n).toFixed(1)}%`;
};
