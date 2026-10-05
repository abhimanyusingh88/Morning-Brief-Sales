import type { ClientInfo, EventInfo, InstrumentInfo, Snapshot, Trigger } from "./types";

const MOVE_Z_MIN = 1.0;
export const CALENDAR_LABEL = "Simulated calendar";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const isRatesTag = (t: string) => ["rates", "duration", "curve", "central_banks", "supply", "inflation", "liability_hedging"].includes(t);

function moveGroup(i: InstrumentInfo): string | null {
  switch (i.assetClass) {
    case "equity":
      return `sector:${i.sector}`;
    case "rates":
      return "rates";
    case "credit":
      return i.sector === "Index Credit" ? "credit:index" : `credit:${i.sector}`;
    default:
      return null;
  }
}

/** Every reason this client might deserve a call today. Pure function of the snapshot. */
export function triggersForClient(s: Snapshot, client: ClientInfo): Trigger[] {
  const positions = (s.positions.get(client.id) ?? []).filter((p) => !s.restrictedInstrumentIds.has(p.instrumentId));
  const book = sum((s.positions.get(client.id) ?? []).map((p) => p.notionalUsd)) || 1;
  const interests = s.interests.get(client.id) ?? [];
  const out: Trigger[] = [];

  // 1. Moves in what the client actually holds, grouped (a sector selling off is one story, not eight).
  const groups = new Map<string, { ids: string[]; usd: number; zmax: number; chgs: number[]; sector: string | null }>();
  for (const p of positions) {
    const inst = s.instruments.get(p.instrumentId);
    const q = s.quotes.get(p.instrumentId);
    if (!inst || !q) continue;
    const z = Math.abs(q.chg) / inst.vol;
    if (z < MOVE_Z_MIN) continue;
    const g = moveGroup(inst);
    if (!g) continue;
    const cur = groups.get(g) ?? { ids: [], usd: 0, zmax: 0, chgs: [], sector: inst.sector };
    cur.ids.push(inst.id);
    cur.usd += p.notionalUsd;
    cur.zmax = Math.max(cur.zmax, z);
    cur.chgs.push(q.chg);
    groups.set(g, cur);
  }

  const todaysEvents = s.events.filter((e) => e.businessDate === s.businessDate && e.kind !== "earnings" && e.kind !== "corporate_action" && !(e.instrumentId && s.restrictedInstrumentIds.has(e.instrumentId)));
  // Scheduled calendar items (CPI, auctions) are "ahead" triggers; narrative events explain moves.
  const narrative = todaysEvents.filter((e) => e.sourceLabel !== CALENDAR_LABEL);

  for (const [g, v] of groups) {
    // attach the narrative that explains the move
    const explaining = narrative.filter((e) => {
      if (g.startsWith("sector:")) return e.sector === v.sector;
      if (g === "rates") return e.tags.some(isRatesTag);
      if (g.startsWith("credit:")) return e.tags.some((t) => t === "ig_credit" || t === "hy_credit") || (e.sector != null && e.sector === v.sector);
      return false;
    });
    const avg = sum(v.chgs) / v.chgs.length;
    out.push({
      kind: "move",
      clientId: client.id,
      group: g,
      eventIds: explaining.map((e) => e.id),
      instrumentIds: v.ids,
      sector: v.sector,
      exposureUsd: v.usd,
      exposureShare: Math.min(1, v.usd / book),
      z: v.zmax,
      direction: avg > 0 ? "up" : avg < 0 ? "down" : "flat",
      severity: (Math.max(1, ...explaining.map((e) => e.severity)) as 1 | 2 | 3),
      timing: 0.75,
      tagsMatched: interests.filter((t) => explaining.some((e) => e.tags.includes(t)) || t === v.sector),
      label: `${g} move`,
    });
  }
  const explainedEventIds = new Set(out.flatMap((t) => t.eventIds));

  // 2. Earnings: tonight after the close or tomorrow before the open, on a name the client holds.
  for (const e of s.events.filter((x) => x.kind === "earnings" && x.instrumentId)) {
    const pos = positions.find((p) => p.instrumentId === e.instrumentId);
    if (!pos) continue;
    const tonight = e.businessDate === s.businessDate;
    const tomorrow = !tonight && e.businessDate > s.businessDate;
    if (!tonight && !tomorrow) continue;
    out.push({
      kind: "earnings",
      clientId: client.id,
      group: `earnings:${e.instrumentId}`,
      eventIds: [e.id],
      instrumentIds: [e.instrumentId!],
      sector: e.sector,
      exposureUsd: pos.notionalUsd,
      exposureShare: Math.min(1, pos.notionalUsd / book),
      z: 0,
      direction: "flat",
      severity: e.severity,
      timing: tonight ? 1 : 0.6,
      tagsMatched: interests.filter((t) => t === e.sector || t === "earnings"),
      label: "earnings",
    });
  }

  // 3. Other events of the day that touch the client by sector, tag or instrument (not already used as an explanation).
  for (const e of todaysEvents) {
    if (explainedEventIds.has(e.id)) continue;
    if (e.kind === "macro") {
      const hit = interests.filter((t) => e.tags.includes(t));
      const ratesBook = positions.filter((p) => ["rates", "credit"].includes(s.instruments.get(p.instrumentId)?.assetClass ?? ""));
      const ratesUsd = sum(ratesBook.map((p) => p.notionalUsd));
      if (!hit.length && !(e.tags.some(isRatesTag) && ratesUsd > 0)) continue;
      out.push({
        kind: "macro_ahead",
        clientId: client.id,
        group: `macro:${e.id}`,
        eventIds: [e.id],
        instrumentIds: ratesBook.map((p) => p.instrumentId),
        sector: null,
        exposureUsd: ratesUsd,
        exposureShare: Math.min(1, ratesUsd / book),
        z: 0,
        direction: "flat",
        severity: e.severity,
        timing: 0.8,
        tagsMatched: hit,
        label: "macro ahead",
      });
      continue;
    }
    if (e.instrumentId) {
      const pos = positions.find((p) => p.instrumentId === e.instrumentId);
      if (!pos) continue;
      out.push(eventTrigger(client, e, [e.instrumentId], pos.notionalUsd, book, interests));
    } else if (e.sector) {
      const exposed = positions.filter((p) => s.instruments.get(p.instrumentId)?.sector === e.sector);
      const usd = sum(exposed.map((p) => p.notionalUsd));
      if (!usd && !interests.includes(e.sector)) continue;
      out.push(eventTrigger(client, e, exposed.map((p) => p.instrumentId), usd, book, interests));
    }
  }

  // 4. Relationship triggers.
  const fu = s.followups.get(client.id);
  if (fu && fu.dueOn <= s.businessDate) {
    out.push({
      kind: "followup", clientId: client.id, group: "followup", eventIds: [], instrumentIds: [], sector: null,
      exposureUsd: 0, exposureShare: 0, z: 0, direction: "flat", severity: 1, timing: 0.5, tagsMatched: [], label: "follow-up due",
    });
  }
  const lc = s.lastContact.get(client.id);
  if ((lc?.daysAgo ?? 999) > 45 && client.tier <= 2) {
    out.push({
      kind: "reactivation", clientId: client.id, group: "reactivation", eventIds: [], instrumentIds: [],
      sector: null, exposureUsd: book, exposureShare: 1, z: 0, direction: "flat", severity: 1, timing: 0.3, tagsMatched: [], label: "gone quiet",
    });
  }
  return mergeCalendarIntoMoves(out);
}

/** A scheduled release matters most to someone already moving on it: fold it into that story instead of ranking it twice. */
function mergeCalendarIntoMoves(all: Trigger[]): Trigger[] {
  const moves = all.filter((t) => t.kind === "move");
  const keep: Trigger[] = [];
  for (const t of all) {
    if (t.kind === "macro_ahead") {
      const host = moves.find((m) => m.group === "rates") ?? moves.find((m) => m.group.startsWith("credit:"));
      if (host) {
        host.eventIds = [...host.eventIds, ...t.eventIds];
        host.timing = Math.max(host.timing, 0.9);
        host.tagsMatched = [...new Set([...host.tagsMatched, ...t.tagsMatched])];
        continue;
      }
    }
    keep.push(t);
  }
  return keep;
}

function eventTrigger(client: ClientInfo, e: EventInfo, instrumentIds: string[], usd: number, book: number, interests: string[]): Trigger {
  return {
    kind: "event",
    clientId: client.id,
    group: e.sector ? `sector:${e.sector}` : `event:${e.id}`,
    eventIds: [e.id],
    instrumentIds,
    sector: e.sector,
    exposureUsd: usd,
    exposureShare: Math.min(1, usd / book),
    z: 0,
    direction: "flat",
    severity: e.severity,
    timing: 0.55,
    tagsMatched: interests.filter((t) => e.tags.includes(t) || t === e.sector),
    label: "event",
  };
}

/** Number of signals dropped because the instrument sits on the restricted list (information barrier). */
export function suppressedByBarrier(s: Snapshot): number {
  let n = 0;
  for (const positions of s.positions.values()) {
    for (const p of positions) {
      if (!s.restrictedInstrumentIds.has(p.instrumentId)) continue;
      const inst = s.instruments.get(p.instrumentId);
      const q = s.quotes.get(p.instrumentId);
      if (inst && q && Math.abs(q.chg) / inst.vol >= MOVE_Z_MIN) n++;
    }
  }
  return n;
}
