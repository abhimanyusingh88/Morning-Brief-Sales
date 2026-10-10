/**
 * "Today in one line" and the Catalysts section (spec 3.3, pipeline step 5:00 AM).
 *
 * Written from the day's actual inputs: futures, rates, Fed calendar, commodities, breadth and positioning, plus the
 * overnight headline flow. The writer (model or template) only ever sees fact keys and plain-word hints, never a
 * number; code substitutes the values. Every string passes the same validator as the call cards before it is stored.
 */
import { cachedCompleter } from '../ai/cache';
import { mask } from '../ai/context';
import type { Fact } from '../ai/facts';
import { complete as realComplete, LlmUnavailable, modelName, type Completion } from '../ai/gateway';
import { RULES, factLine, str, strs, tryJson, type Completer, type WriteRecord } from '../ai/llm-writer';
import { validateText } from '../ai/validator';
import type { Db } from '../db/types';
import type { Universal } from './build';

export interface Narrative {
  oneLine: string;
  /** themed in a fixed order; a theme with no data is absent */
  paragraphs: { theme: string; body: string; generator: 'llm' | 'template' }[];
  generator: 'llm' | 'hybrid' | 'template';
  record: WriteRecord | null;
  inputKeys: string[];
}

const t = (k: string) => `{{${k}}}`;

/** Headline flow as facts, so the narrative can refer to what is moving the tape without the writer typing figures. */
function storyKeys(u: Universal): { key: string; hint: string }[] {
  const items = u.events
    .filter((e) => e.feedKey === 'news_agg' && e.businessDate === u.businessDate && e.severity >= 2)
    .sort((a, b) => b.severity - a.severity || a.occurredAt.localeCompare(b.occurredAt))
    .slice(0, 4);
  return items.map((e, n) => {
    const key = `sp.story.${n}`;
    if (!u.fb.has(key))
      u.fb.add({
        key,
        label: 'Overnight headline',
        value: null,
        display: e.title,
        unit: 'text',
        source: e.source,
        asOf: e.occurredAt,
        feedKey: 'news_agg',
      });
    return { key, hint: mask(e.title) };
  });
}

const has = (u: Universal, ...ks: string[]) => ks.every((k) => u.fb.has(k));
const dirOf = (u: Universal, k: string) => ((u.fb.get(k)?.value ?? 0) >= 0 ? 'higher' : 'lower');

const THEMES = ['futures', 'rates', 'fed', 'commodities', 'breadth'] as const;
type Theme = (typeof THEMES)[number];

function templateParagraph(u: Universal, theme: Theme, stories: { key: string }[]): string | null {
  switch (theme) {
    case 'futures': {
      if (!has(u, 'fut.spx')) return null;
      const d = dirOf(u, 'fut.spx');
      return `US index futures are pointing ${d} this morning: the large-cap index is indicated ${t('fut.spx')} against fair value${has(u, 'fut.ndx') ? `, tech-growth ${t('fut.ndx')}` : ''}${has(u, 'fut.rty') ? ` and small caps ${t('fut.rty')}` : ''}.${stories[0] ? ` The overnight tape is led by a headline worth knowing: ${t(stories[0].key)}.` : ''}`;
    }
    case 'rates': {
      if (!has(u, 'sp.UST10Y.lvl', 'sp.UST10Y.sub')) return null;
      const hy = has(u, 'sp.CDXHY.lvl', 'sp.CDXHY.sub')
        ? ` High-yield credit sits at ${t('sp.CDXHY.lvl')}, ${t('sp.CDXHY.sub')}, which is the read-through to risk appetite.`
        : '';
      return `Rates are the main driver for most books. The ${t('sp.UST10Y.name')} is ${t('sp.UST10Y.lvl')}, ${t('sp.UST10Y.sub')}${has(u, 'sp.UST2Y.lvl') ? `, and the ${t('sp.UST2Y.name')} is ${t('sp.UST2Y.lvl')}, ${t('sp.UST2Y.sub')}` : ''}. Duration-sensitive and growth names are the ones to watch on any client call.${hy}`;
    }
    case 'fed': {
      const sp = has(u, 'sp.fed.s0.title', 'sp.fed.s0.time') ? `${t('sp.fed.s0.title')}, ${t('sp.fed.s0.time')}. ` : '';
      const odds = has(u, 'fed.hold_odds', 'fed.next_fomc')
        ? `Markets are pricing ${t('fed.hold_odds')} odds of a hold at the ${t('fed.next_fomc')} meeting.`
        : '';
      return sp || odds ? `On the policy calendar: ${sp}${odds}`.trim() : null;
    }
    case 'commodities': {
      if (!has(u, 'sp.WTI.lvl', 'sp.WTI.sub')) return null;
      const g = has(u, 'sp.XAU.lvl', 'sp.XAU.sub') ? ` Gold is ${t('sp.XAU.lvl')}, ${t('sp.XAU.sub')}.` : '';
      const st = stories.find((s) => s.key !== stories[0]?.key);
      return `Crude is ${t('sp.WTI.lvl')}, ${t('sp.WTI.sub')} from the prior close.${g}${st ? ` Headline flow to keep in view: ${t(st.key)}.` : ''}`;
    }
    case 'breadth': {
      const bits: string[] = [];
      if (has(u, 'breadth.up_share')) bits.push(`${t('breadth.up_share')} of index members are indicated higher`);
      if (has(u, 'breadth.top_share'))
        bits.push(`${t('breadth.top_share')} of the index move comes from the largest names`);
      const vix = has(u, 'sp.VIX.lvl', 'sp.VIX.sub')
        ? ` The ${t('sp.VIX.name')} is ${t('sp.VIX.lvl')}, ${t('sp.VIX.sub')}${has(u, 'sent.putcall') ? `, and the put/call ratio is ${t('sent.putcall')}` : ''}.`
        : '';
      if (!bits.length && !vix) return null;
      return `${bits.length ? `Breadth and positioning: ${bits.join(', while ')}.` : ''}${vix}`.trim();
    }
  }
}

export function templateNarrative(u: Universal): Narrative {
  const stories = storyKeys(u);
  const paragraphs = THEMES.flatMap((th) => {
    const body = templateParagraph(u, th, stories);
    return body ? [{ theme: th as string, body, generator: 'template' as const }] : [];
  });
  const lead = has(u, 'fut.spx')
    ? `US futures are ${dirOf(u, 'fut.spx')} (${t('fut.spx')} for the large-cap index)`
    : 'Markets open with limited futures data';
  const rate = has(u, 'sp.UST10Y.lvl') ? ` while the ${t('sp.UST10Y.name')} sits at ${t('sp.UST10Y.lvl')}` : '';
  const fed = has(u, 'sp.fed.s0.title') ? `, with ${t('sp.fed.s0.title')} on the calendar` : '';
  return { oneLine: `${lead}${rate}${fed}.`, paragraphs, generator: 'template', record: null, inputKeys: [] };
}

const SYSTEM_EXTRA = `You are writing the Catalysts section of a pre-market brief, in the voice of a sell-side desk morning macro note: analytical, specific, plain. Five themed paragraphs in this order: futures, rates, fed, commodities, breadth. Each is two to four sentences. Say why things are moving and what it means for a salesperson's client calls. Skip a theme if no facts for it are listed. The one-line summary is a single sentence, under thirty words, that a trader could read in five seconds. Headline text provided is context only; refer to it with its {{key}} token when you want it displayed.`;

export interface NarrativeDeps {
  complete?: Completer;
  db?: Db;
  bypassCache?: boolean;
}

export async function writeNarrative(u: Universal, forbidden: string[], deps: NarrativeDeps = {}): Promise<Narrative> {
  const base = templateNarrative(u);
  const stories = storyKeys(u);
  const inputs: Fact[] = [...new Set([...u.narrative.map((n) => n.key), ...stories.map((s) => s.key)])]
    .map((k) => u.fb.get(k))
    .filter((f): f is Fact => Boolean(f));
  const allowed = new Set(inputs.map((f) => f.key));
  base.inputKeys = [...allowed];
  const run: Completer =
    deps.complete ?? (deps.db ? cachedCompleter(deps.db, { bypass: deps.bypassCache }) : realComplete);

  const rec: WriteRecord = {
    target: 'catalysts',
    provider: 'openai',
    model: modelName(),
    status: 'failed',
    attempts: 0,
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
    validation: {},
  };
  const groupOf = new Map(u.narrative.map((n) => [n.key, n.group]));
  const system = `${RULES}\n\n${SYSTEM_EXTRA}\n\nFacts you may reference as {{key}}:\n${inputs.map((f) => `${factLine(f)} [${groupOf.get(f.key) ?? 'headline'}]`).join('\n')}`;
  const themes = base.paragraphs.map((p) => p.theme);
  const user = JSON.stringify({
    task: "Write today's one-line summary and the Catalysts paragraphs.",
    themes,
    headlinesForContext: stories.map((s) => ({ key: s.key, gist: s.hint })),
    baselineDraft: {
      oneLine: base.oneLine,
      paragraphs: Object.fromEntries(base.paragraphs.map((p) => [p.theme, p.body])),
    },
    outputShape: { oneLine: 'string', paragraphs: Object.fromEntries(themes.map((th) => [th, 'string'])) },
    note: 'Improve on the baseline: explain the why behind the moves in desk voice. Do not invent facts that are not listed.',
  });

  const got: { oneLine?: string; paragraphs: Record<string, string> } = { paragraphs: {} };
  let feedback = '';
  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    rec.attempts = attempt;
    let res: Completion;
    try {
      res = await run({ system, user: user + feedback, json: true, maxTokens: 2200 });
    } catch (e) {
      rec.validation = { error: e instanceof LlmUnavailable ? e.message : e instanceof Error ? e.message : String(e) };
      rec.status = 'failed';
      return base;
    }
    rec.model = res.model;
    rec.promptTokens = (rec.promptTokens ?? 0) + (res.promptTokens ?? 0);
    rec.completionTokens = (rec.completionTokens ?? 0) + (res.completionTokens ?? 0);
    rec.latencyMs = (rec.latencyMs ?? 0) + res.latencyMs;
    const raw = tryJson(res.text);
    const errors: string[] = [];
    if (!raw) errors.push('not_json');
    else {
      const chk = (name: string, text: string, max: number) => {
        const r = validateText(text, { allowedKeys: allowed, forbiddenTerms: forbidden, maxLength: max });
        if (!r.ok) errors.push(...r.errors.map((e) => `${name}: ${e}`));
        return r.ok;
      };
      if (!got.oneLine && chk('oneLine', str(raw.oneLine), 260)) got.oneLine = str(raw.oneLine);
      const para = (raw.paragraphs && typeof raw.paragraphs === 'object' ? raw.paragraphs : {}) as Record<
        string,
        unknown
      >;
      for (const th of themes)
        if (!(th in got.paragraphs) && chk(th, str(para[th]), 760)) got.paragraphs[th] = str(para[th]);
      void strs;
    }
    lastErrors = errors;
    if (!errors.length) {
      rec.status = attempt === 1 ? 'accepted' : 'repaired';
      break;
    }
    feedback = `\n\nYour previous answer was rejected by the validator: ${errors.slice(0, 8).join('; ')}. Rewrite the whole JSON with every number as a {{key}} token from the list and no digits, number words or symbols anywhere else.`;
  }
  if (lastErrors.length) rec.status = 'fallback';
  rec.validation = {
    errors: lastErrors.slice(0, 12),
    kept: [...(got.oneLine ? ['oneLine'] : []), ...Object.keys(got.paragraphs)],
  };

  const paragraphs = base.paragraphs.map((p) =>
    got.paragraphs[p.theme] ? { ...p, body: got.paragraphs[p.theme], generator: 'llm' as const } : p,
  );
  const llmCount = paragraphs.filter((p) => p.generator === 'llm').length + (got.oneLine ? 1 : 0);
  return {
    oneLine: got.oneLine ?? base.oneLine,
    paragraphs,
    record: rec,
    inputKeys: base.inputKeys,
    generator: llmCount === 0 ? 'template' : llmCount === paragraphs.length + 1 ? 'llm' : 'hybrid',
  };
}

/** The Catalysts section, ready to store: paragraphs joined by blank lines. */
export function narrativeSection(n: Narrative) {
  return {
    kind: 'catalysts' as const,
    title: 'Catalysts',
    status: 'ok' as const,
    generator: n.generator,
    template: n.paragraphs.map((p) => p.body).join('\n\n'),
    data: {
      oneLine: n.oneLine,
      paragraphs: n.paragraphs.map((p) => ({ theme: p.theme, body: p.body, generator: p.generator })),
    },
    feeds: ['mkt_snapshot', 'futures_rates', 'fed_cal', 'news_agg', 'sector_perf'],
  };
}
