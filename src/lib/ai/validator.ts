import { TOKEN_RE } from './facts';

/**
 * The guardrail behind the product promise: a model may write prose, but every number on screen
 * comes from a fact. This runs on every generated string before it can be stored or shown.
 * Do not loosen it to make a test pass.
 */
export interface ValidationOptions {
  allowedKeys: Set<string>;
  /** names/tickers that must never appear (restricted list, information barrier) */
  forbiddenTerms?: string[];
  maxLength?: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  tokens: string[];
}

const NUMBER_WORDS =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|dozen|dozens|double|doubled|triple|tripled|half|halved)\b/i;
const ONE_QUANTITY =
  /\bone[\s-]+(basis|percent|per\s?cent|bp|bps|point|points|day|week|month|year|hundred|thousand|million|billion)\b/i;
const SYMBOLS = /[%$€£¥]|\bbps?\b|\bbasis points?\b(?!\s*$)/i;
const ADVICE =
  /\b(guarantee[ds]?|risk[- ]free|can'?t lose|sure thing|will (?:definitely )?(?:rise|fall|rally|outperform|underperform|rebound)|must (?:buy|sell)|should (?:buy|sell)|insider|non[- ]?public|material information)\b/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function validateText(text: string, opts: ValidationOptions): ValidationResult {
  const errors: string[] = [];
  const tokens: string[] = [];

  if (!text || !text.trim()) errors.push('empty');
  if (opts.maxLength && text.length > opts.maxLength) errors.push(`too_long:${text.length}`);

  // 1. tokens must come from the allowed list
  for (const m of text.matchAll(TOKEN_RE)) {
    tokens.push(m[1]);
    if (!opts.allowedKeys.has(m[1])) errors.push(`unknown_token:${m[1]}`);
  }

  // 2. everything outside tokens must be free of numbers, number words and unit symbols
  const bare = text.replace(TOKEN_RE, ' ');
  if (/\{\{|\}\}/.test(bare)) errors.push('malformed_token');
  if (/\p{N}/u.test(bare)) errors.push('digit_outside_token'); // any Unicode number: ASCII, full-width, Arabic-Indic, fractions
  const nw = bare.match(NUMBER_WORDS);
  if (nw) errors.push(`number_word:${nw[0].toLowerCase()}`);
  if (ONE_QUANTITY.test(bare)) errors.push('number_word:one');
  const sym = bare.match(/[%$€£¥]/);
  if (sym) errors.push(`symbol_outside_token:${sym[0]}`);
  if (/\bbps?\b/i.test(bare)) errors.push('unit_outside_token:bp');

  // 3. information barrier: restricted names never appear in model-written text
  for (const term of opts.forbiddenTerms ?? []) {
    if (term && new RegExp(`\\b${escapeRe(term)}\\b`, 'i').test(bare)) errors.push(`forbidden_term:${term}`);
  }

  // 4. no guarantees, no advice that reads as a recommendation, no hints of non-public information
  const adv = bare.match(ADVICE);
  if (adv) errors.push(`advice:${adv[0].toLowerCase()}`);

  void SYMBOLS;
  return { ok: errors.length === 0, errors, tokens };
}

export function validateAll(items: string[], opts: ValidationOptions): ValidationResult {
  const merged: ValidationResult = { ok: true, errors: [], tokens: [] };
  items.forEach((t, i) => {
    const r = validateText(t, opts);
    if (!r.ok) merged.ok = false;
    merged.errors.push(...r.errors.map((e) => `[${i}] ${e}`));
    merged.tokens.push(...r.tokens);
  });
  return merged;
}
