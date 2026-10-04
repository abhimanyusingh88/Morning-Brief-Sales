import { triggersForClient } from "./match";
import { scoreTrigger } from "./score";
import type { Candidate, Snapshot } from "./types";

const MIN_SCORE = 25;

export function urgencyFor(score: number, timing: number): Candidate["urgency"] {
  if (score >= 62 && timing >= 0.7) return "now";
  if (score >= 45) return "today";
  return "this_week";
}

/** All scored candidates, one per (profile, client), before any per-person selection. */
export function buildCandidates(s: Snapshot): Candidate[] {
  const out: Candidate[] = [];
  for (const client of s.clients.values()) {
    const scored = triggersForClient(s, client).map((t) => scoreTrigger(s, t)).sort((a, b) => b.score - a.score);
    if (!scored.length) continue;
    const [primary, ...others] = scored;
    const bonus = Math.min(6, 0.08 * others.reduce((a, o) => a + o.score, 0));
    const score = Math.min(100, Math.round((primary.score + bonus) * 10) / 10);
    for (const profileId of s.coverage.get(client.id) ?? []) {
      out.push({ profileId, clientId: client.id, score, urgency: urgencyFor(score, primary.trigger.timing), primary, others });
    }
  }
  return out;
}

/** The ranked call list for each person: top N, with a cap per story so the list stays varied. */
export function selectCards(s: Snapshot, candidates: Candidate[]): Map<string, Candidate[]> {
  const byProfile = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (!byProfile.has(c.profileId)) byProfile.set(c.profileId, []);
    byProfile.get(c.profileId)!.push(c);
  }
  const result = new Map<string, Candidate[]>();
  for (const [profileId, list] of byProfile) {
    const max = s.prefs.get(profileId)?.maxCards ?? 8;
    const cap = Math.max(2, Math.ceil(max * 0.6));
    const used = new Map<string, number>();
    const picked: Candidate[] = [];
    for (const c of list.filter((x) => x.score >= MIN_SCORE).sort((a, b) => b.score - a.score)) {
      const g = c.primary.trigger.group;
      if ((used.get(g) ?? 0) >= cap) continue;
      used.set(g, (used.get(g) ?? 0) + 1);
      picked.push(c);
      if (picked.length >= max) break;
    }
    result.set(profileId, picked);
  }
  return result;
}
