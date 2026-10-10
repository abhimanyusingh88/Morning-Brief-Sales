import { getDb } from '../db';

const iso = (x: unknown) => new Date(x as string).toISOString();
const day = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10));

export interface ClientListRow {
  id: string;
  name: string;
  segment: string;
  tier: number;
  aumUsdMn: number;
  status: string;
  lastContactDays: number | null;
  cardId: string | null;
  cardUrgency: string | null;
}

export async function listClients(meId: string, opts: { q?: string; segment?: string }): Promise<ClientListRow[]> {
  const db = await getDb();
  const like = `%${(opts.q ?? '').replace(/[%_\\]/g, '\\$&')}%`;
  const rows = await db.asUser(meId, (q) =>
    q(
      `select c.id, c.name, c.segment, c.tier, c.aum_usd_mn, c.status,
            (select (current_date - (max(i.occurred_at) at time zone 'America/New_York')::date) from interactions i where i.client_id = c.id) as gap,
            cc.id card_id, cc.urgency card_urgency
       from clients c
       left join lateral (select x.id, x.urgency from call_cards x join briefs b on b.id = x.brief_id where x.client_id = c.id and x.profile_id = $1 order by b.business_date desc limit 1) cc on true
      where ($2 = '' or c.name ilike $3) and ($4 = '' or c.segment = $4)
      order by c.tier, c.aum_usd_mn desc limit 300`,
      [meId, opts.q ?? '', like, opts.segment ?? ''],
    ),
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    segment: String(r.segment),
    tier: Number(r.tier),
    aumUsdMn: Number(r.aum_usd_mn),
    status: String(r.status),
    lastContactDays: r.gap == null ? null : Number(r.gap),
    cardId: (r.card_id as string) ?? null,
    cardUrgency: (r.card_urgency as string) ?? null,
  }));
}

export async function getClient360(meId: string, clientId: string) {
  const db = await getDb();
  return db.asUser(meId, async (q) => {
    const c = (await q(`select * from clients where id = $1`, [clientId]))[0];
    if (!c) return null;
    const [contacts, positions, trades, interactions, followups, covers, card] = await Promise.all([
      q(
        `select id, full_name, title, email, phone, is_primary from contacts where client_id = $1 order by is_primary desc, full_name`,
        [clientId],
      ),
      q(
        `select i.symbol, i.name, i.sector, i.asset_class, i.unit, p.notional_usd, mq.chg, mq.as_of
           from positions p join instruments i on i.id = p.instrument_id left join market_quotes mq on mq.instrument_id = i.id where p.client_id = $1 order by p.notional_usd desc`,
        [clientId],
      ),
      q(
        `select i.symbol, i.name, t.side, t.notional_usd, t.price, t.traded_at from trades t join instruments i on i.id = t.instrument_id where t.client_id = $1 order by t.traded_at desc limit 8`,
        [clientId],
      ),
      q(
        `select x.kind, x.subject, x.note, x.occurred_at, x.sentiment, p.full_name author from interactions x left join profiles p on p.id = x.profile_id where x.client_id = $1 order by x.occurred_at desc limit 8`,
        [clientId],
      ),
      q(`select id, text, due_on, status from followups where client_id = $1 order by status, due_on limit 6`, [
        clientId,
      ]),
      q(
        `select p.full_name, v.role from coverage v join profiles p on p.id = v.profile_id where v.client_id = $1 order by v.role, p.full_name`,
        [clientId],
      ),
      q(
        `select x.id, x.urgency, x.headline, x.status from call_cards x join briefs b on b.id = x.brief_id where x.client_id = $1 and x.profile_id = $2 order by b.business_date desc limit 1`,
        [clientId, meId],
      ),
    ]);
    const interests = await q(`select tag from client_interests where client_id = $1 order by weight desc`, [clientId]);
    return {
      client: {
        id: String(c.id),
        name: String(c.name),
        segment: String(c.segment),
        region: String(c.region),
        country: String(c.country),
        tier: Number(c.tier),
        aumUsdMn: Number(c.aum_usd_mn),
        since: day(c.relationship_since),
        mandate: String(c.mandate),
        risk: String(c.risk_appetite),
        status: String(c.status),
      },
      contacts: contacts.map((x) => ({
        id: String(x.id),
        name: String(x.full_name),
        title: String(x.title),
        email: String(x.email),
        phone: String(x.phone),
        primary: Boolean(x.is_primary),
      })),
      positions: positions.map((p) => ({
        symbol: String(p.symbol),
        name: String(p.name),
        sector: (p.sector as string) ?? null,
        assetClass: String(p.asset_class),
        unit: p.unit as 'pct' | 'bp' | 'level',
        usd: Number(p.notional_usd),
        chg: p.chg == null ? null : Number(p.chg),
        asOf: p.as_of ? iso(p.as_of) : null,
      })),
      trades: trades.map((t) => ({
        symbol: String(t.symbol),
        name: String(t.name),
        side: t.side as 'buy' | 'sell',
        usd: Number(t.notional_usd),
        at: iso(t.traded_at),
      })),
      interactions: interactions.map((x) => ({
        kind: String(x.kind),
        subject: String(x.subject),
        note: String(x.note)
          .replace(/\.{2,}/g, '.')
          .replace(/\s{2,}/g, ' '),
        at: iso(x.occurred_at),
        sentiment: Number(x.sentiment),
        author: (x.author as string) ?? null,
      })),
      followups: followups.map((f) => ({
        id: String(f.id),
        text: String(f.text),
        dueOn: day(f.due_on),
        status: String(f.status),
      })),
      coverage: covers.map((v) => ({ name: String(v.full_name), role: String(v.role) })),
      interests: interests.map((i) => String(i.tag)),
      card: card[0]
        ? {
            id: String(card[0].id),
            urgency: card[0].urgency as 'now' | 'today' | 'this_week',
            headline: String(card[0].headline),
            status: String(card[0].status),
          }
        : null,
    };
  });
}
