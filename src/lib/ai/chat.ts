import type { Db, Q } from "../db/types";
import { formatMove, formatUsd } from "../market/format";
import { mask, keySym } from "./context";
import { complete as realComplete, llmConfigured, modelName, type CompleteOptions, type Completion } from "./gateway";
import type { Fact } from "./facts";
import { validateText } from "./validator";

/**
 * "Ask Morning Brief". Tools run as the signed-in person (row-level security), so another desk's clients
 * simply do not exist as far as the assistant is concerned. Answers are token strings like everything
 * else: figures come from facts, never from the model.
 */
export interface FactView { key: string; label: string; display: string; source: string; asOf: string }
export interface ChatAnswer {
  template: string;
  facts: Record<string, FactView>;
  followups: string[];
  steps: string[];
  draft?: { subject: string; template: string; to: string | null };
  generator: "llm" | "rules";
  intent?: string;
  record?: { model: string; status: string; attempts: number; promptTokens: number | null; completionTokens: number | null; latencyMs: number };
}

type Completer = (o: CompleteOptions) => Promise<Completion>;

interface Ctx {
  q: Q;
  meId: string;
  firstName: string;
  facts: Map<string, Fact>;
  restricted: Set<string>;
  steps: string[];
  now: string;
}
const add = (c: Ctx, f: Fact) => { c.facts.set(f.key, f); return `{{${f.key}}}`; };
const view = (f: Fact): FactView => ({ key: f.key, label: f.label, display: f.display, source: f.source, asOf: f.asOf });
const TOKEN = /\{\{([A-Za-z0-9_.:\-]+)\}\}/g;
const tokensIn = (s: string) => [...s.matchAll(TOKEN)].map((m) => m[1]);

const SEGMENT: Record<string, string> = { hedge_fund: "hedge fund", asset_manager: "asset manager", pension: "pension fund", insurer: "insurer", bank: "bank", corporate: "corporate treasury" };
const daysText = (n: number) => (n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`);

/** ---------------------------------------------------------------- data tools */

async function latestBrief(c: Ctx) {
  const r = await c.q<{ id: string; business_date: string; headline: string }>(`select id, business_date::text, headline from briefs where profile_id = $1 order by business_date desc limit 1`, [c.meId]);
  return r[0] ?? null;
}

async function loadBriefFacts(c: Ctx, briefId: string, keys: string[]) {
  if (!keys.length) return;
  const rows = await c.q(`select key, label, value, display, unit, source, as_of from brief_facts where brief_id = $1 and key = any($2::text[])`, [briefId, keys]);
  for (const r of rows) c.facts.set(String(r.key), { key: String(r.key), label: String(r.label), value: r.value == null ? null : Number(r.value), display: String(r.display), unit: (r.unit as Fact["unit"]) ?? "text", source: String(r.source), asOf: new Date(r.as_of as string).toISOString() });
}

async function topCalls(c: Ctx, n = 5) {
  c.steps.push("Reading today's ranked call list");
  const b = await latestBrief(c);
  if (!b) return { lines: ["There is no brief for you yet. Ask an admin to run the morning pipeline."], cards: [] as { id: string; client: string }[] };
  const rows = await c.q(
    `select cc.id, cc.rank, cc.urgency, cl.name, cc.why_template, cc.headline from call_cards cc join clients cl on cl.id = cc.client_id
      where cc.brief_id = $1 and cc.status in ('new','snoozed') order by cc.rank limit $2`, [b.id, n]);
  await loadBriefFacts(c, b.id, rows.flatMap((r) => tokensIn(String(r.why_template))));
  const lines = rows.map((r) => `• ${r.name}${r.urgency === "now" ? " (call now)" : ""}: ${String(r.why_template).split(/(?<=\.)\s/)[0]}`);
  return { lines, cards: rows.map((r) => ({ id: String(r.id), client: String(r.name) })) };
}

async function marketMoves(c: Ctx) {
  c.steps.push("Checking the pre-market tape");
  const rows = await c.q(
    `select i.id, i.symbol, i.name, i.unit, i.asset_class, (i.meta->>'vol')::float8 vol, q.chg, q.as_of, q.source from market_quotes q join instruments i on i.id = q.instrument_id`);
  const movers = rows.filter((r) => !c.restricted.has(String(r.id))).map((r) => ({ r, z: Math.abs(Number(r.chg)) / Number(r.vol) })).filter((x) => x.z >= 1).sort((a, b) => b.z - a.z).slice(0, 5);
  return {
    lines: movers.map(({ r }) => {
      const nm = add(c, { key: `nm.${keySym(String(r.symbol))}`, label: `${r.symbol} name`, value: null, display: String(r.name), unit: "text", source: "Instrument master", asOf: new Date(r.as_of as string).toISOString() });
      const mv = add(c, { key: `mv.${keySym(String(r.symbol))}`, label: `${r.name} move`, value: Number(r.chg), display: formatMove(r.unit as "pct" | "bp" | "level", Number(r.chg)), unit: r.unit === "bp" ? "bp" : r.unit === "pct" ? "pct" : "level", source: String(r.source), asOf: new Date(r.as_of as string).toISOString() });
      return `${nm} ${mv}`;
    }),
  };
}

async function findClient(c: Ctx, message: string) {
  const rows = await c.q<{ id: string; name: string; short_name: string }>(`select id, name, short_name from clients order by length(name) desc`);
  const m = message.toLowerCase();
  const exact = rows.find((r) => m.includes(r.name.toLowerCase()) || m.includes(r.short_name.toLowerCase()));
  if (exact) return exact;
  const words = m.split(/[^a-z]+/).filter((w) => w.length >= 5);
  return rows.find((r) => words.some((w) => r.name.toLowerCase().split(/[^a-z]+/).includes(w))) ?? null;
}

async function clientSummary(c: Ctx, cl: { id: string; name: string }) {
  c.steps.push(`Reading ${cl.name}'s book and history`);
  const [info] = await c.q(`select name, segment, tier, mandate, aum_usd_mn from clients where id = $1`, [cl.id]);
  const pos = (await c.q(
    `select i.id, i.symbol, i.name, i.sector, p.notional_usd, p.as_of from positions p join instruments i on i.id = p.instrument_id where p.client_id = $1 order by p.notional_usd desc`, [cl.id]))
    .filter((p) => !c.restricted.has(String(p.id)));
  const last = (await c.q(`select kind, subject, ($2::date - (occurred_at at time zone 'America/New_York')::date) d from interactions where client_id = $1 order by occurred_at desc limit 1`, [cl.id, c.now]))[0];
  const fu = (await c.q(`select text, due_on from followups where client_id = $1 and status = 'open' and profile_id = $2 order by due_on limit 1`, [cl.id, c.meId]))[0];
  const asOf = new Date(String(pos[0]?.as_of ?? c.now)).toISOString();
  const total = pos.reduce((a, p) => a + Number(p.notional_usd), 0);
  const k = `chat.${cl.id.slice(0, 8)}`;
  const lines: string[] = [];
  lines.push(`${info.name} is a ${SEGMENT[String(info.segment)] ?? "client"}, tier ${info.tier === 1 ? "top" : info.tier === 2 ? "mid" : "lower"}. Mandate: ${String(info.mandate).replace(/\d+/g, "").trim() || "not recorded"}.`);
  if (pos.length) {
    const t = add(c, { key: `${k}.total`, label: "Tracked book", value: total, display: formatUsd(total), unit: "usd", source: "Firm book (positions)", asOf });
    const cnt = add(c, { key: `${k}.n`, label: "Positions", value: pos.length, display: String(pos.length), unit: "count", source: "Firm book (positions)", asOf });
    const top = pos.slice(0, 3).map((p) => {
      const nm = add(c, { key: `nm.${keySym(String(p.symbol))}`, label: `${p.symbol} name`, value: null, display: String(p.name), unit: "text", source: "Instrument master", asOf });
      const sz = add(c, { key: `${k}.p.${keySym(String(p.symbol))}`, label: `${p.symbol} position`, value: Number(p.notional_usd), display: formatUsd(Number(p.notional_usd)), unit: "usd", source: "Firm book (positions)", asOf });
      return `${nm} ${sz}`;
    });
    lines.push(`Tracked book is ${t} across ${cnt} positions. Largest: ${top.join(", ")}.`);
  }
  if (last) {
    const w = add(c, { key: `${k}.last`, label: "Last contact", value: Number(last.d), display: daysText(Number(last.d)), unit: "days", source: "CRM", asOf: new Date(c.now).toISOString() });
    const subj = mask(String(last.subject));
    lines.push(`Last contact was a ${last.kind} ${w}${subj.includes("[figure]") ? "" : ` about ${subj.charAt(0).toLowerCase() + subj.slice(1)}`}.`);
  }
  if (fu) {
    const d = add(c, { key: `${k}.due`, label: "Follow-up due", value: null, display: new Date(`${String(fu.due_on).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), unit: "time", source: "CRM", asOf: new Date(c.now).toISOString() });
    lines.push(`You have an open follow-up due ${d}.`);
  }
  return { lines };
}

async function exposure(c: Ctx, term: string) {
  c.steps.push(`Scanning your clients for ${term} exposure`);
  const rows = await c.q(
    `select cl.id, cl.name, sum(p.notional_usd) usd, max(p.as_of) as_of from positions p join instruments i on i.id = p.instrument_id join clients cl on cl.id = p.client_id
      where (lower(i.sector) = lower($1) or lower(i.symbol) = lower($1) or lower(i.name) like lower($2)) and i.id <> all($3::uuid[])
      group by cl.id, cl.name order by usd desc limit 5`, [term, `%${term}%`, [...c.restricted]]);
  if (!rows.length) return { lines: [`None of your clients hold ${term} in the tracked book.`] };
  const total = rows.reduce((a, r) => a + Number(r.usd), 0);
  const asOf = new Date(String(rows[0].as_of)).toISOString();
  const k = `chat.exp.${keySym(term).toLowerCase()}`;
  const t = add(c, { key: `${k}.total`, label: `Exposure to ${term} (top holders)`, value: total, display: formatUsd(total), unit: "usd", source: "Firm book (positions)", asOf });
  return {
    lines: [
      `Your largest holders of ${term} total ${t}.`,
      ...rows.map((r, i) => `• ${r.name}: ${add(c, { key: `${k}.${i}`, label: `${r.name} exposure`, value: Number(r.usd), display: formatUsd(Number(r.usd)), unit: "usd", source: "Firm book (positions)", asOf })}`),
    ],
  };
}

async function followups(c: Ctx) {
  c.steps.push("Checking open follow-ups");
  const rows = await c.q(`select cl.name, f.text, f.due_on from followups f join clients cl on cl.id = f.client_id where f.profile_id = $1 and f.status = 'open' order by f.due_on limit 6`, [c.meId]);
  if (!rows.length) return { lines: ["You have no open follow-ups."] };
  return {
    lines: rows.map((r, i) => `• ${r.name}, due ${add(c, { key: `chat.fu.${i}`, label: "Follow-up due", value: null, display: new Date(`${String(r.due_on).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), unit: "time", source: "CRM", asOf: new Date(c.now).toISOString() })}: ${mask(String(r.text)).toLowerCase()}`),
  };
}

async function draftFor(c: Ctx, cl: { id: string; name: string }) {
  c.steps.push(`Drafting a note for ${cl.name} from today's call card`);
  const b = await latestBrief(c);
  const card = b ? (await c.q(`select talking_points, why_template, headline from call_cards where brief_id = $1 and client_id = $2`, [b.id, cl.id]))[0] : null;
  const contact = (await c.q(`select full_name from contacts where client_id = $1 order by is_primary desc limit 1`, [cl.id]))[0];
  if (!card || !b) return null;
  const pts = (card.talking_points as { template: string }[]).slice(0, 3).map((t) => t.template);
  await loadBriefFacts(c, b.id, [...pts.flatMap(tokensIn), ...tokensIn(String(card.why_template))]);
  const first = contact ? String(contact.full_name).split(" ")[0] : "there";
  const body = `Hi ${first},\n\nQuick note ahead of the open. ${String(card.why_template).split(/(?<=\.)\s/)[0]}\n\nA few things worth discussing:\n${pts.map((p) => `• ${p}`).join("\n")}\n\nHappy to run through levels whenever suits.\n\n${c.firstName}`;
  return { subject: `Morning color: ${cl.name}`, template: body, to: contact ? String(contact.full_name) : null };
}

/** ---------------------------------------------------------------- routing */

type Intent = { kind: "calls" } | { kind: "market" } | { kind: "followups" } | { kind: "exposure"; term: string } | { kind: "client"; client: { id: string; name: string } } | { kind: "draft"; client: { id: string; name: string } } | { kind: "help" };

const SECTORS = ["Semiconductors", "Technology", "Financials", "Healthcare", "Energy", "Industrials", "Utilities", "Consumer Discretionary", "Consumer Staples", "Communication Services", "Government", "Index Credit"];

export async function route(c: Ctx, message: string): Promise<Intent> {
  const m = message.toLowerCase();
  const cl = await findClient(c, message);
  if (cl && /(draft|email|write|message|note to|compose)/.test(m)) return { kind: "draft", client: cl };
  if (cl) return { kind: "client", client: cl };
  if (/follow.?up|owe|promised|overdue/.test(m)) return { kind: "followups" };
  const sector = SECTORS.find((s) => m.includes(s.toLowerCase())) ?? (m.includes("chip") ? "Semiconductors" : m.includes("rates") || m.includes("treasur") ? "Government" : null);
  if (sector && /(exposure|exposed|hold|holding|own|long|book|who)/.test(m)) return { kind: "exposure", term: sector };
  const sym = message.match(/\b[A-Z]{2,5}\b/g)?.find((s) => !["WHO", "THE", "AND", "FOR", "ARE", "MY", "ALL", "WHAT"].includes(s));
  if (sym && /(exposure|exposed|hold|holding|own)/.test(m)) return { kind: "exposure", term: sym };
  if (/(who|call|priorit|rank|list|today|first|top)/.test(m) && !/moved|market/.test(m)) return { kind: "calls" };
  if (/(moved|moving|market|overnight|tape|premarket|pre-market|mover)/.test(m)) return { kind: "market" };
  return { kind: "help" };
}

const FOLLOW: Record<Intent["kind"], string[]> = {
  calls: ["What moved overnight?", "Which open follow-ups am I behind on?"],
  market: ["Who should I call today?", "Who is exposed to semiconductors?"],
  followups: ["Who should I call today?", "What moved overnight?"],
  exposure: ["Who should I call today?", "What moved overnight?"],
  client: ["Draft a note to this client", "Who should I call today?"],
  draft: ["Who should I call today?", "What moved overnight?"],
  help: ["Who should I call today?", "What moved overnight?", "Which open follow-ups am I behind on?"],
};

/** ---------------------------------------------------------------- answer */

export async function answer(opts: { db: Db; meId: string; firstName: string; message: string; businessDate: string; complete?: Completer; useLlm?: boolean }): Promise<ChatAnswer> {
  const message = opts.message.trim().slice(0, 500);
  // Not client data: only used to exclude names. Read first so the two transactions never nest.
  const restricted = new Set((await opts.db.asService((s) => s<{ id: string }>(`select distinct instrument_id id from events where entitlement = 'restricted_ib' and instrument_id is not null`))).map((r) => r.id));
  return opts.db.asUser(opts.meId, async (q) => {
    const c: Ctx = { q, meId: opts.meId, firstName: opts.firstName, facts: new Map(), restricted, steps: ["Understanding the question"], now: opts.businessDate };
    const intent = await route(c, message);

    let lines: string[] = [];
    let draft: ChatAnswer["draft"];
    let lead = "";
    switch (intent.kind) {
      case "calls": { const r = await topCalls(c); lines = r.lines; lead = "Here is where I would start today:"; break; }
      case "market": { const r = await marketMoves(c); lines = r.lines; lead = r.lines.length ? "These are the biggest moves relative to a normal day:" : "Nothing is moving outside its normal range."; break; }
      case "followups": { const r = await followups(c); lines = r.lines; lead = "Your open follow-ups, oldest first:"; break; }
      case "exposure": { const r = await exposure(c, intent.term); lines = r.lines; break; }
      case "client": { const r = await clientSummary(c, intent.client); lines = r.lines; break; }
      case "draft": {
        const d = await draftFor(c, intent.client);
        if (d) { draft = d; lines = [`I drafted a note for ${intent.client.name} from today's call card. Review it and send it yourself; I never send anything to a client.`]; }
        else lines = [`${intent.client.name} is not on today's call list, so there is nothing grounded to draft from. Ask me for a summary of the client instead.`];
        break;
      }
      default:
        lines = ["I can rank your calls, summarise a client, show who is exposed to a sector, list what moved overnight, or draft a note. Which would help?"];
    }
    c.steps.push("Checking every figure against its source");

    let rules = [lead, ...lines].filter(Boolean).join("\n");
    // The rule-built answer goes through the same validator as model text.
    const own = validateText(rules, { allowedKeys: new Set(c.facts.keys()), maxLength: 2400 });
    if (!own.ok) rules = "I found the data but could not present it in a form that passes the figure checks, so I am not showing it. Try a narrower question.";
    let template = rules;
    let generator: ChatAnswer["generator"] = "rules";
    let record: ChatAnswer["record"];

    const used = new Set([...tokensIn(rules), ...(draft ? tokensIn(draft.template) : [])]);
    const allowed = new Set(c.facts.keys());

    if ((opts.useLlm ?? true) && llmConfigured() && intent.kind !== "draft" && intent.kind !== "help") {
      const run = opts.complete ?? realComplete;
      const sys = `You are the desk assistant inside a trading-desk tool. Answer the salesperson's question using ONLY the findings provided. HARD RULES: never write a digit, number word, percent sign, currency symbol or unit; every figure appears only as a {{fact_key}} token copied from the findings. No recommendations to buy or sell. Do not mention anything not in the findings. Be brief and direct. Return JSON {"answer": string}. Line breaks are allowed.`;
      const user = JSON.stringify({ question: message, findings: rules });
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await run({ system: sys, user: attempt === 1 ? user : user + "\nYour previous answer failed validation. Use only tokens that appear in the findings and no digits.", json: true, maxTokens: 700 });
          record = { model: res.model || modelName(), status: attempt === 1 ? "accepted" : "repaired", attempts: attempt, promptTokens: res.promptTokens, completionTokens: res.completionTokens, latencyMs: res.latencyMs };
          const text = String((JSON.parse(res.text) as { answer?: unknown }).answer ?? "");
          const v = validateText(text, { allowedKeys: allowed, maxLength: 1400 });
          if (v.ok) { template = text; generator = "llm"; v.tokens.forEach((t) => used.add(t)); break; }
          record.status = "fallback";
        } catch {
          record = { model: modelName(), status: "fallback", attempts: attempt, promptTokens: null, completionTokens: null, latencyMs: 0 };
        }
      }
    }

    const facts: Record<string, FactView> = {};
    for (const k of used) { const f = c.facts.get(k); if (f) facts[k] = view(f); }
    const names = [...c.steps];
    if (draft) {
      const v = validateText(draft.template.replace(/^Hi [^,]*,/, "Hi,").replace(/\n\n[^\n]*$/, ""), { allowedKeys: new Set(c.facts.keys()), maxLength: 3000 });
      if (!v.ok) draft = undefined;
      else tokensIn(draft.template).forEach((t) => { const f = c.facts.get(t); if (f) facts[t] = view(f); });
    }
    return { template, facts, followups: FOLLOW[intent.kind], steps: names, draft, generator, record, intent: intent.kind };
  });
}
