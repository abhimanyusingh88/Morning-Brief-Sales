import type { Db } from '../db/types';
import { formatLevel, formatMove, formatUsd } from '../market/format';
import type { Candidate, InstrumentInfo, Snapshot, TriggerKind } from '../pipeline/types';
import type { FactBook } from './facts';

const NY = 'America/New_York';

export const keySym = (s: string) => s.replace(/[^A-Za-z0-9]/g, '_');

/** Anything free-text that goes to a model has its figures removed first, so there is nothing to echo. */
export const mask = (s: string) => s.replace(/\p{N}[\p{N}.,:/-]*/gu, '[figure]').replace(/[%$€£¥]/g, '');

const day = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10));

export interface ClientBundle {
  client: {
    id: string;
    name: string;
    shortName: string;
    segment: string;
    tier: number;
    mandate: string;
    riskAppetite: string;
  };
  contact: { id: string; fullName: string; title: string } | null;
  interactions: { kind: string; subject: string; note: string; daysAgo: number; outcome: string | null }[];
  followup: { text: string; dueOn: string } | null;
  positions: { instrumentId: string; notionalUsd: number; asOf: string }[];
  trades: { instrumentId: string; side: 'buy' | 'sell'; notionalUsd: number; daysAgo: number }[];
}

/**
 * Client-level detail comes from a read made AS the salesperson. If row-level security hides a client,
 * it is simply absent here, and no card is written for it.
 */
export async function loadBundles(
  db: Db,
  profileId: string,
  clientIds: string[],
  businessDate: string,
): Promise<Map<string, ClientBundle>> {
  const out = new Map<string, ClientBundle>();
  if (!clientIds.length) return out;
  await db.asUser(profileId, async (q) => {
    const ids = [...new Set(clientIds)];
    const [cl, ct, ix, fu, ps, tr] = await Promise.all([
      q(`select id, name, short_name, segment, tier, mandate, risk_appetite from clients where id = any($1::uuid[])`, [
        ids,
      ]),
      q(
        `select id, client_id, full_name, title from contacts where client_id = any($1::uuid[]) order by is_primary desc, full_name`,
        [ids],
      ),
      q(
        `select * from (
           select client_id, kind, subject, note, outcome,
                  ($2::date - (occurred_at at time zone '${NY}')::date) as days_ago,
                  row_number() over (partition by client_id order by occurred_at desc) rn
           from interactions where client_id = any($1::uuid[])) t where rn <= 3 order by client_id, rn`,
        [ids, businessDate],
      ),
      q(
        `select client_id, text, due_on from followups where client_id = any($1::uuid[]) and status = 'open' and profile_id = $2 order by due_on`,
        [ids, profileId],
      ),
      q(`select client_id, instrument_id, notional_usd, as_of from positions where client_id = any($1::uuid[])`, [ids]),
      q(
        `select client_id, instrument_id, side, notional_usd, ($2::date - (traded_at at time zone '${NY}')::date) as days_ago
           from trades where client_id = any($1::uuid[]) and traded_at > $2::date - 30 order by traded_at desc`,
        [ids, businessDate],
      ),
    ]);
    for (const r of cl) {
      out.set(String(r.id), {
        client: {
          id: String(r.id),
          name: String(r.name),
          shortName: String(r.short_name),
          segment: String(r.segment),
          tier: Number(r.tier),
          mandate: String(r.mandate),
          riskAppetite: String(r.risk_appetite),
        },
        contact: null,
        interactions: [],
        followup: null,
        positions: [],
        trades: [],
      });
    }
    for (const r of ct) {
      const b = out.get(String(r.client_id));
      if (b && !b.contact) b.contact = { id: String(r.id), fullName: String(r.full_name), title: String(r.title) };
    }
    for (const r of ix)
      out.get(String(r.client_id))?.interactions.push({
        kind: String(r.kind),
        subject: String(r.subject),
        note: String(r.note),
        daysAgo: Number(r.days_ago),
        outcome: (r.outcome as string) ?? null,
      });
    for (const r of fu) {
      const b = out.get(String(r.client_id));
      if (b && !b.followup) b.followup = { text: String(r.text), dueOn: day(r.due_on) };
    }
    for (const r of ps)
      out.get(String(r.client_id))?.positions.push({
        instrumentId: String(r.instrument_id),
        notionalUsd: Number(r.notional_usd),
        asOf: day(r.as_of),
      });
    for (const r of tr)
      out.get(String(r.client_id))?.trades.push({
        instrumentId: String(r.instrument_id),
        side: r.side as 'buy' | 'sell',
        notionalUsd: Number(r.notional_usd),
        daysAgo: Number(r.days_ago),
      });
  });
  return out;
}

/** ---------------------------------------------------------------- shared fact registration */

const sizeWord = (z: number) => (z >= 2.5 ? 'very large for a normal day' : z >= 1.7 ? 'large' : 'notable');
const dirWord = (chg: number, unit: InstrumentInfo['unit'], ac: InstrumentInfo['assetClass']) => {
  if (ac === 'rates') return chg > 0 ? 'yield higher (price lower)' : 'yield lower (price higher)';
  if (ac === 'credit') return chg > 0 ? 'spreads wider' : 'spreads tighter';
  if (unit === 'level') return chg > 0 ? 'higher' : 'lower';
  return chg > 0 ? 'up' : 'down';
};

export function addName(fb: FactBook, i: InstrumentInfo, asOf: string): string {
  const key = `nm.${keySym(i.symbol)}`;
  if (!fb.has(key))
    fb.add({
      key,
      label: `${i.symbol} name`,
      value: null,
      display: i.name,
      unit: 'text',
      source: 'Instrument master',
      asOf,
    });
  return key;
}

export function addMove(fb: FactBook, s: Snapshot, i: InstrumentInfo): string | null {
  const q = s.quotes.get(i.id);
  if (!q) return null;
  const key = `mv.${keySym(i.symbol)}`;
  addName(fb, i, q.asOf);
  if (!fb.has(key)) {
    fb.add({
      key,
      label: `${i.name} move`,
      value: q.chg,
      display: formatMove(i.unit, q.chg),
      unit: i.unit === 'bp' ? 'bp' : i.unit === 'pct' ? 'pct' : 'level',
      source: q.source,
      asOf: q.asOf,
      hint: `${dirWord(q.chg, i.unit, i.assetClass)}, ${sizeWord(Math.abs(q.chg) / i.vol)}`,
    });
  }
  return key;
}

export function addLevel(fb: FactBook, s: Snapshot, i: InstrumentInfo): string | null {
  const q = s.quotes.get(i.id);
  if (!q) return null;
  const key = `lv.${keySym(i.symbol)}`;
  if (!fb.has(key))
    fb.add({
      key,
      label: `${i.name} level`,
      value: q.last,
      display: formatLevel(i.assetClass, q.last, i.decimals),
      unit: 'level',
      source: q.source,
      asOf: q.asOf,
    });
  return key;
}

export function addEventFacts(fb: FactBook, e: Snapshot['events'][number], n: string): { title: string; time: string } {
  const title = `ev.${n}.title`;
  const time = `ev.${n}.time`;
  fb.add({
    key: title,
    label: 'Event',
    value: null,
    display: e.title,
    unit: 'text',
    source: e.sourceLabel,
    asOf: e.occurredAt,
  });
  const t = new Date(e.occurredAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: NY,
    hour12: true,
  });
  fb.add({
    key: time,
    label: `${e.title} (time, ET)`,
    value: null,
    display: `${t} ET`,
    unit: 'time',
    source: e.sourceLabel,
    asOf: e.occurredAt,
  });
  return { title, time };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const daysDisplay = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

/** ---------------------------------------------------------------- card context */

export interface CardContext {
  rank: number;
  profileId: string;
  clientId: string;
  contactId: string | null;
  eventId: string | null;
  clientName: string;
  segment: string;
  tier: number;
  mandate: string;
  contactName: string | null;
  contactTitle: string | null;
  urgency: Candidate['urgency'];
  kind: TriggerKind;
  label: string;
  direction: 'up' | 'down' | 'flat';
  sector: string | null;
  /** instruments that explain the card, strongest first (max 3) */
  movers: { symbol: string; nameKey: string; moveKey: string | null; assetClass: InstrumentInfo['assetClass'] }[];
  events: {
    titleKey: string;
    timeKey: string;
    summary: string;
    sourceLabel: string;
    simulated: boolean;
    kind: string;
    calendar: boolean;
  }[];
  exposureKey: string | null;
  shareKey: string | null;
  gapKey: string | null;
  dueKey: string | null;
  followupText: string | null;
  lastContact: { kind: string; subject: string; note: string; whenKey: string } | null;
  trades: { symbol: string; nameKey: string; side: 'buy' | 'sell'; sizeKey: string; whenKey: string }[];
  interests: string[];
  secondary: string[];
  keys: string[];
}

export function buildCardContext(opts: {
  fb: FactBook;
  snap: Snapshot;
  candidate: Candidate;
  rank: number;
  bundle: ClientBundle;
}): CardContext | null {
  const { fb, snap, candidate: cand, rank, bundle } = opts;
  const t = cand.primary.trigger;
  const p = `c${rank}`;
  const asOf = new Date(`${snap.businessDate}T12:00:00Z`).toISOString();
  const before = new Set(fb.keys());
  const restricted = snap.restrictedInstrumentIds;

  const allowed = (id: string) => !restricted.has(id);
  const posBy = new Map(bundle.positions.map((x) => [x.instrumentId, x.notionalUsd]));
  const book = bundle.positions.filter((x) => allowed(x.instrumentId)).reduce((a, b) => a + b.notionalUsd, 0) || 1;

  // instruments that explain the card
  const ids = t.instrumentIds
    .filter(allowed)
    .map((id) => snap.instruments.get(id))
    .filter((x): x is InstrumentInfo => Boolean(x));
  const ranked =
    t.kind === 'move'
      ? ids.sort(
          (a, b) =>
            Math.abs(snap.quotes.get(b.id)?.chg ?? 0) / b.vol - Math.abs(snap.quotes.get(a.id)?.chg ?? 0) / a.vol,
        )
      : t.kind === 'macro_ahead'
        ? []
        : ids.sort((a, b) => (posBy.get(b.id) ?? 0) - (posBy.get(a.id) ?? 0));
  const movers = ranked.slice(0, 3).map((i) => ({
    symbol: i.symbol,
    nameKey: addName(fb, i, asOf),
    moveKey: addMove(fb, snap, i),
    assetClass: i.assetClass,
  }));

  const evs = t.eventIds
    .map((id) => snap.events.find((e) => e.id === id))
    .filter((e): e is Snapshot['events'][number] => Boolean(e))
    .slice(0, 2);
  const events = evs.map((e, n) => {
    const k = addEventFacts(fb, e, `${p}${n}`);
    return {
      titleKey: k.title,
      timeKey: k.time,
      summary: mask(e.summary),
      sourceLabel: e.sourceLabel,
      simulated: e.simulated,
      kind: e.kind,
      calendar: e.sourceLabel === 'Simulated calendar',
    };
  });

  const bookAsOf = bundle.positions[0]?.asOf ?? snap.businessDate;
  let exposureKey: string | null = null;
  let shareKey: string | null = null;
  if (t.exposureUsd > 0 && t.kind !== 'followup') {
    const exposure = t.instrumentIds.filter(allowed).reduce((a, id) => a + (posBy.get(id) ?? 0), 0) || t.exposureUsd;
    exposureKey = `${p}.exposure`;
    fb.add({
      key: exposureKey,
      label: `${bundle.client.shortName} exposure to this story`,
      value: exposure,
      display: formatUsd(exposure),
      unit: 'usd',
      source: 'Firm book (positions)',
      asOf: new Date(`${bookAsOf}T21:00:00Z`).toISOString(),
    });
    const share = Math.min(1, exposure / book);
    if (share >= 0.02) {
      shareKey = `${p}.share`;
      fb.add({
        key: shareKey,
        label: 'Share of tracked book',
        value: share * 100,
        display: `${Math.round(share * 100)}%`,
        unit: 'pct',
        source: 'Firm book (positions)',
        asOf: new Date(`${bookAsOf}T21:00:00Z`).toISOString(),
      });
    }
  }

  const lc = bundle.interactions[0] ?? null;
  let gapKey: string | null = null;
  let lastContact: CardContext['lastContact'] = null;
  if (lc) {
    gapKey = `${p}.last`;
    fb.add({
      key: gapKey,
      label: 'Last contact',
      value: lc.daysAgo,
      display: daysDisplay(lc.daysAgo),
      unit: 'days',
      source: 'CRM',
      asOf: new Date(`${snap.businessDate}T08:00:00Z`).toISOString(),
    });
    lastContact = { kind: lc.kind, subject: mask(lc.subject), note: mask(lc.note), whenKey: gapKey };
  }

  let dueKey: string | null = null;
  if (bundle.followup) {
    dueKey = `${p}.due`;
    const d = new Date(`${bundle.followup.dueOn}T12:00:00Z`);
    fb.add({
      key: dueKey,
      label: 'Follow-up due',
      value: null,
      display: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      unit: 'time',
      source: 'CRM',
      asOf: new Date(`${snap.businessDate}T08:00:00Z`).toISOString(),
    });
  }

  const relevantTrades = bundle.trades
    .filter(
      (x) =>
        allowed(x.instrumentId) &&
        (t.instrumentIds.includes(x.instrumentId) || t.kind === 'followup' || t.kind === 'reactivation'),
    )
    .slice(0, 2);
  const trades = relevantTrades.flatMap((x, n) => {
    const inst = snap.instruments.get(x.instrumentId);
    if (!inst) return [];
    const sizeKey = `${p}.t${n}.size`;
    const whenKey = `${p}.t${n}.when`;
    fb.add({
      key: sizeKey,
      label: 'Ticket size',
      value: x.notionalUsd,
      display: formatUsd(x.notionalUsd),
      unit: 'usd',
      source: 'Trade blotter',
      asOf: new Date(`${snap.businessDate}T08:00:00Z`).toISOString(),
    });
    fb.add({
      key: whenKey,
      label: 'Trade date',
      value: x.daysAgo,
      display: daysDisplay(x.daysAgo),
      unit: 'days',
      source: 'Trade blotter',
      asOf: new Date(`${snap.businessDate}T08:00:00Z`).toISOString(),
    });
    return [{ symbol: inst.symbol, nameKey: addName(fb, inst, asOf), side: x.side, sizeKey, whenKey }];
  });

  const keys = fb.keys().filter((k) => !before.has(k));
  // shared facts (moves/names) created earlier by other cards are still referenced by this one
  for (const m of movers) {
    for (const k of [m.nameKey, m.moveKey]) if (k && !keys.includes(k)) keys.push(k);
  }

  const dir: CardContext['direction'] = t.direction;
  return {
    rank,
    profileId: cand.profileId,
    clientId: cand.clientId,
    contactId: bundle.contact?.id ?? null,
    eventId: t.eventIds[0] ?? null,
    clientName: bundle.client.name,
    segment: bundle.client.segment,
    tier: bundle.client.tier,
    mandate: bundle.client.mandate,
    contactName: bundle.contact?.fullName ?? null,
    contactTitle: bundle.contact?.title ?? null,
    urgency: cand.urgency,
    kind: t.kind,
    label: t.label,
    direction: dir,
    sector: t.sector,
    movers,
    events,
    exposureKey,
    shareKey,
    gapKey,
    dueKey,
    followupText: bundle.followup ? mask(bundle.followup.text) : null,
    lastContact,
    trades,
    interests: snap.interests.get(cand.clientId)?.slice(0, 4) ?? [],
    secondary: cand.others.slice(0, 2).map((o) => o.trigger.label),
    keys,
  };
}

/** ---------------------------------------------------------------- brief context */

export interface BriefContext {
  profileId: string;
  firstName: string;
  businessDate: string;
  dateKey: string;
  overnight: {
    indexKeys: string[];
    volKey: string | null;
    ratesKey: string | null;
    ratesNameKey: string | null;
    fxKey: string | null;
    commodityKey: string | null;
  };
  macro: {
    ratesLevels: { nameKey: string; moveKey: string; levelKey: string }[];
    creditKeys: { nameKey: string; moveKey: string }[];
  };
  calendar: { titleKey: string; timeKey: string; kind: string }[];
  book: {
    totalKey: string;
    topSectorKey: string | null;
    topSectorShareKey: string | null;
    hitKey: string;
    clientsKey: string;
    cardsKey: string;
    nowKey: string;
  };
  flow: {
    countKey: string;
    totalKey: string;
    topClient: string | null;
    topSymbolNameKey: string | null;
    topSizeKey: string | null;
    topSide: 'buy' | 'sell' | null;
    topWhenKey: string | null;
  } | null;
  risks: {
    earningsKey: string | null;
    earningsNameKey: string | null;
    earningsClientsKey: string | null;
    volKey: string | null;
    crowdedKey: string | null;
    crowdedNameKey: string | null;
  };
  topCards: { clientName: string; headlineHint: string }[];
}

export async function buildBriefContext(opts: {
  db: Db;
  fb: FactBook;
  snap: Snapshot;
  profileId: string;
  firstName: string;
  cards: CardContext[];
}): Promise<BriefContext> {
  const { db, fb, snap, profileId, cards } = opts;
  const sym = new Map([...snap.instruments.values()].map((i) => [i.symbol, i]));
  const asOf = new Date(`${snap.businessDate}T12:00:00Z`).toISOString();
  const mv = (s: string) => {
    const i = sym.get(s);
    return i ? addMove(fb, snap, i) : null;
  };
  const nm = (s: string) => {
    const i = sym.get(s);
    return i ? addName(fb, i, asOf) : null;
  };

  const dateKey = 'brief.date';
  fb.add({
    key: dateKey,
    label: 'Business date',
    value: null,
    display: new Date(`${snap.businessDate}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    unit: 'time',
    source: 'Calendar',
    asOf,
  });

  // The book is read as the salesperson (RLS), restricted to what they cover.
  const mine = await db.asUser(profileId, async (q) => {
    const positions = await q(
      `select p.client_id, p.instrument_id, p.notional_usd from positions p
         where p.client_id in (select client_id from coverage where profile_id = $1)`,
      [profileId],
    );
    const trades = await q(
      `select t.client_id, c.short_name, t.instrument_id, t.side, t.notional_usd, ($2::date - (t.traded_at at time zone '${NY}')::date) as days_ago
         from trades t join clients c on c.id = t.client_id
        where t.client_id in (select client_id from coverage where profile_id = $1) and t.traded_at > $2::date - 5
        order by t.notional_usd desc`,
      [profileId, snap.businessDate],
    );
    return { positions, trades };
  });

  const ok = (id: string) => !snap.restrictedInstrumentIds.has(id);
  const pos = mine.positions.filter((r) => ok(String(r.instrument_id)));
  const total = pos.reduce((a, r) => a + Number(r.notional_usd), 0);
  const bySector = new Map<string, number>();
  const hitClients = new Set<string>();
  const heldBy = new Map<string, Set<string>>();
  for (const r of pos) {
    const i = snap.instruments.get(String(r.instrument_id));
    if (!i) continue;
    bySector.set(i.sector ?? 'Other', (bySector.get(i.sector ?? 'Other') ?? 0) + Number(r.notional_usd));
    const q = snap.quotes.get(i.id);
    if (q && Math.abs(q.chg) / i.vol >= 1) hitClients.add(String(r.client_id));
    if (!heldBy.has(i.id)) heldBy.set(i.id, new Set());
    heldBy.get(i.id)!.add(String(r.client_id));
  }
  const top = [...bySector.entries()]
    .filter(([s]) => !['Government', 'Index Credit', 'Index'].includes(s))
    .sort((a, b) => b[1] - a[1])[0];
  const bookAsOf = new Date(`${snap.businessDate}T08:00:00Z`).toISOString();
  const src = 'Firm book (positions)';
  fb.add({
    key: 'bk.total',
    label: 'Tracked book (notional)',
    value: total,
    display: formatUsd(total),
    unit: 'usd',
    source: src,
    asOf: bookAsOf,
  });
  let topSectorKey: string | null = null;
  let topSectorShareKey: string | null = null;
  if (top) {
    topSectorKey = 'bk.top_sector';
    topSectorShareKey = 'bk.top_sector_share';
    fb.add({
      key: topSectorKey,
      label: 'Largest sector in book',
      value: null,
      display: top[0],
      unit: 'text',
      source: src,
      asOf: bookAsOf,
    });
    fb.add({
      key: topSectorShareKey,
      label: 'Largest sector share of tracked book',
      value: (top[1] / (total || 1)) * 100,
      display: `${Math.round((top[1] / (total || 1)) * 100)}%`,
      unit: 'pct',
      source: src,
      asOf: bookAsOf,
    });
  }
  fb.add({
    key: 'bk.hit',
    label: 'Clients holding names with outsized moves',
    value: hitClients.size,
    display: String(hitClients.size),
    unit: 'count',
    source: src,
    asOf: bookAsOf,
  });
  fb.add({
    key: 'bk.clients',
    label: 'Clients covered',
    value: new Set(mine.positions.map((r) => String(r.client_id))).size,
    display: String(new Set(mine.positions.map((r) => String(r.client_id))).size),
    unit: 'count',
    source: src,
    asOf: bookAsOf,
  });
  fb.add({
    key: 'bk.cards',
    label: "Calls on today's list",
    value: cards.length,
    display: String(cards.length),
    unit: 'count',
    source: 'Morning Brief ranking',
    asOf: bookAsOf,
  });
  const nowCount = cards.filter((c) => c.urgency === 'now').length;
  fb.add({
    key: 'bk.now',
    label: 'Calls flagged now',
    value: nowCount,
    display: String(nowCount),
    unit: 'count',
    source: 'Morning Brief ranking',
    asOf: bookAsOf,
  });

  // flow: this person's clients' tickets in the last few days
  const tr = mine.trades.filter((r) => ok(String(r.instrument_id)));
  let flow: BriefContext['flow'] = null;
  if (tr.length) {
    const sum = tr.reduce((a, r) => a + Number(r.notional_usd), 0);
    fb.add({
      key: 'fl.count',
      label: 'Client tickets, last five days',
      value: tr.length,
      display: String(tr.length),
      unit: 'count',
      source: 'Trade blotter',
      asOf: bookAsOf,
    });
    fb.add({
      key: 'fl.total',
      label: 'Notional traded, last five days',
      value: sum,
      display: formatUsd(sum),
      unit: 'usd',
      source: 'Trade blotter',
      asOf: bookAsOf,
    });
    const b = tr[0];
    const bi = snap.instruments.get(String(b.instrument_id));
    let nameKey: string | null = null;
    if (bi) nameKey = addName(fb, bi, asOf);
    fb.add({
      key: 'fl.top_size',
      label: 'Largest ticket',
      value: Number(b.notional_usd),
      display: formatUsd(Number(b.notional_usd)),
      unit: 'usd',
      source: 'Trade blotter',
      asOf: bookAsOf,
    });
    fb.add({
      key: 'fl.top_when',
      label: 'Largest ticket date',
      value: Number(b.days_ago),
      display: daysDisplay(Number(b.days_ago)),
      unit: 'days',
      source: 'Trade blotter',
      asOf: bookAsOf,
    });
    flow = {
      countKey: 'fl.count',
      totalKey: 'fl.total',
      topClient: String(b.short_name),
      topSymbolNameKey: nameKey,
      topSizeKey: 'fl.top_size',
      topSide: b.side as 'buy' | 'sell',
      topWhenKey: 'fl.top_when',
    };
  }

  // calendar: today's scheduled items
  const cal = snap.events
    .filter(
      (e) =>
        e.businessDate === snap.businessDate &&
        e.sourceLabel === 'Simulated calendar' &&
        (e.kind === 'macro' || e.kind === 'earnings'),
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .slice(0, 5);
  const calendar = cal.map((e, n) => {
    const k = addEventFacts(fb, e, `cal${n}`);
    return { titleKey: k.title, timeKey: k.time, kind: e.kind };
  });

  // risks: earnings on names this person's clients hold; the most widely held name that is also moving
  let earningsKey: string | null = null,
    earningsNameKey: string | null = null,
    earningsClientsKey: string | null = null;
  const earn = snap.events
    .filter((e) => e.kind === 'earnings' && e.instrumentId && ok(e.instrumentId) && heldBy.has(e.instrumentId))
    .sort((a, b) => (heldBy.get(b.instrumentId!)?.size ?? 0) - (heldBy.get(a.instrumentId!)?.size ?? 0))[0];
  if (earn) {
    const i = snap.instruments.get(earn.instrumentId!)!;
    earningsNameKey = addName(fb, i, asOf);
    earningsKey = addEventFacts(fb, earn, 'risk').time;
    earningsClientsKey = 'rk.earn_clients';
    fb.add({
      key: earningsClientsKey,
      label: 'Clients holding the name reporting',
      value: heldBy.get(i.id)!.size,
      display: String(heldBy.get(i.id)!.size),
      unit: 'count',
      source: src,
      asOf: bookAsOf,
    });
  }
  const crowded = [...heldBy.entries()]
    .map(([id, set]) => ({ i: snap.instruments.get(id)!, n: set.size }))
    .filter(
      (x) =>
        x.i &&
        x.i.assetClass === 'equity' &&
        snap.quotes.get(x.i.id) &&
        Math.abs(snap.quotes.get(x.i.id)!.chg) / x.i.vol >= 1,
    )
    .sort((a, b) => b.n - a.n)[0];
  let crowdedKey: string | null = null,
    crowdedNameKey: string | null = null;
  if (crowded) {
    crowdedNameKey = addName(fb, crowded.i, asOf);
    crowdedKey = 'rk.crowded_clients';
    fb.add({
      key: crowdedKey,
      label: 'Clients holding the most widely held mover',
      value: crowded.n,
      display: String(crowded.n),
      unit: 'count',
      source: src,
      asOf: bookAsOf,
    });
    addMove(fb, snap, crowded.i);
  }

  const indexKeys = ['SPX', 'NDX', 'RTY'].map(mv).filter((x): x is string => Boolean(x));
  const lv = (s: string) => {
    const i = sym.get(s);
    return i ? addLevel(fb, snap, i) : null;
  };
  const ratesLevels = ['UST2Y', 'UST10Y', 'UST30Y'].flatMap((s) => {
    const i = sym.get(s);
    if (!i) return [];
    const m = addMove(fb, snap, i),
      l = lv(s);
    return m && l ? [{ nameKey: addName(fb, i, asOf), moveKey: m, levelKey: l }] : [];
  });
  const creditKeys = ['CDXIG', 'CDXHY'].flatMap((s) => {
    const i = sym.get(s);
    if (!i) return [];
    const m = addMove(fb, snap, i);
    return m ? [{ nameKey: addName(fb, i, asOf), moveKey: m }] : [];
  });

  return {
    profileId,
    firstName: opts.firstName,
    businessDate: snap.businessDate,
    dateKey,
    overnight: {
      indexKeys,
      volKey: mv('VIX'),
      ratesKey: mv('UST10Y'),
      ratesNameKey: nm('UST10Y'),
      fxKey: mv('DXY'),
      commodityKey: mv('WTI'),
    },
    macro: { ratesLevels, creditKeys },
    calendar,
    book: {
      totalKey: 'bk.total',
      topSectorKey,
      topSectorShareKey,
      hitKey: 'bk.hit',
      clientsKey: 'bk.clients',
      cardsKey: 'bk.cards',
      nowKey: 'bk.now',
    },
    flow,
    risks: { earningsKey, earningsNameKey, earningsClientsKey, volKey: mv('VIX'), crowdedKey, crowdedNameKey },
    topCards: cards.slice(0, 3).map((c) => ({ clientName: c.clientName, headlineHint: c.label })),
  };
}

export { plural };

/** The name fact that always accompanies a move fact. */
export const nameKeyOf = (moveKey: string) => moveKey.replace(/^mv\./, 'nm.');
