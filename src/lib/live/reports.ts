import { createHash } from 'node:crypto';
import { cache } from 'react';
import type { Db, Q } from '../db/types';
import { businessDate } from './time';
import { COMPANIES } from './classify';
import { latestDesk, prepareDesk } from './desk';
import {
  METRICS,
  type Article,
  type Client,
  type Focus,
  type Holding,
  type Metric,
  type Preferences,
  type Report,
  type Story,
  TOPICS,
} from './types';
export const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const validId = (s: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
const str = (x: unknown) => (x == null ? null : String(x));
const iso = (x: unknown) => (x instanceof Date ? x.toISOString() : String(x));
const day = (x: unknown) => iso(x).slice(0, 10);
export async function holdings(q: Q): Promise<Holding[]> {
  const rows = await q(
    'select h.*,a.id aid,a.external_id,a.name fund,a.currency,a.valuation_date,c.id cid,c.name client from live_holdings h join live_accounts a on a.id=h.account_id join live_clients c on c.id=a.client_id where h.active and a.active and c.active order by c.name,a.external_id,h.symbol,h.direction',
  );
  return rows.map((r) => ({
    id: String(r.id),
    clientId: String(r.cid),
    client: String(r.client),
    accountId: String(r.aid),
    account: String(r.external_id),
    fund: String(r.fund),
    symbol: String(r.symbol),
    direction: r.direction as Holding['direction'],
    quantity: String(r.quantity),
    currentValue: String(r.current_value),
    initialValue: String(r.initial_value),
    spread: String(r.spread),
    margin: String(r.margin),
    currency: str(r.currency),
    valuationDate: r.valuation_date ? day(r.valuation_date) : null,
  }));
}
export function clientsFrom(h: Holding[]): Client[] {
  return [...new Set(h.map((x) => x.clientId))].map((id) => {
    const rows = h.filter((x) => x.clientId === id);
    return {
      id,
      name: rows[0].client,
      accounts: new Set(rows.map((x) => x.accountId)).size,
      holdings: rows.length,
      symbols: [...new Set(rows.map((x) => x.symbol))].sort(),
    };
  });
}
/** The whole assigned book. Shared within one render, so a page reads it once however many loaders need it. */
export const getCoverage = cache(async (db: Db, profileId: string) => {
  return db.asUser(profileId, async (q) => {
    const h = await holdings(q);
    return { holdings: h, clients: clientsFrom(h), hash: hash(h) };
  });
});
export type Coverage = Awaited<ReturnType<typeof getCoverage>>;
/** Brief setup choices, limited to clients the person still covers and stocks still in those clients' books. */
export const getFocus = cache(async (db: Db, profileId: string): Promise<Focus> => {
  return focusFor(db, profileId, await getCoverage(db, profileId));
});
/** Brief setup choices checked against a book the caller has already loaded, so the book is never read twice. */
async function focusFor(db: Db, profileId: string, book: Coverage): Promise<Focus> {
  const [r] = await db.asUser(profileId, (q) =>
    q('select focus_clients,focus_topics,focus_symbols from live_preferences where profile_id=$1', [profileId]),
  );
  const clients = ((r?.focus_clients as string[]) ?? []).filter((id) => book.clients.some((c) => c.id === id));
  const held = new Set(
    book.holdings.filter((h) => !clients.length || clients.includes(h.clientId)).map((h) => h.symbol),
  );
  return {
    clients,
    topics: ((r?.focus_topics as string[]) ?? []).filter((t) => (TOPICS as readonly string[]).includes(t)),
    symbols: ((r?.focus_symbols as string[]) ?? []).filter((s) => held.has(s)),
  };
}
/** The book as the brief shows it: only the clients chosen in brief setup, or everyone when none are chosen. */
export function focusCoverage<T extends { holdings: Holding[]; clients: Client[] }>(book: T, focus: Focus): T {
  if (!focus.clients.length) return book;
  return {
    ...book,
    holdings: book.holdings.filter((h) => focus.clients.includes(h.clientId)),
    clients: book.clients.filter((c) => focus.clients.includes(c.id)),
  };
}
/**
 * Applies brief setup to a published brief at read time. The stored brief keeps the whole book; clients that were
 * not chosen, and stories outside the chosen topics or stocks, are left out of what is shown.
 */
export function focusReport(report: Report, focus: Focus): Report | null {
  let r: Report | null = report;
  if (focus.clients.length) {
    if (report.clientId) {
      if (!focus.clients.includes(report.clientId)) return null;
    } else if (report.holdings.some((h) => !focus.clients.includes(h.clientId))) {
      const kept = narrowReport(report, focus.clients);
      // A past brief published before any chosen client was covered still opens, whole, rather than vanishing.
      r = kept ?? report;
    }
  }
  if (!focus.topics.length && !focus.symbols.length) return r;
  return {
    ...r,
    articles: r.articles.filter(
      (a) =>
        (!focus.topics.length || a.topics.some((t) => focus.topics.includes(t))) &&
        (!focus.symbols.length ||
          a.symbols.some((s) => focus.symbols.includes(s)) ||
          a.matches.some((m) => focus.symbols.includes(m.symbol))),
    ),
  };
}
const MACRO = ['Markets', 'Credit', 'Trade', 'Oil', 'Energy', 'Geopolitics', 'Rates', 'Regulation', 'Commodities'];
const TOPIC_WEIGHT: Record<string, number> = {
  Geopolitics: 24,
  Rates: 24,
  Oil: 22,
  AI: 20,
  Earnings: 16,
  Deals: 16,
  Semiconductors: 15,
  Trade: 15,
  Markets: 14,
  Credit: 13,
  Energy: 12,
  Crypto: 11,
  Regulation: 11,
  Defense: 11,
  Banks: 10,
  Healthcare: 9,
  Commodities: 10,
  Cloud: 10,
  Telecom: 8,
  Consumer: 8,
  Retail: 7,
  Automotive: 7,
  Media: 6,
  Launches: 4,
};
const TIER1 =
  /^(reuters|bloomberg|the wall street journal|wsj|financial times|cnbc|associated press|ap news|federal reserve|barron's|the economist|axios|politico)/i;
const TIER2 =
  /^(marketwatch|bbc|yahoo finance|fortune|business insider|the new york times|the washington post|investing\.com|seeking alpha|oilprice\.com|coindesk|the information|techcrunch|the verge|nikkei|south china morning post)/i;
const CHANNEL: Record<string, string> = {
  Oil: 'energy costs and inflation expectations',
  Geopolitics: 'supply disruption and risk premium',
  Rates: 'discount rates and financing costs',
  Credit: 'funding conditions',
  Trade: 'tariffs and supply chains',
  Markets: 'broad risk sentiment',
  Regulation: 'operating restrictions and compliance costs',
  Energy: 'input and power costs',
  Commodities: 'commodity-linked pricing',
};
/** Market importance independent of any client: topic weight, publisher tier, recency and breadth. */
const CLICKBAIT =
  /\b(could be|should you|is it time|stocks? to buy|reasons? to|best .{0,30} to buy|price prediction|forecast:|buy now|here's why|this stock|millionaire|beat the market|dividend yield is|(?:has |with )?(?:far )?greater upside|vs\.|motley fool)\b|\?$/i;
// Aggregators and promotional stock-picking sites rank below original reporting.
const LOW_TIER =
  /^(the motley fool|motley fool|24\/7 wall st|zacks|insider monkey|tipranks|benzinga|seeking alpha|ai insider|fxstreet|azernews|gurufocus|marketbeat|simply wall st|investorplace|nasdaq\.com)/i;
export function scoreArticle(a: Article, now: number = Date.now()): number {
  const bait = CLICKBAIT.test(a.title) ? -22 : 0;
  const topic = Math.max(0, ...a.topics.map((t) => TOPIC_WEIGHT[t] ?? 0));
  const tier = TIER1.test(a.publisher) ? 12 : TIER2.test(a.publisher) ? 8 : LOW_TIER.test(a.publisher) ? -10 : 4;
  const hours = Math.max(0, (now - Date.parse(a.publishedAt)) / 3600000);
  return bait + topic + tier + Math.max(0, 10 - hours * 0.6) + Math.min(6, a.topics.length * 1.5);
}
export function matchArticles(articles: Article[], h: Holding[], preferences: Preferences, now = Date.now()): Story[] {
  const symbols = new Set(h.map((x) => x.symbol));
  const interests = new Set([...preferences.sectors, ...h.flatMap((x) => COMPANIES[x.symbol]?.topics ?? [])]);
  const stories = articles.flatMap((a) => {
    if (/\b(nobel|obituary)\b/i.test(a.title)) return [];
    const direct = a.symbols.filter((s) => symbols.has(s));
    // Exposure graph: a story about a peer or supply-chain name is an indirect connection.
    const peerOf = h.filter(
      (x) =>
        !direct.includes(x.symbol) &&
        a.symbols.some((s) => COMPANIES[x.symbol]?.peers?.includes(s) || COMPANIES[s]?.peers?.includes(x.symbol)),
    );
    const macro = a.topics.some((t) => MACRO.includes(t));
    const industry = a.topics.filter((t) => interests.has(t));
    const watch = a.symbols.filter((s) => preferences.symbols.includes(s));
    if (
      !direct.length &&
      !peerOf.length &&
      !macro &&
      !industry.length &&
      !watch.length &&
      !a.topics.some((t) => (TOPIC_WEIGHT[t] ?? 0) >= 14)
    )
      return [];
    const sectorHolders = h.filter((x) => (COMPANIES[x.symbol]?.topics ?? []).some((t) => a.topics.includes(t)));
    const category: Story['category'] = direct.length
      ? 'company'
      : peerOf.length || industry.length
        ? 'industry'
        : 'macro';
    const channels = a.topics.flatMap((t) => CHANNEL[t] ?? []);
    const reason = direct.length
      ? 'Direct: mentions ' + direct.join(', ') + ', held in this client scope.'
      : peerOf.length
        ? 'Read-across: ' +
          a.symbols
            .filter((s) => !symbols.has(s))
            .slice(0, 3)
            .join(', ') +
          ' is a peer or supply-chain name for ' +
          [...new Set(peerOf.map((x) => x.symbol))].join(', ') +
          '.'
        : watch.length
          ? 'Matches your saved watchlist.'
          : industry.length
            ? 'Sector: ' +
              industry.slice(0, 2).join(' and ') +
              ' theme covers ' +
              [...new Set(sectorHolders.map((x) => x.symbol))].slice(0, 4).join(', ') +
              '.'
            : 'Market-moving: ' +
              (channels.slice(0, 2).join('; ') || 'broad risk sentiment') +
              '. Stock impact and direction are not established.';
    const matched = direct.length
      ? h.filter((x) => direct.includes(x.symbol)).map((x) => ({ x, why: 'Direct issuer match' }))
      : peerOf.length
        ? peerOf.map((x) => ({ x, why: 'Peer read-across' }))
        : sectorHolders.map((x) => ({ x, why: 'Sector connection' }));
    const importance = Math.round(scoreArticle(a, now));
    const score =
      importance + (direct.length ? 60 : peerOf.length ? 32 : industry.length ? 18 : 0) + (watch.length ? 15 : 0);
    return [
      {
        ...a,
        category,
        reason,
        matches: matched.map(({ x, why }) => ({
          clientId: x.clientId,
          client: x.client,
          symbol: x.symbol,
          direction: x.direction,
          reason: why,
        })),
        score: Math.round(score),
        importance,
      } as Story,
    ];
  });
  return stories.sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt)).slice(0, 90);
}
export async function getPreferences(db: Db, profileId: string): Promise<Preferences> {
  return db.asUser(profileId, async (q) => {
    const [r] = await q('select sectors,symbols,timezone from live_preferences where profile_id=$1', [profileId]);
    return {
      sectors: (r?.sectors as string[]) ?? [],
      symbols: (r?.symbols as string[]) ?? [],
      timezone: 'America/New_York',
    };
  });
}
function metricRows(rows: Record<string, unknown>[], date: string): Metric[] {
  return METRICS.map(([key, label, group, unit]) => {
    const r = rows.find((x) => x.metric === key);
    const dateOf = r ? day(r.observed_date) : null;
    const current = dateOf === date;
    return {
      key,
      label:
        key === 'WTI'
          ? 'WTI crude futures'
          : key === 'GOLD'
            ? 'Gold futures'
            : key === 'SILVER'
              ? 'Silver futures'
              : label,
      group,
      unit,
      value: r ? Number(r.value) : null,
      previous: r && r.previous != null ? Number(r.previous) : null,
      observedDate: dateOf,
      observedAt: r?.observed_at ? iso(r.observed_at) : null,
      fetchedAt: r?.fetched_at ? iso(r.fetched_at) : null,
      source: str(r?.source),
      url: str(r?.source_url),
      cadence: (r?.cadence as Metric['cadence']) ?? 'daily',
      note: current
        ? r!.cadence === 'daily'
          ? 'Today · daily observation'
          : 'Today · delayed quote'
        : r
          ? (r.cadence === 'daily'
              ? 'Latest daily observation · '
              : group === 'Equities'
                ? 'Previous close · '
                : 'Latest available quote · ') + dateOf
          : 'No verified observation is available.',
    };
  });
}
export async function makeReport(
  db: Db,
  profileId: string,
  clientId: string | null,
  now = new Date(),
): Promise<Omit<Report, 'id'>> {
  return db.asUser(profileId, async (q) => {
    const [p] = await q('select full_name from profiles where id=$1 and is_active', [profileId]);
    if (!p) throw new Error('PROFILE_UNAVAILABLE');
    const all = await holdings(q),
      h = clientId ? all.filter((x) => x.clientId === clientId) : all;
    if (clientId && !h.length) throw new Error('SCOPE_UNAVAILABLE');
    const date = businessDate(now);
    const [prefs] = await q('select * from live_preferences where profile_id=$1', [profileId]);
    const preferences = {
      sectors: (prefs?.sectors as string[]) ?? [],
      symbols: (prefs?.symbols as string[]) ?? [],
      timezone: 'America/New_York',
    };
    const rows = await q(
      'select distinct on(metric) * from live_observations where observed_date<=$1 order by metric,observed_date desc,fetched_at desc',
      [date],
    );
    const events = await q(
      "select * from live_articles where status='verified' and event_date=$1 and published_at<=$2 order by published_at desc limit 700",
      [date, now.toISOString()],
    );
    const articles: Article[] = events.map((r) => ({
      id: String(r.id),
      url: String(r.url),
      title: String(r.title),
      publisher: String(r.publisher),
      publishedAt: iso(r.published_at),
      eventDate: day(r.event_date),
      verifiedAt: iso(r.verified_at),
      evidenceHash: String(r.evidence_hash),
      symbols: r.symbols as string[],
      topics: r.topics as string[],
      excerpt: String(r.excerpt),
      summaryTemplate: str(r.summary_template),
      verification: String(r.verification),
    }));
    const checks = await q('select * from live_source_checks order by source_key');
    return {
      profileId,
      salesperson: String(p.full_name),
      clientId,
      clientName: clientId ? h[0].client : 'All my clients',
      businessDate: date,
      cutoff: now.toISOString(),
      coverageHash: hash(all),
      holdings: h,
      metrics: metricRows(rows, date),
      articles: matchArticles(articles, h, preferences, now.getTime()),
      desk: await latestDesk(q, date),
      sources: checks.map((r) => ({
        key: String(r.source_key),
        at: iso(r.checked_at),
        ok: Boolean(r.succeeded),
        accepted: Number(r.accepted),
        detail: String(r.detail),
      })),
      preferences,
      coverage: [...new Set(h.map((x) => x.symbol))].sort(),
    };
  });
}
/**
 * Publishes every sales person's views, or one person's for an interactive refresh. Scopes are built four at a time;
 * deskMs bounds the desk model call so a refresh finishes inside its function limit.
 */
export async function publishReports(
  db: Db,
  now = new Date(),
  opts: { profileId?: string; deskMs?: number } = {},
): Promise<number> {
  await prepareDesk(db, now, opts.deskMs).catch(() => console.warn('[desk] note_unavailable'));
  const people = await db.asService((q) =>
    q<{ id: string }>(
      "select id from profiles where is_active and role='sales' and ($1::uuid is null or id=$1::uuid) and exists(select 1 from live_coverage c join live_clients l on l.id=c.client_id where c.profile_id=profiles.id and l.active)",
      [opts.profileId ?? null],
    ),
  );
  let count = 0;
  const publish = async (profileId: string, clientId: string | null) => {
    const report = await makeReport(db, profileId, clientId, now);
    const fingerprint = hash({ ...report, cutoff: undefined });
    await db.asService(async (q) => {
      const [active] = await q('select 1 from profiles where id=$1 and is_active', [profileId]);
      if (!active) throw new Error('PROFILE_UNAVAILABLE');
      await q(
        'insert into live_reports(profile_id,scope_client,input_client_ids,business_date,cutoff,coverage_hash,fingerprint,payload) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict(profile_id,fingerprint) do nothing',
        [
          profileId,
          clientId,
          [...new Set(report.holdings.map((x) => x.clientId))],
          report.businessDate,
          report.cutoff,
          report.coverageHash,
          fingerprint,
          JSON.stringify(report),
        ],
      );
    });
    count++;
  };
  for (const p of people) {
    const coverage = await getCoverage(db, p.id),
      scopes = [null, ...coverage.clients.map((x) => x.id)];
    for (let i = 0; i < scopes.length; i += 4) await Promise.all(scopes.slice(i, i + 4).map((c) => publish(p.id, c)));
  }
  return count;
}
/**
 * The market note is written from the whole day's public evidence, while a person's brief keeps only the stories
 * matched to their book. A source the note cites outside that list is looked up here, so every cited item still
 * names and links its publisher. Public evidence only, read under the person's own access.
 */
async function citeDesk(q: Q, report: Report | null): Promise<Report | null> {
  const desk = report?.desk;
  if (!report || !desk) return report;
  const have = new Set(report.articles.map((a) => a.id));
  const missing = [
    ...new Set([...desk.keyEvents, ...desk.sections].flatMap((x) => x.storyIds).filter((id) => !have.has(id))),
  ].filter(validId);
  if (!missing.length) return report;
  const rows = await q(
    "select id,url,title,publisher,published_at from live_articles where status='verified' and id=any($1::uuid[])",
    [missing],
  );
  return {
    ...report,
    desk: {
      ...desk,
      cited: rows.map((r) => ({
        id: String(r.id),
        url: String(r.url),
        title: String(r.title),
        publisher: String(r.publisher),
        publishedAt: iso(r.published_at),
      })),
    },
  };
}
export async function getReport(
  db: Db,
  profileId: string,
  clientId: string | null,
  reportId?: string,
  now = new Date(),
): Promise<Report | null> {
  if ((clientId && !validId(clientId)) || (reportId && !validId(reportId))) return null;
  const c = await getCoverage(db, profileId);
  const [prefs, focus] = await Promise.all([getPreferences(db, profileId), focusFor(db, profileId, c)]);
  return db.asUser(profileId, async (q) => {
    const rows = reportId
      ? await q('select id,payload from live_reports where id=$1 and profile_id=$2', [reportId, profileId])
      : await q(
          'select id,payload from live_reports where profile_id=$1 and scope_client is not distinct from $2::uuid and business_date=$3 and coverage_hash=$4 order by created_at desc limit 1',
          [profileId, clientId, businessDate(now), c.hash],
        );
    const r = rows[0];
    if (!r) return null;
    const payload = r.payload as Omit<Report, 'id'>;
    if (payload.coverageHash !== c.hash || hash(payload.preferences) !== hash(prefs) || payload.clientId !== clientId)
      return null;
    return citeDesk(q, focusReport({ ...payload, id: String(r.id) }, focus));
  });
}
export type HistoryEntry = { id: string; businessDate: string; cutoff: string; stories: number };
export const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));
/**
 * A past day's brief exactly as published, for the history view. Unlike today's brief it is not revoked when the book
 * or preferences change; it is narrowed to the clients the person still covers, so revoked access stays revoked.
 */
export async function getArchivedReport(
  db: Db,
  profileId: string,
  clientId: string | null,
  reportId: string,
  now = new Date(),
): Promise<Report | null> {
  if (!validId(reportId) || (clientId && !validId(clientId))) return null;
  // The saved brief and the current book are independent reads, so they load together.
  const [[row], book] = await Promise.all([
    db.asUser(profileId, (q) =>
      q(
        'select id,payload from live_reports where id=$1 and profile_id=$2 and scope_client is not distinct from $3::uuid and business_date<$4',
        [reportId, profileId, clientId, businessDate(now)],
      ),
    ),
    getCoverage(db, profileId),
  ]);
  if (!row) return null;
  const payload = { ...(row.payload as Omit<Report, 'id'>), id: String(row.id), archived: true } as Report;
  if (payload.clientId !== clientId) return null;
  // A day whose final brief was published before its wrap was ready still shows the wrap saved for that day.
  const covered = new Set(book.clients.map((c) => c.id)),
    held = [...new Set(payload.holdings.map((h) => h.clientId))];
  // A client retired from the book since then stays in the snapshot; only revoked coverage is narrowed away.
  const [retired, focus, desk] = await Promise.all([
    db.asUser(profileId, (q) => q('select cid from unnest($1::uuid[]) cid where app.client_retired(cid)', [held])),
    focusFor(db, profileId, book),
    payload.desk ? null : db.asUser(profileId, (q) => latestDesk(q, payload.businessDate)),
  ]);
  if (!payload.desk) payload.desk = desk;
  for (const r of retired) covered.add(String(r.cid));
  const cite = (r: Report | null) => (r ? db.asUser(profileId, (q) => citeDesk(q, r)) : null);
  if (held.every((c) => covered.has(c))) return cite(focusReport(payload, focus));
  if (clientId) return null;
  const narrowed = narrowReport(
    payload,
    held.filter((c) => covered.has(c)),
  );
  return narrowed ? cite(focusReport({ ...narrowed, clientName: payload.clientName }, focus)) : null;
}
/** The final published brief for one past business day and client scope. */
export async function getDayReport(
  db: Db,
  profileId: string,
  clientId: string | null,
  date: string,
  now = new Date(),
): Promise<Report | null> {
  if (!validDay(date) || (clientId && !validId(clientId))) return null;
  const [row] = await db.asUser(profileId, (q) =>
    q(
      'select id from live_reports where profile_id=$1 and scope_client is not distinct from $2::uuid and business_date=$3 order by created_at desc limit 1',
      [profileId, clientId, date],
    ),
  );
  return row ? getArchivedReport(db, profileId, clientId, String(row.id), now) : null;
}
/** Past business days with a published brief for this scope, newest first: one entry (the final version) per day. */
export async function listHistory(
  db: Db,
  profileId: string,
  clientId: string | null,
  now = new Date(),
  limit = 60,
): Promise<HistoryEntry[]> {
  if (clientId && !validId(clientId)) return [];
  const rows = await db.asUser(profileId, (q) =>
    q(
      // One newest-version lookup per day, so the access check and the story count run once a day, not once a version.
      "select r.id,r.business_date,r.cutoff,r.n from (select ($3::date-g)::date d from generate_series(1,$4::int*2) g) days cross join lateral (select id,business_date,cutoff,jsonb_array_length(coalesce(payload->'articles','[]'::jsonb)) n from live_reports where profile_id=$1 and scope_client is not distinct from $2::uuid and business_date=days.d order by created_at desc limit 1) r order by r.business_date desc limit $4",
      [profileId, clientId, businessDate(now), limit],
    ),
  );
  return rows.map((r) => ({
    id: String(r.id),
    businessDate: day(r.business_date),
    cutoff: iso(r.cutoff),
    stories: Number(r.n),
  }));
}
/** Any version the person may open: today's under the live checks, otherwise an archived snapshot. */
export async function getReportVersion(
  db: Db,
  profileId: string,
  clientId: string | null,
  reportId: string,
  now = new Date(),
): Promise<Report | null> {
  const live = await getReport(db, profileId, clientId, reportId, now);
  return live && live.businessDate === businessDate(now)
    ? live
    : getArchivedReport(db, profileId, clientId, reportId, now);
}
export { parseFilters, filterStories, formatMetric, metricChange } from './presentation';
/** Narrow an all-clients report to a chosen set of clients: their holdings, and story links to them only. */
export function narrowReport(report: Report, clientIds: string[]): Report | null {
  const keep = new Set(clientIds);
  const holdings = report.holdings.filter((h) => keep.has(h.clientId));
  if (!holdings.length) return null;
  const articles = report.articles
    .map((a) => ({ ...a, matches: a.matches.filter((m) => keep.has(m.clientId)) }))
    .filter((a) => a.category === 'macro' || a.matches.length);
  const names = [...new Set(holdings.map((h) => h.client))];
  return {
    ...report,
    holdings,
    articles,
    coverage: [...new Set(holdings.map((h) => h.symbol))].sort(),
    clientName: names.length === 1 ? names[0] : names.length + ' selected clients',
  };
}
