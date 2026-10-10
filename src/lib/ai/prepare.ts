import type { Db } from '../db/types';
import type { Candidate, Snapshot } from '../pipeline/types';
import { buildBriefContext, buildCardContext, loadBundles, type BriefContext, type CardContext } from './context';
import { FactBook } from './facts';

export interface Prepared {
  profileId: string;
  facts: FactBook;
  cards: CardContext[];
  brief: BriefContext;
  /** names that must never appear in model-written text for this person */
  forbidden: string[];
  /** ranking detail per client, stored on the card so the UI can explain "why this one" */
  cardScore: Map<string, number>;
  cardFactors: Map<string, Record<string, unknown>>;
}

export const forbiddenTerms = (snap: Snapshot) =>
  [...snap.restrictedInstrumentIds].flatMap((id) => {
    const i = snap.instruments.get(id);
    return i ? [i.symbol, i.name] : [];
  });

/**
 * Everything a writer is allowed to see for one salesperson. Client-level detail is read as that person
 * (row-level security); a card whose client is not visible to them is dropped here, not written.
 */
export async function prepareProfile(opts: {
  db: Db;
  snap: Snapshot;
  profileId: string;
  firstName: string;
  picks: Candidate[];
}): Promise<Prepared> {
  const { db, snap, profileId, firstName, picks } = opts;
  const bundles = await loadBundles(
    db,
    profileId,
    picks.map((p) => p.clientId),
    snap.businessDate,
  );
  const facts = new FactBook();
  const cards: CardContext[] = [];
  for (const cand of picks) {
    const bundle = bundles.get(cand.clientId);
    if (!bundle) continue;
    const ctx = buildCardContext({ fb: facts, snap, candidate: cand, rank: cards.length + 1, bundle });
    if (ctx) cards.push(ctx);
  }
  const brief = await buildBriefContext({ db, fb: facts, snap, profileId, firstName, cards });
  const cardScore = new Map<string, number>();
  const cardFactors = new Map<string, Record<string, unknown>>();
  for (const cand of picks) {
    cardScore.set(cand.clientId, cand.score);
    cardFactors.set(cand.clientId, {
      ...cand.primary.factors,
      primaryScore: cand.primary.score,
      trigger: cand.primary.trigger.kind,
      label: cand.primary.trigger.label,
      group: cand.primary.trigger.group,
      alsoRelevant: cand.others.slice(0, 3).map((o) => ({ label: o.trigger.label, score: o.score })),
    });
  }
  return { profileId, facts, cards, brief, forbidden: forbiddenTerms(snap), cardScore, cardFactors };
}
