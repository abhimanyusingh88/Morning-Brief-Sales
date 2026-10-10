import type { InstrumentRef } from './types';
import { hash32 } from '../util/rng';

/**
 * A scenario is a story the tape tells overnight. Overrides are expressed in the instrument's
 * native move unit: percent for equities/FX/commodities, basis points for yields and spreads.
 */
export interface Override {
  symbols?: string[];
  sector?: string;
  assetClass?: InstrumentRef['assetClass'];
  /** centre of the move in native units */
  chg: number;
  /** +/- random spread around chg */
  spread?: number;
}

export interface ScenarioEvent {
  kind: 'news' | 'macro' | 'flow';
  title: string;
  summary: string;
  sector?: string;
  symbols?: string[];
  tags: string[];
  severity: 1 | 2 | 3;
  hour: number; // NY hour, 24h (premarket)
}

export interface Scenario {
  key: string;
  label: string;
  overrides: Override[];
  events: ScenarioEvent[];
}

export const SCENARIOS: Scenario[] = [
  {
    key: 'rates_up',
    label: 'Global yields higher on hawkish central-bank tone',
    overrides: [
      { symbols: ['UST2Y'], chg: 9, spread: 2 },
      { symbols: ['UST5Y'], chg: 10, spread: 2 },
      { symbols: ['UST10Y'], chg: 9.5, spread: 1.5 },
      { symbols: ['UST30Y'], chg: 7.5, spread: 1.5 },
      { symbols: ['BUND10Y'], chg: 5, spread: 1 },
      { symbols: ['GILT10Y'], chg: 7, spread: 1 },
      { symbols: ['JGB10Y'], chg: 1.5, spread: 0.5 },
      { symbols: ['DXY'], chg: 0.45, spread: 0.1 },
      { symbols: ['SPX'], chg: -0.55, spread: 0.1 },
      { symbols: ['NDX'], chg: -0.8, spread: 0.15 },
      { symbols: ['RTY'], chg: -1.3, spread: 0.2 },
      { sector: 'Utilities', assetClass: 'equity', chg: -1.3, spread: 0.3 },
      { sector: 'Financials', assetClass: 'equity', chg: 0.6, spread: 0.4 },
      { symbols: ['CDXIG'], chg: 1.2, spread: 0.3 },
      { symbols: ['CDXHY'], chg: 7, spread: 2 },
      { symbols: ['IG.UTIL'], chg: 2.2, spread: 0.4 },
    ],
    events: [
      {
        kind: 'macro',
        title: 'Global yields push higher overnight as central-bank speakers lean hawkish',
        summary:
          'Long-end yields extended their move higher in Asia and Europe. Front-end pricing for the next policy meeting shifted toward fewer cuts. Inflation data due at 08:30 is the next test.',
        tags: ['rates', 'central_banks', 'duration', 'inflation'],
        severity: 3,
        hour: 3,
      },
      {
        kind: 'news',
        title: "Long-end supply concerns weigh on Treasuries ahead of this week's auctions",
        summary: 'Dealers flagged heavy supply and thin demand indications into the 10-year and 30-year auctions.',
        tags: ['supply', 'duration', 'rates'],
        severity: 2,
        hour: 5,
      },
    ],
  },
  {
    key: 'semis_selloff',
    label: 'Semiconductor sell-off on unconfirmed export-rule reports',
    overrides: [
      { sector: 'Semiconductors', assetClass: 'equity', chg: -3.1, spread: 0.7 },
      { symbols: ['NDX'], chg: -1.1, spread: 0.1 },
      { symbols: ['SPX'], chg: -0.5, spread: 0.1 },
      { sector: 'Technology', assetClass: 'equity', chg: -0.9, spread: 0.4 },
      { symbols: ['VIX'], chg: 1.1, spread: 0.2 },
      { symbols: ['IG.TECH'], chg: 2.5, spread: 0.5 },
    ],
    events: [
      {
        kind: 'news',
        title: 'Chip stocks under pressure in premarket on reports of tighter export controls',
        summary:
          'Reports of possible new restrictions on advanced-chip shipments hit the sector in thin premarket trading. The reports are unconfirmed and no official statement has been made.',
        sector: 'Semiconductors',
        tags: ['Semiconductors', 'export_controls', 'ai_capex'],
        severity: 3,
        hour: 6,
      },
      {
        kind: 'flow',
        title: 'Heavy sector sell interest showing in overnight order flow',
        summary: 'Block liquidity in large-cap semiconductor names is thin; the desk is seeing two-way risk widen.',
        sector: 'Semiconductors',
        tags: ['Semiconductors', 'flow'],
        severity: 2,
        hour: 6,
      },
    ],
  },
  {
    key: 'credit_widening',
    label: 'Credit spreads wider on supply and risk-off',
    overrides: [
      { symbols: ['CDXIG'], chg: 3.2, spread: 0.5 },
      { symbols: ['CDXHY'], chg: 17, spread: 3 },
      { symbols: ['ITXMAIN'], chg: 3, spread: 0.5 },
      { symbols: ['IG.TECH'], chg: 5.5, spread: 0.8 },
      { symbols: ['IG.FIN'], chg: 4, spread: 0.6 },
      { symbols: ['HY.ENRG'], chg: 14, spread: 2 },
      { symbols: ['SPX'], chg: -0.7, spread: 0.1 },
      { symbols: ['VIX'], chg: 1.6, spread: 0.2 },
    ],
    events: [
      {
        kind: 'news',
        title: 'Investment-grade spreads widen as heavy issuance meets softer risk appetite',
        summary:
          'A large new-issue calendar and weaker equity futures pushed spreads wider across technology and financials.',
        tags: ['ig_credit', 'new_issue', 'Technology', 'Financials'],
        severity: 3,
        hour: 5,
      },
    ],
  },
  {
    key: 'energy_up',
    label: 'Crude higher on supply-disruption headlines',
    overrides: [
      { symbols: ['WTI'], chg: 4.2, spread: 0.5 },
      { sector: 'Energy', assetClass: 'equity', chg: 2.4, spread: 0.6 },
      { symbols: ['HY.ENRG'], chg: -9, spread: 2 },
      { symbols: ['IG.ENRG'], chg: -2, spread: 0.4 },
      { symbols: ['UST10Y'], chg: 3, spread: 1 },
    ],
    events: [
      {
        kind: 'news',
        title: 'Crude jumps on supply-disruption headlines',
        summary:
          'Front-month crude rallied sharply in Asia on reports of disrupted output. Energy equities are indicated higher.',
        sector: 'Energy',
        tags: ['Energy', 'commodities', 'inflation'],
        severity: 3,
        hour: 4,
      },
    ],
  },
  {
    key: 'risk_on',
    label: 'Risk-on rally as growth worries ease',
    overrides: [
      { symbols: ['SPX'], chg: 0.8, spread: 0.1 },
      { symbols: ['NDX'], chg: 1.1, spread: 0.1 },
      { symbols: ['RTY'], chg: 1.4, spread: 0.2 },
      { symbols: ['VIX'], chg: -1.1, spread: 0.2 },
      { symbols: ['CDXHY'], chg: -8, spread: 1.5 },
      { symbols: ['UST10Y'], chg: 2, spread: 0.8 },
    ],
    events: [
      {
        kind: 'news',
        title: 'Equities bid as growth worries ease',
        summary: 'Futures point higher across indices with cyclicals leading; credit is firmer.',
        tags: ['risk_on', 'Industrials', 'Consumer Discretionary'],
        severity: 2,
        hour: 6,
      },
    ],
  },
];

const BY_KEY = new Map(SCENARIOS.map((s) => [s.key, s]));
export const scenarioByKey = (k: string) => BY_KEY.get(k);

/**
 * Default storyline for a business date. 2026-10-05 is the curated demo day;
 * every other date picks two scenarios deterministically so each day tells a different story.
 */
export function defaultScenarios(businessDate: string): string[] {
  if (businessDate === '2026-10-05') return ['rates_up', 'semis_selloff'];
  const h = hash32('scn:' + businessDate);
  const a = SCENARIOS[h % SCENARIOS.length];
  const b = SCENARIOS[(Math.floor(h / 7) + 1 + (h % (SCENARIOS.length - 1))) % SCENARIOS.length];
  return a.key === b.key ? [a.key] : [a.key, b.key];
}
