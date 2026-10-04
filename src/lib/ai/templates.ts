import type { BriefContext, CardContext } from "./context";
import { nameKeyOf } from "./context";

/**
 * Deterministic writer. Same inputs, same words, and every string is built from tokens so it always
 * passes the validator. It is both the fallback when a model is unavailable and the baseline the LLM
 * output is compared against.
 */
export interface CardText {
  headline: string;
  why: string;
  talkingPoints: string[];
  watchOuts: string[];
}

export interface SectionText {
  kind: "overnight" | "macro" | "calendar" | "book" | "flow" | "risks";
  title: string;
  body: string;
}

export interface BriefText {
  headline: string;
  sections: SectionText[];
}

const t = (k: string) => `{{${k}}}`;
const SEGMENT: Record<string, string> = {
  hedge_fund: "hedge fund", asset_manager: "asset manager", pension: "pension fund", insurer: "insurer", bank: "bank", corporate: "corporate treasury",
};
const pair = (name: string, move: string | null) => (move ? `${t(name)} ${t(move)}` : t(name));
const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const moverList = (c: CardContext) => join(c.movers.map((m) => pair(m.nameKey, m.moveKey)));
const safeSubject = (s: string) => (s.includes("[figure]") ? null : s.charAt(0).toLowerCase() + s.slice(1));

export function templateCard(c: CardContext): CardText {
  const lead = c.movers[0];
  const ev = c.events[0];
  const who = `${c.clientName}, a ${SEGMENT[c.segment] ?? "client"}`;
  const last = c.gapKey ? ` Last contact was ${t(c.gapKey)}.` : "";
  const held = c.exposureKey ? `${c.clientName} has ${t(c.exposureKey)} exposed to this${c.shareKey ? `, ${t(c.shareKey)} of the book we track for them` : ""}.` : "";
  const scope = c.sector ?? "the affected names";

  let headline: string;
  let why: string;
  const points: string[] = [];
  const watch: string[] = [];

  switch (c.kind) {
    case "move": {
      const rates = lead?.assetClass === "rates";
      const credit = lead?.assetClass === "credit";
      const up = c.direction === "up";
      headline = lead
        ? rates ? `Rates ${up ? "sell off" : "rally"}: ${pair(lead.nameKey, lead.moveKey)}`
          : credit ? `Credit ${up ? "widens" : "tightens"}: ${pair(lead.nameKey, lead.moveKey)}`
          : `${scope} ${c.direction === "down" ? "under pressure" : c.direction === "up" ? "in demand" : "on the move"}: ${pair(lead.nameKey, lead.moveKey)}`
        : `Moves in ${scope}`;
      why = `${held} ${lead ? `${moverList(c)} this morning.` : ""}${ev ? (ev.calendar ? ` ${t(ev.titleKey)} is due at ${t(ev.timeKey)}.` : ` The news flow points to ${t(ev.titleKey)}.`) : ""}${last}`.replace(/\s+/g, " ").trim();
      points.push(`Open with ${lead ? pair(lead.nameKey, lead.moveKey) : "the move"} and how it lands on their book${c.exposureKey ? `, ${t(c.exposureKey)} in the space` : ""}.`);
      break;
    }
    case "earnings": {
      headline = ev ? `${t(ev.titleKey)}, ${t(ev.timeKey)}` : "Earnings on a held name";
      why = `${held} ${ev ? `${t(ev.titleKey)} at ${t(ev.timeKey)}.` : ""}${last}`.replace(/\s+/g, " ").trim();
      points.push(`Lead with what the release could mean for their position${lead ? ` in ${t(lead.nameKey)}` : ""} and how they want to be positioned going in.`);
      watch.push("Do not share anything that is not already public; keep it to consensus and positioning.");
      break;
    }
    case "event": {
      headline = ev ? t(ev.titleKey) : "Event touching their holdings";
      why = `${held} ${ev ? `Today's flow: ${t(ev.titleKey)}.` : ""}${last}`.replace(/\s+/g, " ").trim();
      points.push(`Bring the story first: ${ev ? t(ev.titleKey) : "what changed"}, then tie it to what they hold.`);
      break;
    }
    case "macro_ahead": {
      headline = ev ? `Ahead of ${t(ev.titleKey)}` : "Scheduled release ahead";
      why = `${held} ${ev ? `${t(ev.titleKey)} is due at ${t(ev.timeKey)}, and their rates and credit exposure is sensitive to it.` : ""}${last}`.replace(/\s+/g, " ").trim();
      points.push(`Offer a view on how the market is positioned into ${ev ? t(ev.titleKey) : "the release"} and the levels they would act at.`);
      break;
    }
    case "followup": {
      headline = c.dueKey ? `Follow-up due ${t(c.dueKey)}` : "Follow-up due";
      why = `${who}. You owe them a follow-up${c.dueKey ? `, due ${t(c.dueKey)}` : ""}.${last}`;
      points.push("Close the loop on what you promised before anything new.");
      break;
    }
    default: {
      headline = c.gapKey ? `Gone quiet: last contact ${t(c.gapKey)}` : "Gone quiet";
      why = `${who}. ${held}${last} A ${c.tier === 1 ? "top-tier" : "mid-tier"} relationship that has not heard from the desk in a while.`.replace(/\s+/g, " ").trim();
      points.push("Reconnect with something useful rather than a check-in: a view on what moved in their holdings since you last spoke.");
    }
  }

  if (c.lastContact) {
    const subj = safeSubject(c.lastContact.subject);
    points.push(`Pick up from the ${c.lastContact.kind} ${t(c.lastContact.whenKey)}${subj ? ` about ${subj}` : ""}.`);
  }
  if (c.followupText && c.dueKey && c.kind !== "followup") points.push(`Close out the open follow-up, due ${t(c.dueKey)}.`);
  const tr = c.trades[0];
  if (tr) {
    points.push(`They ${tr.side === "buy" ? "bought" : "sold"} ${t(tr.nameKey)} ${t(tr.whenKey)} (${t(tr.sizeKey)}); ask how it fits their plan before suggesting more.`);
    watch.push("Check whether the recent ticket was a hedge or a conviction trade before pitching the other side.");
  }
  points.push("Ask what they want from us today: levels, a screen of alternatives, or color on flow.");
  watch.push(c.tier === 1 ? "Top-tier relationship: keep it short, specific and prepared." : "Confirm the news driver with research before attributing the move.");
  if (ev && ev.calendar === false && ev.simulated) watch.push("Headline is from a feed summary; verify with the source before quoting it to the client.");

  return { headline, why, talkingPoints: points.slice(0, 4), watchOuts: watch.slice(0, 3) };
}

export function templateBrief(b: BriefContext): BriefText {
  const sections: SectionText[] = [];
  const o = b.overnight;

  if (o.indexKeys.length) {
    const eq = join(o.indexKeys.map((k) => pair(nameKeyOf(k), k)));
    const bits = [
      `Good morning ${b.firstName}. Equities are indicated ${eq}.`,
      o.volKey ? `Volatility: ${pair(nameKeyOf(o.volKey), o.volKey)}.` : "",
      o.ratesKey && o.ratesNameKey ? `In rates, ${t(o.ratesNameKey)} is ${t(o.ratesKey)}.` : "",
      o.fxKey ? `The dollar: ${pair(nameKeyOf(o.fxKey), o.fxKey)}.` : "",
      o.commodityKey ? `Crude: ${pair(nameKeyOf(o.commodityKey), o.commodityKey)}.` : "",
    ].filter(Boolean);
    sections.push({ kind: "overnight", title: "Overnight", body: bits.join(" ") });
  }

  if (b.macro.ratesLevels.length) {
    const r = join(b.macro.ratesLevels.map((x) => `${t(x.nameKey)} at ${t(x.levelKey)} (${t(x.moveKey)})`));
    const c = b.macro.creditKeys.length ? ` Credit: ${join(b.macro.creditKeys.map((x) => pair(x.nameKey, x.moveKey)))}.` : "";
    sections.push({ kind: "macro", title: "Rates and credit", body: `Yields: ${r}.${c}` });
  }

  if (b.calendar.length) {
    sections.push({
      kind: "calendar", title: "On the calendar",
      body: `Today's schedule: ${join(b.calendar.map((e) => `${t(e.titleKey)} at ${t(e.timeKey)}`))}.`,
    });
  }

  const k = b.book;
  sections.push({
    kind: "book", title: "Your book",
    body: `You cover ${t(k.clientsKey)} clients with ${t(k.totalKey)} of tracked positions.${k.topSectorKey && k.topSectorShareKey ? ` The largest equity concentration is ${t(k.topSectorKey)} at ${t(k.topSectorShareKey)} of the book.` : ""} ${t(k.hitKey)} of your clients hold names with outsized moves this morning. Your call list has ${t(k.cardsKey)} names, ${t(k.nowKey)} flagged to call now.`,
  });

  if (b.flow) {
    const f = b.flow;
    sections.push({
      kind: "flow", title: "Client flow",
      body: `Your clients printed ${t(f.countKey)} tickets over the past week, ${t(f.totalKey)} in total.${f.topClient && f.topSizeKey && f.topSymbolNameKey ? ` The largest was ${f.topClient} ${f.topSide === "buy" ? "buying" : "selling"} ${t(f.topSymbolNameKey)}, ${t(f.topSizeKey)}, ${f.topWhenKey ? t(f.topWhenKey) : "recently"}.` : ""}`,
    });
  }

  const r = b.risks;
  const rb: string[] = [];
  if (r.earningsNameKey && r.earningsKey && r.earningsClientsKey) rb.push(`${t(r.earningsNameKey)} reports at ${t(r.earningsKey)}; ${t(r.earningsClientsKey)} of your clients hold it.`);
  if (r.crowdedNameKey && r.crowdedKey) rb.push(`${t(r.crowdedNameKey)} is moving and is your most widely held mover, across ${t(r.crowdedKey)} clients.`);
  if (r.volKey) rb.push(`Watch volatility: ${pair(nameKeyOf(r.volKey), r.volKey)}.`);
  if (rb.length) sections.push({ kind: "risks", title: "Watch list", body: rb.join(" ") });

  const lead = o.indexKeys[0];
  const headline = lead
    ? `${t(nameKeyOf(lead))} ${t(lead)}; ${t(k.cardsKey)} calls on your list, ${t(k.nowKey)} to make now`
    : `${t(k.cardsKey)} calls on your list, ${t(k.nowKey)} to make now`;
  return { headline, sections };
}
