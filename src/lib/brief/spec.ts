/** Constants straight from the Morning Brief build specification (sections 2 and 3). */

/** 2.1 Sectors a salesperson can follow. */
export const SPEC_SECTORS = ["Technology", "Healthcare", "Financials", "Energy", "Consumer", "Industrials", "Real estate"] as const;
export type SpecSector = (typeof SPEC_SECTORS)[number];

/** Our instrument universe uses finer sectors; each rolls up to exactly one selectable sector. */
export const INSTRUMENT_TO_SPEC: Record<string, SpecSector | null> = {
  Technology: "Technology", Semiconductors: "Technology", "Communication Services": "Technology",
  Healthcare: "Healthcare", Financials: "Financials", Energy: "Energy",
  "Consumer Discretionary": "Consumer", "Consumer Staples": "Consumer",
  Industrials: "Industrials", "Real estate": "Real estate", Utilities: null,
};
export const specSectorOf = (instrumentSector: string | null | undefined): SpecSector | null =>
  instrumentSector ? INSTRUMENT_TO_SPEC[instrumentSector] ?? null : null;

/** Sector indices shown in the universal leaders/laggards table (all eleven, whether or not selectable). */
export const SECTOR_INDEX_SECTORS = [
  "Technology", "Communication Services", "Consumer Discretionary", "Consumer Staples", "Healthcare", "Financials",
  "Energy", "Industrials", "Utilities", "Real estate", "Materials",
] as const;

/** Which instrument sectors feed each sector index. Materials has no constituents in this universe. */
export const SECTOR_INDEX_MEMBERS: Record<string, string[]> = {
  Technology: ["Technology", "Semiconductors"], "Communication Services": ["Communication Services"],
  "Consumer Discretionary": ["Consumer Discretionary"], "Consumer Staples": ["Consumer Staples"], Healthcare: ["Healthcare"],
  Financials: ["Financials"], Energy: ["Energy"], Industrials: ["Industrials"], Utilities: ["Utilities"], "Real estate": ["Real estate"], Materials: [],
};

/** 2.2 Products, grouped. */
export const PRODUCT_GROUPS: { group: string; options: string[] }[] = [
  { group: "Cash products", options: ["Equities", "Levered ETFs", "Fixed income", "Convertibles"] },
  { group: "Derivatives", options: ["Options", "Equity swaps", "Futures"] },
  { group: "Financing and lending", options: ["Securities lending / stock loan"] },
  { group: "Other", options: ["FX", "Commodities", "SPACs / new issues / IPOs"] },
];
export const ALL_PRODUCTS = PRODUCT_GROUPS.flatMap((g) => g.options);

/** 2.3 What to include. */
export const INCLUDE_TOGGLES = [
  { key: "overnight", label: "Overnight price moves", section: "overnight" },
  { key: "earnings", label: "Earnings this week", section: "earnings" },
  { key: "news", label: "Breaking news", section: "news" },
  { key: "macro", label: "Macro / economic releases", hint: "includes the Fed calendar", section: "macro_fed" },
  { key: "dividends", label: "Dividend announcements", section: "dividends" },
  { key: "sector_lead_lag", label: "Sector leaders and laggards", section: "sector_lead_lag" },
  { key: "movers", label: "Stock leaders and laggards in my sectors", section: "movers" },
  { key: "index_rebalance", label: "Index rebalance / reconstitution alerts", section: "index_rebalance" },
] as const;
export type IncludeKey = (typeof INCLUDE_TOGGLES)[number]["key"];
export const DEFAULT_INCLUDE: Record<IncludeKey, boolean> = Object.fromEntries(INCLUDE_TOGGLES.map((t) => [t.key, true])) as Record<IncludeKey, boolean>;

export type Delivery = "dashboard" | "email" | "both";
export interface BriefPrefs {
  sectors: SpecSector[];
  products: string[];
  include: Record<IncludeKey, boolean>;
  delivery: Delivery;
  sendTime: string; // HH:MM, ET
  effectiveFrom: string;
}

/** Default setup by desk, so the demo opens with sensible, different briefs per person. */
export function defaultPrefs(profileId: string, desk: string | null): Omit<BriefPrefs, "effectiveFrom"> {
  let h = 0;
  for (const c of profileId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const eq: SpecSector[][] = [["Technology", "Financials"], ["Healthcare", "Consumer"], ["Energy", "Industrials"], ["Technology", "Healthcare"], ["Financials", "Real estate"], ["Consumer", "Industrials", "Technology"]];
  const rc: SpecSector[][] = [["Financials", "Real estate"], ["Energy", "Industrials"], ["Financials", "Technology"], ["Real estate", "Consumer"]];
  const pool = desk === "RCS" ? rc : eq;
  const sectors = pool[h % pool.length];
  const products = desk === "RCS" ? ["Fixed income", "Futures", "FX"] : h % 2 ? ["Equities", "Options", "Equity swaps"] : ["Equities", "Options"];
  return { sectors, products, include: { ...DEFAULT_INCLUDE }, delivery: (["both", "email", "dashboard"] as const)[h % 3], sendTime: "06:30" };
}

/** Sections that are always shown (spec 3.1 to 3.3). */
export const ALWAYS_ON = ["snapshot", "chart", "catalysts"] as const;
