import type { Factors, ScoredTrigger, Snapshot, Trigger } from "./types";

/** Weights are explicit so the model's explanation of "why this client" can quote them. */
export const WEIGHTS = {
  exposure: 0.3,
  magnitude: 0.25,
  relevance: 0.15,
  timing: 0.1,
  relationship: 0.1,
  contactGap: 0.1,
} as const;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export function factorsFor(s: Snapshot, t: Trigger): Factors {
  const client = s.clients.get(t.clientId)!;
  const lc = s.lastContact.get(t.clientId);
  const days = lc?.daysAgo ?? 365;

  const sizeScore = clamp(Math.log10(1 + t.exposureUsd / 5e6) / 1.5);
  const raw = 0.5 * sizeScore + 0.5 * clamp(t.exposureShare / 0.3);
  const exposure = t.kind === "followup" ? 0.2 : t.kind === "macro_ahead" ? raw * 0.6 : clamp(raw);

  let magnitude: number;
  if (t.kind === "move") magnitude = clamp(Math.max(t.z / 2.5, t.severity / 3 * 0.8));
  else if (t.kind === "earnings") magnitude = 0.7;
  else if (t.kind === "reactivation" || t.kind === "followup") magnitude = 0.3;
  else if (t.kind === "macro_ahead") magnitude = clamp((t.severity / 3) * 0.55);
  else magnitude = clamp(t.severity / 3);

  const relevance = t.tagsMatched.length ? 1 : t.exposureUsd > 0 ? 0.7 : 0.3;
  const relationship = client.tier === 1 ? 1 : client.tier === 2 ? 0.65 : 0.35;
  const contactGap = clamp(days / 30);

  const fu = s.followups.get(t.clientId);
  const followupDue = fu && fu.dueOn <= s.businessDate ? 1 : 0;

  const traded = s.trades.some((x) => x.clientId === t.clientId && t.instrumentIds.includes(x.instrumentId) && x.daysAgo <= 14);
  const recentFlow = traded ? 1 : 0;
  const recentContactPenalty = days <= 1 ? 1 : days <= 2 ? 0.5 : 0;

  return { exposure, magnitude, relevance, timing: t.timing, relationship, contactGap, followupDue, recentFlow, recentContactPenalty };
}

export function scoreFactors(f: Factors): number {
  let x =
    WEIGHTS.exposure * f.exposure + WEIGHTS.magnitude * f.magnitude + WEIGHTS.relevance * f.relevance +
    WEIGHTS.timing * f.timing + WEIGHTS.relationship * f.relationship + WEIGHTS.contactGap * f.contactGap;
  x += 0.1 * f.followupDue + 0.05 * f.recentFlow;
  x *= 1 - 0.5 * f.recentContactPenalty;
  // rescale so a perfect trigger is ~100 and ordinary good ones land in the 60s-80s
  return Math.round(Math.pow(clamp(x / 1.12), 1.35) * 1000) / 10; // 0..100, one decimal
}

export function scoreTrigger(s: Snapshot, t: Trigger): ScoredTrigger {
  const factors = factorsFor(s, t);
  return { trigger: t, factors, score: scoreFactors(factors) };
}
