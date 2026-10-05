import type { CardContext } from "./context";
import type { Fact } from "./facts";
import { complete as realComplete, modelName, LlmUnavailable, type CompleteOptions, type Completion } from "./gateway";
import type { Prepared } from "./prepare";
import { templateBrief, templateCard, type BriefText, type CardText, type SectionText } from "./templates";
import { validateText } from "./validator";

export type Completer = (o: CompleteOptions) => Promise<Completion>;

export interface WriteRecord {
  target: string;
  provider: string;
  model: string;
  status: "accepted" | "repaired" | "fallback" | "failed";
  attempts: number;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  validation: Record<string, unknown>;
}

export type Generator = "llm" | "hybrid" | "template";

export const RULES = `You write for a salesperson on an institutional trading desk, in plain, specific, trader-to-trader language.
HARD RULES — output is machine-checked and rejected if any is broken:
1. You never write a digit, a number word (two, three, half, double...), a percent sign, a currency symbol or a unit such as bp. Every number, level, size, date and time comes from a fact token written exactly as {{fact_key}}. Use only the keys listed. Never invent a key.
2. Never make up facts: only use what is in the input. If something is not given, leave it out.
3. No recommendations to buy or sell, no predictions stated as certain, no guarantees, no hints of non-public information.
4. Do not mention any security, ticker or company that is not in the input.
5. Short sentences. No filler, no greetings except where asked, no emojis.
Return only a JSON object.`;

export const fenced = (s: string) => s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
export const tryJson = (s: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(fenced(s));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
export const strs = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : []);
export const str = (v: unknown): string => (typeof v === "string" ? v : "");

export const factLine = (f: Fact) => `- ${f.key}: ${f.label}${f.hint ? ` (${f.hint})` : ""}${f.unit === "text" ? " [text]" : ""}`;

/** ---------------------------------------------------------------- cards */

const LIMITS = { headline: 120, why: 460, point: 260, watch: 200 };

function cardPrompt(c: CardContext, p: Prepared, base: CardText) {
  const keys = new Set(c.keys);
  const facts = p.facts.all().filter((f) => keys.has(f.key));
  const user = JSON.stringify({
    task: "Write a call card: why call this client now, and what to say.",
    client: { name: c.clientName, segment: c.segment, tier: c.tier, mandate: c.mandate, contact: c.contactName ? `${c.contactName}, ${c.contactTitle}` : null },
    trigger: { kind: c.kind, label: c.label, urgency: c.urgency, direction: c.direction, sector: c.sector, secondaryReasons: c.secondary },
    events: c.events.map((e) => ({ title: `{{${e.titleKey}}}`, time: `{{${e.timeKey}}}`, summary: e.summary, scheduledRelease: e.calendar })),
    lastContact: c.lastContact ? { kind: c.lastContact.kind, subject: c.lastContact.subject, note: c.lastContact.note, when: `{{${c.lastContact.whenKey}}}` } : null,
    openFollowup: c.followupText ? { text: c.followupText, due: c.dueKey ? `{{${c.dueKey}}}` : null } : null,
    recentTrades: c.trades.map((t) => ({ instrument: `{{${t.nameKey}}}`, side: t.side, size: `{{${t.sizeKey}}}`, when: `{{${t.whenKey}}}` })),
    interests: c.interests,
    baselineDraft: base,
    factsYouMayUse: "see list",
    outputShape: { headline: "string, under 12 words", why: "string, two to three sentences", talkingPoints: "array of 3 or 4 strings, each a thing to say or ask", watchOuts: "array of 1 to 3 strings, cautions" },
    note: "Figures in the CRM notes were removed on purpose; refer to them in words only. Improve on the baseline draft: use the relationship history to make the talking points specific.",
  });
  return { system: `${RULES}\n\nFacts you may reference as {{key}}:\n${facts.map(factLine).join("\n")}`, user, allowed: keys };
}

function checkCard(raw: Record<string, unknown> | null, allowed: Set<string>, forbidden: string[]) {
  const errors: string[] = [];
  const out: Partial<CardText> = {};
  const opts = (max: number) => ({ allowedKeys: allowed, forbiddenTerms: forbidden, maxLength: max });
  const check = (name: string, text: string, max: number) => {
    const r = validateText(text, opts(max));
    if (!r.ok) errors.push(...r.errors.map((e) => `${name}: ${e}`));
    return r.ok;
  };
  if (!raw) return { out, errors: ["not_json"], ok: { headline: false, why: false, talkingPoints: false, watchOuts: false } };
  const ok = { headline: false, why: false, talkingPoints: false, watchOuts: false };
  const h = str(raw.headline), w = str(raw.why);
  if (check("headline", h, LIMITS.headline)) { out.headline = h; ok.headline = true; }
  if (check("why", w, LIMITS.why)) { out.why = w; ok.why = true; }
  const tp = strs(raw.talkingPoints, 4);
  if (tp.length >= 2 && tp.map((x, i) => check(`talkingPoints[${i}]`, x, LIMITS.point)).every(Boolean)) { out.talkingPoints = tp; ok.talkingPoints = true; }
  else if (tp.length < 2) errors.push("talkingPoints: too_few");
  const wo = strs(raw.watchOuts, 3);
  if (wo.length >= 1 && wo.map((x, i) => check(`watchOuts[${i}]`, x, LIMITS.watch)).every(Boolean)) { out.watchOuts = wo; ok.watchOuts = true; }
  else if (wo.length < 1) errors.push("watchOuts: none");
  return { out, errors, ok };
}

export async function writeCard(c: CardContext, p: Prepared, deps: { complete?: Completer } = {}): Promise<{ text: CardText; generator: Generator; record: WriteRecord }> {
  const base = templateCard(c);
  const target = `card:${c.clientId}`;
  const run = deps.complete ?? realComplete;
  const { system, user, allowed } = cardPrompt(c, p, base);
  const rec: WriteRecord = { target, provider: "openai", model: modelName(), status: "failed", attempts: 0, promptTokens: 0, completionTokens: 0, latencyMs: 0, validation: {} };
  let best: Partial<CardText> = {};
  let lastErrors: string[] = [];
  let feedback = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    rec.attempts = attempt;
    let res: Completion;
    try {
      res = await run({ system, user: user + feedback, json: true, maxTokens: 1200 });
    } catch (e) {
      rec.validation = { error: e instanceof LlmUnavailable ? e.message : String(e) };
      rec.status = "failed";
      return { text: base, generator: "template", record: rec };
    }
    rec.model = res.model;
    rec.promptTokens = (rec.promptTokens ?? 0) + (res.promptTokens ?? 0);
    rec.completionTokens = (rec.completionTokens ?? 0) + (res.completionTokens ?? 0);
    rec.latencyMs = (rec.latencyMs ?? 0) + res.latencyMs;
    const chk = checkCard(tryJson(res.text), allowed, p.forbidden);
    best = { ...chk.out, ...best }; // keep the earliest valid field
    lastErrors = chk.errors;
    if (!chk.errors.length) {
      rec.status = attempt === 1 ? "accepted" : "repaired";
      rec.validation = { errors: [] };
      return { text: { ...base, ...best } as CardText, generator: "llm", record: rec };
    }
    feedback = `\n\nYour previous answer was rejected by the validator: ${chk.errors.slice(0, 8).join("; ")}. Rewrite the whole JSON with every number as a {{key}} token from the list and no digits, number words or symbols anywhere else.`;
  }

  const have = Object.keys(best).length;
  rec.status = "fallback";
  rec.validation = { errors: lastErrors.slice(0, 12), kept: Object.keys(best) };
  return { text: { ...base, ...best } as CardText, generator: have ? "hybrid" : "template", record: rec };
}

/** ---------------------------------------------------------------- brief sections */

/** Facts the call-list brief may use: not the per-card facts, and not the market-brief facts (those have their own writer). */
export const briefKeys = (p: Prepared) => new Set(p.facts.keys().filter((k) => !/^(c\d+\.|sp\.|fut\.|breadth\.|sent\.|fed\.)/.test(k)));

export async function writeBrief(p: Prepared, deps: { complete?: Completer; kinds?: string[] } = {}): Promise<{ text: BriefText; generators: Record<string, Generator>; record: WriteRecord }> {
  const base = templateBrief(p.brief);
  if (deps.kinds) base.sections = base.sections.filter((s) => deps.kinds!.includes(s.kind));
  const run = deps.complete ?? realComplete;
  const allowed = briefKeys(p);
  const facts = p.facts.all().filter((f) => allowed.has(f.key));
  const rec: WriteRecord = { target: "brief", provider: "openai", model: modelName(), status: "failed", attempts: 0, promptTokens: 0, completionTokens: 0, latencyMs: 0, validation: {} };
  const kinds = base.sections.map((s) => s.kind);
  const generators: Record<string, Generator> = { headline: "template", ...Object.fromEntries(kinds.map((k) => [k, "template" as Generator])) };

  const system = `${RULES}\n\nFacts you may reference as {{key}}:\n${facts.map(factLine).join("\n")}`;
  const user = JSON.stringify({
    task: `Write the morning brief for ${p.brief.firstName}. Rewrite each baseline section so it reads like a sharp desk note. Keep every fact the baseline uses, in the same order of importance; do not add facts that are not in the list.`,
    sections: base.sections.map((s) => ({ kind: s.kind, title: s.title, baseline: s.body })),
    headlineBaseline: base.headline,
    outputShape: { headline: "string, one line", sections: Object.fromEntries(kinds.map((k) => [k, "string, two to four sentences"])) },
  });

  const out: Record<string, string> = {};
  let feedback = "";
  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    rec.attempts = attempt;
    let res: Completion;
    try {
      res = await run({ system, user: user + feedback, json: true, maxTokens: 1800 });
    } catch (e) {
      rec.validation = { error: e instanceof Error ? e.message : String(e) };
      rec.status = "failed";
      return { text: base, generators, record: rec };
    }
    rec.model = res.model;
    rec.promptTokens = (rec.promptTokens ?? 0) + (res.promptTokens ?? 0);
    rec.completionTokens = (rec.completionTokens ?? 0) + (res.completionTokens ?? 0);
    rec.latencyMs = (rec.latencyMs ?? 0) + res.latencyMs;
    const raw = tryJson(res.text);
    const errors: string[] = [];
    if (!raw) errors.push("not_json");
    else {
      const sec = (raw.sections && typeof raw.sections === "object" ? raw.sections : {}) as Record<string, unknown>;
      const check = (name: string, text: string, max: number) => {
        const r = validateText(text, { allowedKeys: allowed, forbiddenTerms: p.forbidden, maxLength: max });
        if (r.ok) out[name] = text; else errors.push(...r.errors.map((e) => `${name}: ${e}`));
      };
      if (!(("headline" in out))) check("headline", str(raw.headline), 150);
      for (const k of kinds) if (!(k in out)) check(k, str(sec[k]), 700);
    }
    lastErrors = errors;
    if (!errors.length) { rec.status = attempt === 1 ? "accepted" : "repaired"; break; }
    feedback = `\n\nYour previous answer was rejected by the validator: ${errors.slice(0, 8).join("; ")}. Rewrite the whole JSON with every number as a {{key}} token from the list and no digits, number words or symbols anywhere else.`;
  }
  if (lastErrors.length) { rec.status = "fallback"; }
  rec.validation = { errors: lastErrors.slice(0, 12), kept: Object.keys(out) };

  const sections: SectionText[] = base.sections.map((s) => {
    if (out[s.kind]) { generators[s.kind] = "llm"; return { ...s, body: out[s.kind] }; }
    return s;
  });
  if (out.headline) generators.headline = "llm";
  return { text: { headline: out.headline ?? base.headline, sections }, generators, record: rec };
}
