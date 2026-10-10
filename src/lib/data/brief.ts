import { getDb } from '../db';
import type { FactView } from '@/components/ui/fact';
import { specSectorOf, type SpecSector } from '../brief/spec';

export interface CardRow {
  id: string;
  rank: number;
  score: number;
  urgency: 'now' | 'today' | 'this_week';
  status: 'new' | 'done' | 'snoozed' | 'dismissed';
  headline: string;
  whyTemplate: string;
  talkingPoints: { template: string; rendered: string }[];
  watchOuts: { template: string; rendered: string }[];
  factKeys: string[];
  factors: Record<string, unknown>;
  generator: string;
  clientId: string;
  clientName: string;
  segment: string;
  tier: number;
  contact: { name: string; title: string; phone: string; email: string } | null;
}

export interface SectionRow {
  id: string;
  kind: string;
  position: number;
  title: string;
  /** words and {{fact_key}} tokens only */
  template: string;
  generator: 'llm' | 'hybrid' | 'template' | 'code' | string;
  factKeys: string[];
  /** structured payload; every number in it is a fact key (see src/lib/brief/build.ts) */
  data: Record<string, unknown>;
  status: 'ok' | 'unavailable';
  note: string | null;
}

export interface Bundle {
  brief: {
    id: string;
    businessDate: string;
    headline: string;
    generatedAt: string;
    publishedAt: string | null;
    version: number;
    /** per-section and per-feed status recorded by the pipeline */
    dataStatus: { sections: Record<string, string>; feeds: Record<string, string> };
  };
  sections: SectionRow[];
  cards: CardRow[];
  facts: Record<string, FactView>;
}

const iso = (x: unknown) => new Date(x as string).toISOString();

/** The latest published brief for this person, read under their own permissions. Drafts are never shown. */
export async function getBundle(meId: string): Promise<Bundle | null> {
  const db = await getDb();
  return db.asUser(meId, async (q) => {
    const b = (
      await q(
        `select id, business_date::text bd, headline, generated_at, published_at, version, data_status from briefs where profile_id = $1 and status = 'published' order by business_date desc limit 1`,
        [meId],
      )
    )[0];
    if (!b) return null;
    const [sec, cards, facts] = await Promise.all([
      q(
        `select id, kind, position, title, body_template, generator, fact_keys, data, status, note from brief_sections where brief_id = $1 order by position`,
        [b.id],
      ),
      q(
        `select c.id, c.rank, c.score, c.urgency, c.status, c.headline, c.why_template, c.talking_points, c.watch_outs, c.fact_keys, c.factors, c.generator,
                cl.id client_id, cl.name client_name, cl.segment, cl.tier,
                ct.full_name contact_name, ct.title contact_title, ct.phone, ct.email
           from call_cards c join clients cl on cl.id = c.client_id left join contacts ct on ct.id = c.contact_id
          where c.brief_id = $1 order by c.rank`,
        [b.id],
      ),
      q(`select key, label, display, unit, source, as_of, feed_key from brief_facts where brief_id = $1`, [b.id]),
    ]);
    return {
      brief: {
        id: String(b.id),
        businessDate: String(b.bd),
        headline: String(b.headline ?? ''),
        generatedAt: iso(b.generated_at),
        publishedAt: b.published_at ? iso(b.published_at) : null,
        version: Number(b.version),
        dataStatus: {
          sections: (b.data_status as { sections?: Record<string, string> } | null)?.sections ?? {},
          feeds: (b.data_status as { feeds?: Record<string, string> } | null)?.feeds ?? {},
        },
      },
      sections: sec.map((s): SectionRow => ({
        id: String(s.id),
        kind: String(s.kind),
        position: Number(s.position),
        title: String(s.title),
        template: String(s.body_template),
        generator: String(s.generator),
        factKeys: (s.fact_keys as string[]) ?? [],
        data: (s.data as Record<string, unknown>) ?? {},
        status: s.status === 'unavailable' ? 'unavailable' : 'ok',
        note: s.note ? String(s.note) : null,
      })),
      cards: cards.map((c): CardRow => ({
        id: String(c.id),
        rank: Number(c.rank),
        score: Number(c.score),
        urgency: c.urgency as CardRow['urgency'],
        status: c.status as CardRow['status'],
        headline: String(c.headline),
        whyTemplate: String(c.why_template),
        talkingPoints: c.talking_points as CardRow['talkingPoints'],
        watchOuts: c.watch_outs as CardRow['watchOuts'],
        factKeys: c.fact_keys as string[],
        factors: c.factors as Record<string, unknown>,
        generator: String(c.generator),
        clientId: String(c.client_id),
        clientName: String(c.client_name),
        segment: String(c.segment),
        tier: Number(c.tier),
        contact: c.contact_name
          ? {
              name: String(c.contact_name),
              title: String(c.contact_title),
              phone: String(c.phone),
              email: String(c.email),
            }
          : null,
      })),
      facts: Object.fromEntries(
        facts.map((f) => [
          String(f.key),
          {
            key: String(f.key),
            label: String(f.label),
            display: String(f.display),
            unit: f.unit ? String(f.unit) : undefined,
            source: String(f.source),
            asOf: iso(f.as_of),
            feedKey: f.feed_key ? String(f.feed_key) : undefined,
          },
        ]),
      ),
    };
  });
}

export interface Tile {
  symbol: string;
  name: string;
  chg: number;
  unit: 'pct' | 'bp' | 'level';
  last: number;
  decimals: number;
  assetClass: string;
  asOf: string;
  source: string;
  z: number;
}

const TILE_SYMBOLS = ['SPX', 'NDX', 'UST10Y', 'UST2Y', 'VIX', 'DXY', 'WTI', 'CDXIG'];

export async function getMarketTiles(meId: string): Promise<Tile[]> {
  const db = await getDb();
  const rows = await db.asUser(meId, (q) =>
    q(
      `select i.symbol, i.name, i.unit, i.decimals, i.asset_class, (i.meta->>'vol')::float8 vol, mq.chg, mq.last, mq.as_of, mq.source
       from market_quotes mq join instruments i on i.id = mq.instrument_id where i.symbol = any($1::text[])`,
      [TILE_SYMBOLS],
    ),
  );
  return TILE_SYMBOLS.flatMap((s) => {
    const r = rows.find((x) => x.symbol === s);
    return r
      ? [
          {
            symbol: s,
            name: String(r.name),
            chg: Number(r.chg),
            unit: r.unit as Tile['unit'],
            last: Number(r.last),
            decimals: Number(r.decimals),
            assetClass: String(r.asset_class),
            asOf: iso(r.as_of),
            source: String(r.source),
            z: Math.abs(Number(r.chg)) / Number(r.vol),
          },
        ]
      : [];
  });
}

export async function getPulse(meId: string) {
  const db = await getDb();
  return db.asUser(meId, async (q) => {
    const [fu, last] = await Promise.all([
      q(
        `select count(*)::int open, count(*) filter (where due_on <= current_date + 3)::int soon from followups where profile_id = $1 and status = 'open'`,
        [meId],
      ),
      q(`select max(as_of) a, max(source) s from market_quotes`),
    ]);
    return { followups: Number(fu[0].open), asOf: last[0].a ? iso(last[0].a) : null, source: String(last[0].s ?? '') };
  });
}

/** One equity with its specification sector, for the live "stock leaders and laggards" preview on the setup screen. */
export interface UniverseRow {
  symbol: string;
  name: string;
  sector: SpecSector;
  chg: number;
  asOf: string;
  source: string;
}

/**
 * Today's equity quotes with their specification sector, restricted names removed.
 * Quotes and instruments are read as the person. The information barrier is not visible to a salesperson (restricted
 * events are compliance-only), so the list of restricted instrument ids is read with service access, exactly as the
 * chat does: ids only, no client data, never sent to a model, and never returned to the browser.
 */
export async function getStockUniverse(meId: string): Promise<UniverseRow[]> {
  const db = await getDb();
  const bd = (
    await db.asUser(meId, (q) => q<{ d: string }>(`select business_date::text d from firm_settings limit 1`))
  )[0]?.d;
  const restricted = new Set(
    (
      await db.asService((q) =>
        q<{ id: string }>(
          `select distinct instrument_id id from events where entitlement = 'restricted_ib' and instrument_id is not null and business_date >= $1::date - 5`,
          [bd],
        ),
      )
    ).map((r) => String(r.id)),
  );
  const rows = await db.asUser(meId, (q) =>
    q(
      `select i.id, i.symbol, i.name, i.sector, m.chg, m.as_of, m.source from market_quotes m join instruments i on i.id = m.instrument_id where i.asset_class = 'equity'`,
    ),
  );
  return rows.flatMap((r) => {
    const sector = specSectorOf(r.sector as string | null);
    if (!sector || restricted.has(String(r.id))) return [];
    return [
      {
        symbol: String(r.symbol),
        name: String(r.name),
        sector,
        chg: Number(r.chg),
        asOf: iso(r.as_of),
        source: String(r.source),
      },
    ];
  });
}

export interface EmailDigest {
  id: string;
  status: string;
  to: string | null;
  subject: string | null;
  html: string | null;
  scheduledFor: string | null;
  deliveredAt: string | null;
  businessDate: string | null;
}

/** The stored email digest for this person (latest), read under their own permissions. Null when their setup has no email. */
export async function getEmailDigest(meId: string): Promise<EmailDigest | null> {
  const db = await getDb();
  const r = (
    await db.asUser(meId, (q) =>
      q(
        `select d.id, d.status, d.to_address, d.subject, d.html, d.scheduled_for, d.delivered_at, b.business_date::text bd
       from deliveries d left join briefs b on b.id = d.brief_id
      where d.profile_id = $1 and d.channel = 'email' order by coalesce(d.delivered_at, d.scheduled_for) desc nulls last limit 1`,
        [meId],
      ),
    )
  )[0];
  if (!r) return null;
  return {
    id: String(r.id),
    status: String(r.status),
    to: r.to_address ? String(r.to_address) : null,
    subject: r.subject ? String(r.subject) : null,
    html: r.html ? String(r.html) : null,
    scheduledFor: r.scheduled_for ? iso(r.scheduled_for) : null,
    deliveredAt: r.delivered_at ? iso(r.delivered_at) : null,
    businessDate: r.bd ? String(r.bd) : null,
  };
}
