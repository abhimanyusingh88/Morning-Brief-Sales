/**
 * Template banks the simulated vendors draw from. Everything here is placeholder content about fictional
 * issuers: headlines are generic and never name a publisher. Digits appear only in data fields, never in prose.
 */
import { rngFor } from "../util/rng";

export interface NewsTemplate {
  title: string;
  /** instrument sector (as stored on instruments), or null for market-wide items */
  sector: string | null;
  products: string[];
  severity: 1 | 2 | 3;
  tags: string[];
  /** tag a ticker from this sector when true */
  tickerFromSector?: boolean;
}

const EQ = ["Equities", "Options", "Equity swaps"];
export const NEWS_BANK: NewsTemplate[] = [
  { title: "Chip supply-chain report out overnight touches several names in the technology complex", sector: "Semiconductors", products: EQ, severity: 2, tags: ["supply_chain", "ai_capex"] },
  { title: "Enterprise software names firm as cloud-spending checks come in steady", sector: "Technology", products: EQ, severity: 1, tags: ["cloud"] },
  { title: "Large-cap technology consolidates ahead of earnings season as rate worries linger", sector: "Technology", products: [...EQ, "Futures"], severity: 1, tags: ["rates"] },
  { title: "Hardware makers flag component pricing pressure in supplier commentary", sector: "Technology", products: EQ, severity: 1, tags: ["margins"] },
  { title: "Regional bank regulatory headline circulating pre-market", sector: "Financials", products: EQ, severity: 3, tags: ["regulation", "banks"] },
  { title: "Banks mixed as the curve moves; trading-revenue expectations edge higher", sector: "Financials", products: EQ, severity: 1, tags: ["rates", "banks"] },
  { title: "Asset managers firm on inflow estimates", sector: "Financials", products: EQ, severity: 1, tags: ["flows"] },
  { title: "Insurers steady after catastrophe-loss updates", sector: "Financials", products: EQ, severity: 1, tags: ["insurance"] },
  { title: "Managed-care names slip on utilization commentary", sector: "Healthcare", products: EQ, severity: 2, tags: ["utilization"] },
  { title: "Biotech bid as late-stage trial readouts approach", sector: "Healthcare", products: [...EQ, "Convertibles"], severity: 1, tags: ["trials"] },
  { title: "Large pharma firm on pricing-policy relief", sector: "Healthcare", products: EQ, severity: 2, tags: ["policy"] },
  { title: "Oil edges lower on reports of resumed pipeline flows, though the risk premium has not fully cleared", sector: "Energy", products: ["Commodities", "Futures", ...EQ], severity: 2, tags: ["crude", "geopolitics"] },
  { title: "Oil services names firm on capex commentary", sector: "Energy", products: EQ, severity: 1, tags: ["capex"] },
  { title: "Refiners weaker as margins narrow", sector: "Energy", products: EQ, severity: 1, tags: ["margins"] },
  { title: "Retailers cautious ahead of holiday guidance", sector: "Consumer Discretionary", products: EQ, severity: 1, tags: ["consumer"] },
  { title: "Auto makers volatile on demand signals and incentive talk", sector: "Consumer Discretionary", products: [...EQ, "Levered ETFs"], severity: 2, tags: ["autos"] },
  { title: "Staples hold up as investors seek defensives", sector: "Consumer Staples", products: EQ, severity: 1, tags: ["defensives"] },
  { title: "Aerospace names bid on delivery-rate expectations", sector: "Industrials", products: EQ, severity: 2, tags: ["aerospace"] },
  { title: "Rail volumes soft in the weekly data", sector: "Industrials", products: EQ, severity: 1, tags: ["transport"] },
  { title: "Machinery orders point to slower capital spending", sector: "Industrials", products: EQ, severity: 1, tags: ["capex"] },
  { title: "REITs lag as yields back up", sector: "Real estate", products: EQ, severity: 2, tags: ["rates"] },
  { title: "Logistics landlords steady on occupancy data", sector: "Real estate", products: EQ, severity: 1, tags: ["occupancy"] },
  { title: "Office trusts pressured by refinancing worries", sector: "Real estate", products: EQ, severity: 2, tags: ["refinancing"] },
  { title: "Treasury market watching heavy supply this week", sector: null, products: ["Fixed income", "Futures"], severity: 2, tags: ["supply", "rates"] },
  { title: "Dollar firmer against the majors in thin Asian trade", sector: null, products: ["FX"], severity: 1, tags: ["dollar"] },
  { title: "Gold holds near highs as real yields ease", sector: null, products: ["Commodities", "Futures"], severity: 1, tags: ["metals"] },
  { title: "Credit markets quiet with a light new-issue calendar", sector: null, products: ["Fixed income"], severity: 1, tags: ["credit"] },
  { title: "Several new issues scheduled to price this week", sector: null, products: ["SPACs / new issues / IPOs", "Equities"], severity: 1, tags: ["ipo"] },
  { title: "Acquisition-vehicle merger vote set for Thursday", sector: null, products: ["SPACs / new issues / IPOs"], severity: 1, tags: ["spac"] },
  { title: "Borrow costs elevated in crowded short names", sector: null, products: ["Securities lending / stock loan", "Equities"], severity: 2, tags: ["borrow"] },
  { title: "Convertible issuance picks up as rates stay high", sector: null, products: ["Convertibles", "Fixed income"], severity: 1, tags: ["converts"] },
  { title: "Leveraged ETF flows run hot ahead of event risk", sector: null, products: ["Levered ETFs", "Equities"], severity: 2, tags: ["etf_flows"] },
];

/** Pick the day's headlines: a spread across sectors plus the market-wide items, never the same list two days running. */
export function pickNews(businessDate: string, n = 16): NewsTemplate[] {
  const r = rngFor("news:" + businessDate);
  const idx = NEWS_BANK.map((_, i) => ({ i, k: r.next() })).sort((a, b) => a.k - b.k).slice(0, n).map((x) => x.i).sort((a, b) => a - b);
  return idx.map((i) => NEWS_BANK[i]);
}

export interface EconTemplate { title: string; time: string; unit: "pct" | "level" | "thousand"; est: [number, number]; prior: [number, number]; weekdays: number[] }
export const ECON_BANK: EconTemplate[] = [
  { title: "Durable goods orders", time: "08:30", unit: "pct", est: [0.1, 0.6], prior: [-0.4, 0.4], weekdays: [1, 2, 3] },
  { title: "Consumer confidence", time: "10:00", unit: "level", est: [98, 108], prior: [97, 109], weekdays: [1, 2] },
  { title: "Factory orders", time: "10:00", unit: "pct", est: [-0.4, 0.6], prior: [-0.5, 0.7], weekdays: [1, 2] },
  { title: "Services activity index", time: "10:00", unit: "level", est: [49, 56], prior: [49, 56], weekdays: [1, 2, 3] },
  { title: "Retail sales", time: "08:30", unit: "pct", est: [0.0, 0.6], prior: [-0.2, 0.6], weekdays: [3, 4, 5] },
  { title: "Weekly jobless claims", time: "08:30", unit: "thousand", est: [215, 245], prior: [210, 250], weekdays: [4] },
  { title: "Housing starts", time: "08:30", unit: "thousand", est: [1250, 1450], prior: [1250, 1450], weekdays: [2, 3, 5] },
  { title: "Producer price index", time: "08:30", unit: "pct", est: [0.0, 0.4], prior: [-0.1, 0.4], weekdays: [3, 4, 5] },
  { title: "Trade balance", time: "08:30", unit: "level", est: [-70, -50], prior: [-72, -48], weekdays: [1, 2, 3] },
  { title: "Consumer sentiment", time: "10:00", unit: "level", est: [62, 74], prior: [62, 74], weekdays: [5] },
  { title: "Nonfarm payrolls", time: "08:30", unit: "thousand", est: [90, 190], prior: [70, 200], weekdays: [5] },
];

/** Public-institution speakers are fictional: no real people appear anywhere in the demo. */
export const FED_SPEAKERS = ["Governor Ashby", "Governor Okonkwo", "Vice Chair Marlowe", "Governor Reyes-Whitfield", "Governor Lindgren", "Regional president Calloway"];
export const FED_TOPICS = ["rates policy", "the economic outlook", "inflation dynamics", "financial stability", "the labor market"];

export const INDEX_EVENTS = [
  { index: "Russell 2000", kind: "quarterly reconstitution", note: "Watch for elevated volume in additions and deletions." },
  { index: "S&P 500", kind: "quarterly rebalance", note: "Float and share-count changes take effect after the close." },
  { index: "Nasdaq 100", kind: "annual reconstitution", note: "Constituent weights reset; index-tracking flows expected into the close." },
  { index: "Dow", kind: "component review", note: "Committee announcement expected after the close." },
];

/** Stage-two classifier for headlines the aggregator delivered without tags: ordered keyword rules, first match wins. */
const EQP = ["Equities", "Options", "Equity swaps"];
const RULES: { re: RegExp; sector: string | null; products: string[]; tags: string[] }[] = [
  { re: /chip|semiconductor|supply-chain/i, sector: "Semiconductors", products: EQP, tags: ["supply_chain"] },
  { re: /software|cloud|hardware|technology/i, sector: "Technology", products: EQP, tags: ["technology"] },
  { re: /managed-care|biotech|pharma|trial/i, sector: "Healthcare", products: EQP, tags: ["healthcare"] },
  { re: /\boil\b|crude|refiner|pipeline/i, sector: "Energy", products: ["Commodities", "Futures", ...EQP], tags: ["crude"] },
  { re: /reit|landlord|office trust|occupancy|refinanc/i, sector: "Real estate", products: EQP, tags: ["real_estate"] },
  { re: /bank|asset manager|insurer|curve/i, sector: "Financials", products: EQP, tags: ["financials"] },
  { re: /retailer|auto makers|holiday/i, sector: "Consumer Discretionary", products: EQP, tags: ["consumer"] },
  { re: /staples|defensives/i, sector: "Consumer Staples", products: EQP, tags: ["defensives"] },
  { re: /aerospace|rail|machinery/i, sector: "Industrials", products: EQP, tags: ["industrials"] },
  { re: /treasury|credit|issuance/i, sector: null, products: ["Fixed income", "Futures"], tags: ["rates"] },
  { re: /dollar/i, sector: null, products: ["FX"], tags: ["dollar"] },
  { re: /gold/i, sector: null, products: ["Commodities", "Futures"], tags: ["metals"] },
  { re: /new issue|vehicle|merger vote/i, sector: null, products: ["SPACs / new issues / IPOs", "Equities"], tags: ["ipo"] },
  { re: /borrow/i, sector: null, products: ["Securities lending / stock loan", "Equities"], tags: ["borrow"] },
  { re: /leveraged/i, sector: null, products: ["Levered ETFs", "Equities"], tags: ["etf_flows"] },
];
export function classifyHeadline(title: string): { sector: string | null; products: string[]; tags: string[]; rule: string } | null {
  for (const r of RULES) if (r.re.test(title)) return { sector: r.sector, products: r.products, tags: r.tags, rule: r.re.source.split("|")[0] };
  return null;
}
