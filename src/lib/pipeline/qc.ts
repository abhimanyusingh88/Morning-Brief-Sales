/**
 * QC review (spec section 5: 05:30 to 06:00). Two layers:
 *  - automated checks on every brief, each recorded with its result so the audit trail shows what was verified;
 *  - a human spot-check of a sample. In this proof of concept the reviewer is simulated and the console lets a real
 *    reviewer hold or release a brief; held briefs are never published or delivered.
 */
import { createHash } from 'node:crypto';
import type { FactBook } from '../ai/facts';
import { TOKEN_RE } from '../ai/facts';
import { validateText } from '../ai/validator';
import type { BuiltSection, FeedHealth } from '../brief/build';
import { INCLUDE_TOGGLES, type BriefPrefs } from '../brief/spec';
import { SECTION_FEEDS } from '../feeds/registry';

export interface QcCheck {
  name: string;
  label: string;
  ok: boolean;
  detail: string;
}
export interface QcSubject {
  profileId: string;
  name: string;
  facts: FactBook;
  sections: BuiltSection[];
  prefs: BriefPrefs;
  forbidden: string[];
  health: FeedHealth;
  cardText: string[];
}

export const UNIVERSAL_KINDS = ['snapshot', 'chart', 'catalysts', 'sector_lead_lag'] as const;
export const universalHash = (sections: BuiltSection[]) =>
  createHash('sha1')
    .update(
      JSON.stringify(
        UNIVERSAL_KINDS.map((k) => {
          const s = sections.find((x) => x.kind === k);
          return s ? [k, s.status, s.template, s.data] : [k];
        }),
      ),
    )
    .digest('hex');

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function automatedChecks(s: QcSubject, reference: string): QcCheck[] {
  const checks: QcCheck[] = [];
  const present = s.sections.filter((x) => x.status === 'ok');
  const templates = present.flatMap((x) => (x.template ? [x.template] : []));
  const allowed = new Set(s.facts.keys());

  // 1. every figure traces to a feed and a timestamp
  const tokens = templates.flatMap((t) => [...t.matchAll(TOKEN_RE)].map((m) => m[1]));
  const untraceable = [...new Set(tokens)].filter((k) => {
    const f = s.facts.get(k);
    return !f || !f.source || !f.asOf;
  });
  const noFeed = [...new Set(tokens)].filter((k) => {
    const f = s.facts.get(k);
    return f && !f.feedKey && !/^(bk|fl|rk|brief|c\d)/.test(k) && !/^(nm|mv|lv|ev|cal)\./.test(k);
  });
  checks.push({
    name: 'traceable',
    label: 'Every figure traces to a source feed and timestamp',
    ok: untraceable.length === 0 && noFeed.length === 0,
    detail: `${new Set(tokens).size} figures checked${untraceable.length ? `; no source: ${untraceable.slice(0, 3).join(', ')}` : ''}${noFeed.length ? `; no feed: ${noFeed.slice(0, 3).join(', ')}` : ''}`,
  });

  // 2. nothing numeric outside a fact token, no unknown tokens
  const bad = templates.map((t) => validateText(t, { allowedKeys: allowed })).filter((r) => !r.ok);
  checks.push({
    name: 'no_free_numbers',
    label: 'No number outside a fact token (validator)',
    ok: bad.length === 0,
    detail: bad.length ? bad[0].errors.slice(0, 2).join('; ') : `${templates.length} sections and paragraphs validated`,
  });

  // 3. information barrier
  const rendered = [
    ...present.map((x) => (x.template ? s.facts.render(x.template) : '')),
    ...s.cardText.map((t) => s.facts.render(t)),
  ].join('\n');
  const leak = s.forbidden.filter((t) => t && new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(rendered));
  checks.push({
    name: 'information_barrier',
    label: 'No restricted-list name appears anywhere',
    ok: leak.length === 0,
    detail: leak.length ? `${leak.length} restricted terms found` : `${s.forbidden.length} restricted terms screened`,
  });

  // 4. the brief honours the saved setup
  const kindOf: Record<string, string> = Object.fromEntries(INCLUDE_TOGGLES.map((t) => [t.section, t.key]));
  const offButPresent = present
    .filter(
      (x) =>
        kindOf[x.kind] &&
        s.prefs.include[kindOf[x.kind] as keyof BriefPrefs['include']] === false &&
        !['overnight'].includes(x.kind),
    )
    .map((x) => x.kind);
  const movers = present.find((x) => x.kind === 'movers');
  const moverSectors = movers
    ? (movers.data.leaders as { sector: string }[]).concat(movers.data.laggards as { sector: string }[])
    : [];
  const outside = moverSectors.filter((m) => !s.prefs.sectors.includes(m.sector as never));
  checks.push({
    name: 'setup_honoured',
    label: 'Sections and sectors match the saved setup',
    ok: offButPresent.length === 0 && outside.length === 0,
    detail:
      offButPresent.length || outside.length
        ? `unexpected: ${[...offButPresent, ...outside.map((o) => o.sector)].join(', ')}`
        : `${s.prefs.sectors.length} sectors, ${s.prefs.products.length} products, ${present.length} sections`,
  });

  // 5. universal sections identical for everyone
  checks.push({
    name: 'universal_identical',
    label: 'Universal sections identical across users',
    ok: universalHash(s.sections) === reference,
    detail:
      universalHash(s.sections) === reference
        ? 'snapshot, chart, catalysts and sector table match the reference'
        : 'differs from the reference brief',
  });

  // 6. data not fit for use is withheld, not shown stale
  const wrong = s.sections
    .filter(
      (x) => x.status === 'ok' && (SECTION_FEEDS[x.kind]?.required ?? []).some((f) => (s.health[f] ?? 'ok') !== 'ok'),
    )
    .map((x) => x.kind);
  const withheld = s.sections.filter((x) => x.status === 'unavailable').length;
  checks.push({
    name: 'stale_withheld',
    label: 'Stale or missing data withheld with a note',
    ok: wrong.length === 0,
    detail: wrong.length
      ? `shown despite feed problem: ${wrong.join(', ')}`
      : withheld
        ? `${withheld} section${withheld > 1 ? 's' : ''} withheld: data temporarily unavailable`
        : 'all required feeds healthy',
  });

  // 7. units: equity index moves in bp, yields in bp, percent for stocks, sectors and commodities
  const spx = s.facts.get('sp.SPX.sub');
  const unitsOk = !spx || /bp$/.test(spx.display);
  checks.push({
    name: 'units',
    label: 'Units consistent (index moves in bp)',
    ok: unitsOk,
    detail: spx ? `S&P 500 change shown as ${spx.display}` : 'snapshot withheld',
  });

  // 8. no empty personalised boxes
  const empty = s.sections.filter((x) => x.status === 'ok' && !x.template.trim()).map((x) => x.kind);
  checks.push({
    name: 'no_empty_sections',
    label: 'No empty sections',
    ok: empty.length === 0,
    detail: empty.length ? `empty: ${empty.join(', ')}` : `${present.length} sections, all with content`,
  });
  return checks;
}

/** Deterministic sample: the same briefs are picked on a rerun, so a demo is repeatable. */
export function pickSample<T extends { profileId: string }>(items: T[], share = 0.25, min = 3): T[] {
  const n = Math.min(items.length, Math.max(min, Math.ceil(items.length * share)));
  return [...items]
    .sort((a, b) =>
      createHash('md5')
        .update(a.profileId)
        .digest('hex')
        .localeCompare(createHash('md5').update(b.profileId).digest('hex')),
    )
    .slice(0, n);
}

export interface SpotReview {
  status: 'passed' | 'flagged';
  reviewer: string;
  notes: string;
  checks: QcCheck[];
}
export const REVIEWER = 'Spot-check reviewer (simulated)';

/** The reviewer's checklist. A demo flag makes one reviewer find a problem so the hold-and-release path can be shown. */
export function simulatedSpotCheck(s: QcSubject, flag: boolean): SpotReview {
  const cat = s.sections.find((x) => x.kind === 'catalysts');
  const paras = ((cat?.data.paragraphs as { body: string }[]) ?? []).length;
  const checks: QcCheck[] = [
    {
      name: 'tone',
      label: 'Catalysts reads analytical, not advisory',
      ok: !flag,
      detail: flag
        ? 'paragraph three reads as a directional view; edit before release'
        : `${paras} paragraphs reviewed`,
    },
    {
      name: 'sourcing',
      label: 'Five sampled figures match their source feed',
      ok: true,
      detail: 'checked against the feed run record',
    },
    {
      name: 'relevance',
      label: "Content relevant to this person's sectors and products",
      ok: true,
      detail: `${s.prefs.sectors.join(', ')} · ${s.prefs.products.join(', ')}`,
    },
    { name: 'barrier', label: 'No restricted or client-sensitive content', ok: true, detail: 'none found' },
  ];
  return {
    status: flag ? 'flagged' : 'passed',
    reviewer: REVIEWER,
    notes: flag ? 'Held for edit: tone of the Catalysts narrative.' : 'Approved for release.',
    checks,
  };
}
