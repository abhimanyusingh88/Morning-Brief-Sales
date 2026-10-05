/** Pure helpers for the Today's brief dashboard (no React, no I/O) so they can be tested on their own. */

/** Dashboard columns: reading on the left, data on the right. Kinds not listed (or not in the brief) are skipped. */
export const LEFT_KINDS = ["catalysts", "news", "earnings", "macro_fed"] as const;
export const RIGHT_KINDS = ["chart", "sector_lead_lag", "movers", "overnight", "dividends", "index_rebalance"] as const;

/** Sections filtered to the reader's sectors and products are "For you"; the rest are the same for every reader. */
const PERSONAL = new Set(["overnight", "movers", "earnings", "news", "dividends", "index_rebalance"]);
export const scopeOf = (kind: string): "personal" | "market" => (PERSONAL.has(kind) ? "personal" : "market");

/** Benchmark tiles grouped the way a desk reads them. Symbols match the TILES list in src/lib/brief/build.ts. */
export const SNAPSHOT_GROUPS = [
  { title: "Equities", symbols: ["SPX", "NDX", "RTY", "DJI"] },
  { title: "Rates & credit", symbols: ["UST10Y", "UST2Y", "CDXHY"] },
  { title: "Risk & commodities", symbols: ["VIX", "XAU", "XAG", "WTI"] },
] as const;

/** Tiles in group order. Tiles the groups do not name land in a trailing "Other" group so nothing is dropped. */
export function groupTiles<T extends { symbol: string }>(tiles: T[]): { title: string; tiles: T[] }[] {
  const named = new Set<string>(SNAPSHOT_GROUPS.flatMap((g) => g.symbols));
  const out = SNAPSHOT_GROUPS.map((g) => ({ title: g.title as string, tiles: g.symbols.flatMap((s) => tiles.filter((t) => t.symbol === s)) }));
  const rest = tiles.filter((t) => !named.has(t.symbol));
  if (rest.length) out.push({ title: "Other", tiles: rest });
  return out.filter((g) => g.tiles.length);
}

/**
 * Signed magnitude of a printed figure ("+1.24%", "−0.8%"), used only to size bars. The figure itself is always
 * printed from its fact; this never reaches the page as text. Unparseable input sizes to zero.
 */
export function magnitude(display: string | undefined): number {
  if (!display) return 0;
  const n = Number(display.replace(/[−–]/g, "-").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Bar widths as a percent of the largest absolute move, so the biggest mover fills its half of the track. */
export function barWidths(values: number[]): number[] {
  const max = Math.max(...values.map(Math.abs), 0);
  return values.map((v) => (max ? (Math.abs(v) / max) * 100 : 0));
}

/** Items grouped by a key in first-seen order (earnings by reporting day). */
export function groupBy<T>(xs: T[], key: (x: T) => string): { key: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return [...m.entries()].map(([k, items]) => ({ key: k, items }));
}
