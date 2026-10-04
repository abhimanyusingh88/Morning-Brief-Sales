import type { MoveUnit } from "../market/types";

export interface InstrumentInfo {
  id: string;
  symbol: string;
  name: string;
  sector: string | null;
  assetClass: "equity" | "rates" | "credit" | "fx" | "commodity" | "index" | "vol";
  unit: MoveUnit;
  vol: number;
}

export interface QuoteInfo {
  last: number;
  prevClose: number;
  chg: number;
  asOf: string;
  source: string;
}

export interface ClientInfo {
  id: string;
  name: string;
  shortName: string;
  segment: string;
  tier: 1 | 2 | 3;
  aumUsdMn: number;
  status: "active" | "dormant" | "prospect";
}

export interface EventInfo {
  id: string;
  kind: "earnings" | "macro" | "news" | "rating" | "flow" | "research" | "corporate_action";
  title: string;
  summary: string;
  occurredAt: string;
  businessDate: string;
  instrumentId: string | null;
  sector: string | null;
  tags: string[];
  severity: 1 | 2 | 3;
  simulated: boolean;
  sourceLabel: string;
}

export interface Snapshot {
  businessDate: string;
  instruments: Map<string, InstrumentInfo>;
  quotes: Map<string, QuoteInfo>;
  clients: Map<string, ClientInfo>;
  /** profile ids that cover each client (primary and secondary) */
  coverage: Map<string, string[]>;
  /** client id -> positions */
  positions: Map<string, { instrumentId: string; notionalUsd: number }[]>;
  interests: Map<string, string[]>;
  lastContact: Map<string, { daysAgo: number; kind: string; subject: string; note: string }>;
  followups: Map<string, { id: string; dueOn: string; text: string }>;
  trades: { clientId: string; instrumentId: string; side: "buy" | "sell"; notionalUsd: number; daysAgo: number }[];
  events: EventInfo[];
  restrictedInstrumentIds: Set<string>;
  prefs: Map<string, { maxCards: number }>;
}

export type TriggerKind = "move" | "earnings" | "event" | "macro_ahead" | "followup" | "reactivation";

export interface Trigger {
  kind: TriggerKind;
  clientId: string;
  /** grouping key, used to keep a call list diverse (e.g. "sector:Semiconductors") */
  group: string;
  eventIds: string[];
  instrumentIds: string[];
  sector: string | null;
  exposureUsd: number;
  /** share of the client's tracked book that is exposed, 0..1 */
  exposureShare: number;
  /** largest |move| / typical daily move across instruments in the trigger */
  z: number;
  direction: "up" | "down" | "flat";
  severity: 1 | 2 | 3;
  /** how time-critical the trigger is, 0..1 */
  timing: number;
  tagsMatched: string[];
  /** internal label, never shown to the model as numbers */
  label: string;
}

export interface Factors {
  exposure: number;
  magnitude: number;
  relevance: number;
  timing: number;
  relationship: number;
  contactGap: number;
  followupDue: number;
  recentFlow: number;
  recentContactPenalty: number;
}

export interface ScoredTrigger {
  trigger: Trigger;
  factors: Factors;
  score: number;
}

export interface Candidate {
  profileId: string;
  clientId: string;
  score: number;
  urgency: "now" | "today" | "this_week";
  primary: ScoredTrigger;
  others: ScoredTrigger[];
}
