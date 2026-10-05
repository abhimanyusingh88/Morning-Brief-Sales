import type { Db, Q } from "../db/types";
import { llmConfigured } from "../ai/gateway";
import { writeBrief, writeCard, type WriteRecord } from "../ai/llm-writer";
import { prepareProfile, type Prepared } from "../ai/prepare";
import { templateBrief, templateCard, type BriefText, type CardText } from "../ai/templates";
import { validateText } from "../ai/validator";
import { defaultScenarios, scenarioByKey } from "../market/scenarios";
import { publish, type StepState } from "./bus";
import { ingestMarket, ingestNews } from "./ingest";
import { suppressedByBarrier, CALENDAR_LABEL } from "./match";
import { buildCandidates, selectCards } from "./rank";
import { loadSnapshot } from "./snapshot";
import { WEIGHTS } from "./score";
import type { Candidate, Snapshot } from "./types";

export interface RunOptions {
  db: Db;
  businessDate: string;
  trigger?: "schedule" | "manual" | "demo";
  scenarios?: string[];
  /** false forces the template writer even when a key is configured */
  useLlm?: boolean;
  /** only these profiles (ids). Default: everyone with coverage. */
  profileIds?: string[];
  /** minimum visible time per step, so a live demo run is watchable */
  minStepMs?: number;
  runId?: string;
}

export const STEPS = [
  ["ingest_market", "Ingest pre-market tape"],
  ["ingest_calendar", "Load macro and earnings calendar"],
  ["ingest_news", "Ingest newswire"],
  ["entitlement_filter", "Apply entitlements and information barrier"],
  ["tag_events", "Tag events to sectors and themes"],
  ["match_book", "Match events to each client's book"],
  ["score_rank", "Score client opportunities"],
  ["rank_select", "Select each salesperson's call list"],
  ["build_facts", "Build the fact book (source and timestamp on every figure)"],
  ["generate_brief", "Write morning briefs"],
  ["generate_cards", "Write call cards and talking points"],
  ["validate", "Validate every number and name in generated text"],
  ["publish", "Publish briefs"],
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

interface CardOut { ctx: Prepared["cards"][number]; text: CardText; generator: string; record: WriteRecord | null }
interface ProfileOut { prep: Prepared; cards: CardOut[]; brief: BriefText; briefGen: Record<string, string>; briefRecord: WriteRecord | null }

export async function runPipeline(o: RunOptions): Promise<{ runId: string; status: "succeeded" | "failed"; summary: Record<string, unknown> }> {
  const { db, businessDate } = o;
  const useLlm = (o.useLlm ?? true) && llmConfigured();
  const started = Date.now();

  const runId = (await db.asService((q) =>
    q<{ id: string }>(`insert into pipeline_runs (id, business_date, trigger, scope, status) values (coalesce($4::uuid, gen_random_uuid()), $1, $2, $3, 'running') returning id`,
      [businessDate, o.trigger ?? "manual", o.profileIds ? "subset" : "all", o.runId ?? null]),
  ))[0].id;

  const steps: StepState[] = STEPS.map(([key, label], i) => ({ seq: i + 1, key, label, status: "pending", startedAt: null, finishedAt: null, rowsIn: null, rowsOut: null, detail: {}, log: [] }));

  // Writes are chained so an older snapshot of a step can never overwrite a newer one.
  let writes: Promise<unknown> = Promise.resolve();
  const persist = (s: StepState) => {
    writes = writes.then(() => db.asService((q) => q(
      `update pipeline_steps set status=$3, started_at=$4, finished_at=$5, rows_in=$6, rows_out=$7, detail=$8::jsonb, log=$9::text[] where run_id=$1 and seq=$2`,
      [runId, s.seq, s.status, s.startedAt, s.finishedAt, s.rowsIn, s.rowsOut, JSON.stringify(s.detail), [...s.log]],
    ))).catch(() => {});
    return writes;
  };

  async function step<T>(key: string, fn: (log: (line: string) => void, set: (p: Partial<Pick<StepState, "rowsIn" | "rowsOut" | "detail">>) => void) => Promise<T>): Promise<T> {
    const s = steps.find((x) => x.key === key)!;
    s.status = "running";
    s.startedAt = new Date().toISOString();
    void persist(s);
    publish(runId, { type: "step", runId, step: structuredClone(s) });
    const t0 = Date.now();
    const log = (line: string) => { s.log.push(line); void persist(s); publish(runId, { type: "log", runId, key, line, at: new Date().toISOString() }); };
    const set = (p: Partial<Pick<StepState, "rowsIn" | "rowsOut" | "detail">>) => Object.assign(s, p);
    try {
      const r = await fn(log, set);
      const realMs = Date.now() - t0;
      const wait = (o.minStepMs ?? 0) - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      s.status = "succeeded";
      s.finishedAt = new Date().toISOString();
      s.detail = { ...s.detail, ms: realMs };
      await persist(s);
      publish(runId, { type: "step", runId, step: structuredClone(s) });
      return r;
    } catch (e) {
      s.status = "failed";
      s.finishedAt = new Date().toISOString();
      log(`ERROR ${e instanceof Error ? e.message : String(e)}`);
      await persist(s);
      publish(runId, { type: "step", runId, step: structuredClone(s) });
      throw e;
    }
  }

  const summary: Record<string, unknown> = { businessDate, llm: useLlm };
  try {
    await db.asService((q) => q(
      `insert into pipeline_steps (run_id, seq, key, label) select $1, (x->>'seq')::int, x->>'key', x->>'label' from jsonb_array_elements($2::jsonb) x`,
      [runId, JSON.stringify(steps.map((s) => ({ seq: s.seq, key: s.key, label: s.label })))],
    ));
    publish(runId, { type: "run", runId, businessDate, status: "running", steps: structuredClone(steps) });

    const scenarios = o.scenarios?.length ? o.scenarios : defaultScenarios(businessDate);
    summary.scenarios = scenarios;

    await step("ingest_market", async (log, set) => {
      const r = await db.asService((q) => ingestMarket(q, businessDate, scenarios));
      log(`Provider ${r.provider}: ${r.rows} instruments quoted`);
      log(`${r.moverCount} instruments moved beyond one normal daily range; leaders ${r.movers.join(", ")}`);
      set({ rowsOut: r.rows, detail: { provider: r.provider, movers: r.movers } });
    });

    await step("ingest_calendar", async (log, set) => {
      const r = await db.asService((q) => q<{ kind: string; n: number }>(
        `select kind, count(*)::int n from events where source_label = $2 and business_date between $1::date and $1::date + 1 group by kind`, [businessDate, CALENDAR_LABEL]));
      for (const x of r) log(`${x.n} ${x.kind} items on the calendar`);
      set({ rowsOut: r.reduce((a, b) => a + b.n, 0), detail: { source: CALENDAR_LABEL } });
    });

    await step("ingest_news", async (log, set) => {
      const r = await db.asService((q) => ingestNews(q, businessDate, scenarios));
      for (const k of scenarios) { const sc = scenarioByKey(k); if (sc) log(`Storyline: ${sc.label}`); }
      log(`${r.events} items from the newswire`);
      set({ rowsOut: r.events });
    });

    const snap: Snapshot = await step("entitlement_filter", async (log, set) => {
      const s = await db.asService((q) => loadSnapshot(q, businessDate));
      const barred = suppressedByBarrier(s);
      log(`${s.events.length} public events cleared for distribution`);
      log(`${s.restrictedInstrumentIds.size} instruments on the restricted list; ${barred} signals withheld`);
      log(`${s.clients.size} clients, ${[...s.positions.values()].reduce((a, b) => a + b.length, 0)} positions loaded`);
      set({ rowsIn: s.events.length, rowsOut: s.events.length, detail: { restricted: s.restrictedInstrumentIds.size, barred } });
      return s;
    });

    await step("tag_events", async (log, set) => {
      const by = new Map<string, number>();
      for (const e of snap.events) by.set(e.sector ?? "Macro", (by.get(e.sector ?? "Macro") ?? 0) + 1);
      const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} (${n})`).join(", ");
      log(`Tagged ${snap.events.length} events across ${by.size} sectors and themes: ${top}`);
      set({ rowsIn: snap.events.length, rowsOut: snap.events.length });
    });

    const cands: Candidate[] = await step("match_book", async (log, set) => {
      const c = buildCandidates(snap);
      log(`${c.length} client opportunities found across ${new Set(c.map((x) => x.profileId)).size} salespeople`);
      set({ rowsIn: snap.clients.size, rowsOut: c.length });
      return c;
    });

    await step("score_rank", async (log, set) => {
      const w = Object.entries(WEIGHTS).map(([k, v]) => `${k} ${v}`).join(", ");
      log(`Weights: ${w}`);
      const avg = cands.length ? cands.reduce((a, b) => a + b.score, 0) / cands.length : 0;
      log(`Scored ${cands.length} opportunities; mean ${avg.toFixed(1)}`);
      set({ rowsIn: cands.length, rowsOut: cands.length });
    });

    const selected = await step("rank_select", async (log, set) => {
      let sel = selectCards(snap, cands);
      if (o.profileIds) sel = new Map([...sel].filter(([id]) => o.profileIds!.includes(id)));
      const n = [...sel.values()].reduce((a, b) => a + b.length, 0);
      log(`${n} calls selected for ${sel.size} salespeople (per-story cap keeps lists varied)`);
      const now = [...sel.values()].flat().filter((c) => c.urgency === "now").length;
      log(`${now} flagged to call now`);
      // persist the ranked signals behind each list
      await db.asService(async (q) => {
        await q(`delete from signals where business_date = $1`, [businessDate]);
        const rows = [...sel.values()].flat().map((c) => ({ p: c.profileId, c: c.clientId, e: c.primary.trigger.eventIds[0] ?? null, k: c.primary.trigger.kind, s: c.score, f: c.primary.factors }));
        if (rows.length) await q(
          `insert into signals (business_date, profile_id, client_id, event_id, kind, score, factors)
           select $1, (x->>'p')::uuid, (x->>'c')::uuid, (x->>'e')::uuid, x->>'k', (x->>'s')::numeric, x->'f' from jsonb_array_elements($2::jsonb) x`,
          [businessDate, JSON.stringify(rows)]);
      });
      set({ rowsIn: cands.length, rowsOut: n, detail: { salespeople: sel.size, now } });
      return sel;
    });

    const names = new Map((await db.asService((q) => q<{ id: string; full_name: string }>(`select id, full_name from profiles`))).map((p) => [p.id, p.full_name.split(" ")[0]]));

    const prepared: Prepared[] = await step("build_facts", async (log, set) => {
      const list = await pool([...selected.entries()], 4, ([profileId, picks]) =>
        prepareProfile({ db, snap, profileId, firstName: names.get(profileId) ?? "there", picks }));
      const facts = list.reduce((a, p) => a + p.facts.keys().length, 0);
      log(`Client detail read under each salesperson's own permissions (row-level security)`);
      log(`${facts} facts registered, each with source and as-of time`);
      set({ rowsIn: selected.size, rowsOut: facts });
      return list;
    });

    const outs: ProfileOut[] = prepared.map((prep) => ({ prep, cards: [], brief: templateBrief(prep.brief), briefGen: {}, briefRecord: null }));

    await step("generate_brief", async (log, set) => {
      await pool(outs, 5, async (po) => {
        if (!useLlm) { po.briefGen = { headline: "template" }; return; }
        const r = await writeBrief(po.prep);
        po.brief = r.text; po.briefGen = r.generators; po.briefRecord = r.record;
      });
      const recs = outs.map((x) => x.briefRecord).filter((x): x is WriteRecord => Boolean(x));
      log(useLlm ? `${recs.length} briefs drafted by the model; ${recs.filter((r) => r.status === "accepted").length} accepted first time` : "Template writer used (no model configured)");
      set({ rowsIn: outs.length, rowsOut: outs.length });
    });

    await step("generate_cards", async (log, set) => {
      const jobs = outs.flatMap((po) => po.prep.cards.map((ctx) => ({ po, ctx })));
      const done = await pool(jobs, 6, async ({ po, ctx }) => {
        if (!useLlm) return { po, out: { ctx, text: templateCard(ctx), generator: "template", record: null } as CardOut };
        const r = await writeCard(ctx, po.prep);
        return { po, out: { ctx, text: r.text, generator: r.generator, record: r.record } as CardOut };
      });
      for (const d of done) d.po.cards.push(d.out);
      for (const po of outs) po.cards.sort((a, b) => a.ctx.rank - b.ctx.rank);
      const recs = done.map((d) => d.out.record).filter((x): x is WriteRecord => Boolean(x));
      const by = (s: string) => recs.filter((r) => r.status === s).length;
      if (useLlm) log(`${jobs.length} cards: ${by("accepted")} accepted, ${by("repaired")} repaired after validation, ${by("fallback") + by("failed")} on template`);
      else log(`${jobs.length} cards written with the template writer`);
      summary.generation = { accepted: by("accepted"), repaired: by("repaired"), fallback: by("fallback"), failed: by("failed"), promptTokens: recs.reduce((a, r) => a + (r.promptTokens ?? 0), 0), completionTokens: recs.reduce((a, r) => a + (r.completionTokens ?? 0), 0) };
      set({ rowsIn: jobs.length, rowsOut: jobs.length });
    });

    await step("validate", async (log, set) => {
      let checked = 0, replaced = 0;
      for (const po of outs) {
        const allowedBrief = new Set(po.prep.facts.keys().filter((k) => !/^c\d+\./.test(k)));
        const bad = (text: string, allowed: Set<string>) => { checked++; return !validateText(text, { allowedKeys: allowed, forbiddenTerms: po.prep.forbidden }).ok; };
        const tb = templateBrief(po.prep.brief);
        if (bad(po.brief.headline, allowedBrief)) { po.brief.headline = tb.headline; replaced++; }
        po.brief.sections = po.brief.sections.map((s, i) => (bad(s.body, allowedBrief) ? (replaced++, tb.sections.find((x) => x.kind === s.kind) ?? tb.sections[i]) : s));
        for (const c of po.cards) {
          const allowed = new Set(c.ctx.keys);
          const t = templateCard(c.ctx);
          const fix = (v: string, base: string) => (bad(v, allowed) ? (replaced++, base) : v);
          c.text = {
            headline: fix(c.text.headline, t.headline), why: fix(c.text.why, t.why),
            talkingPoints: c.text.talkingPoints.map((x, i) => fix(x, t.talkingPoints[i] ?? t.talkingPoints[0])),
            watchOuts: c.text.watchOuts.map((x, i) => fix(x, t.watchOuts[i] ?? t.watchOuts[0])),
          };
          // rendering must resolve every token
          po.prep.facts.render([c.text.headline, c.text.why, ...c.text.talkingPoints, ...c.text.watchOuts].join(" "));
        }
      }
      log(`${checked} strings checked: no digits outside fact tokens, no unknown tokens, no restricted names`);
      log(replaced ? `${replaced} strings replaced by the template version` : "No replacements needed");
      summary.validation = { checked, replaced };
      set({ rowsIn: checked, rowsOut: checked - replaced });
    });

    await step("publish", async (log, set) => {
      let cards = 0;
      for (const po of outs) cards += await publishProfile(db, runId, businessDate, po);
      log(`${outs.length} briefs and ${cards} call cards published`);
      summary.published = { briefs: outs.length, cards };
      set({ rowsIn: outs.length, rowsOut: cards });
    });

    summary.durationMs = Date.now() - started;
    await db.asService((q) => q(`update pipeline_runs set status='succeeded', finished_at=now(), summary=$2::jsonb where id=$1`, [runId, JSON.stringify(summary)]));
    publish(runId, { type: "done", runId, status: "succeeded", summary });
    return { runId, status: "succeeded", summary };
  } catch (e) {
    summary.error = e instanceof Error ? e.message : String(e);
    summary.durationMs = Date.now() - started;
    await db.asService((q) => q(`update pipeline_runs set status='failed', finished_at=now(), summary=$2::jsonb where id=$1`, [runId, JSON.stringify(summary)])).catch(() => {});
    publish(runId, { type: "done", runId, status: "failed", summary });
    return { runId, status: "failed", summary };
  }
}

/**
 * Demo clock: briefs are stamped with the firm's scheduled publish time on the business date (06:30 New York,
 * a little spread per person), so the product reads as it would on a live morning. The real run time is in pipeline_runs.
 */
function publishedAt(businessDate: string, profileId: string): string {
  const jitter = parseInt(profileId.slice(0, 4), 16) % 240; // seconds
  const base = new Date(`${businessDate}T06:30:00-04:00`).getTime();
  return new Date(base + jitter * 1000).toISOString();
}

const tokensOf = (s: string) => [...s.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);

async function publishProfile(db: Db, runId: string, businessDate: string, po: ProfileOut): Promise<number> {
  const { prep } = po;
  const fb = prep.facts;
  return db.asService(async (q: Q) => {
    const existing = await q<{ id: string }>(`select id from briefs where business_date = $1 and profile_id = $2`, [businessDate, prep.profileId]);
    const prior = existing[0]
      ? await q<{ client_id: string; status: string; acted_at: string | null }>(`select client_id, status, acted_at from call_cards where brief_id = $1`, [existing[0].id])
      : [];
    const keep = new Map(prior.map((p) => [p.client_id, p]));

    const b = (await q<{ id: string }>(
      `insert into briefs (business_date, profile_id, run_id, status, headline, version, generated_at, published_at)
       values ($1, $2, $3, 'published', $4, 1, $5::timestamptz, $5::timestamptz)
       on conflict (business_date, profile_id) do update
         set run_id = excluded.run_id, status = 'published', headline = excluded.headline, version = briefs.version + 1, generated_at = excluded.generated_at, published_at = excluded.published_at
       returning id`,
      [businessDate, prep.profileId, runId, fb.render(po.brief.headline), publishedAt(businessDate, prep.profileId)],
    ))[0].id;

    await q(`delete from brief_sections where brief_id = $1`, [b]);
    await q(`delete from brief_facts where brief_id = $1`, [b]);
    await q(`delete from call_cards where brief_id = $1`, [b]);
    await q(`delete from generation_records where brief_id = $1`, [b]);

    await q(
      `insert into brief_facts (brief_id, key, label, value, display, unit, source, as_of)
       select $1, x->>'key', x->>'label', nullif(x->>'value','')::numeric, x->>'display', x->>'unit', x->>'source', (x->>'asOf')::timestamptz from jsonb_array_elements($2::jsonb) x`,
      [b, JSON.stringify(fb.all().map((f) => ({ key: f.key, label: f.label, value: f.value == null ? "" : String(f.value), display: f.display, unit: f.unit, source: f.source, asOf: f.asOf })))],
    );

    const sections = po.brief.sections.map((s, i) => ({
      kind: s.kind, position: i + 1, title: s.title, tpl: s.body, rendered: fb.render(s.body), keys: [...new Set(tokensOf(s.body))], gen: po.briefGen[s.kind] ?? "template",
    }));
    await q(
      `insert into brief_sections (brief_id, kind, position, title, body_template, body_rendered, fact_keys, generator)
       select $1, x->>'kind', (x->>'position')::int, x->>'title', x->>'tpl', x->>'rendered', array(select jsonb_array_elements_text(x->'keys')), x->>'gen' from jsonb_array_elements($2::jsonb) x`,
      [b, JSON.stringify(sections)],
    );

    const cards = po.cards.map((c) => {
      const pair = (arr: string[]) => arr.map((t) => ({ template: t, rendered: fb.render(t) }));
      const old = keep.get(c.ctx.clientId);
      return {
        client: c.ctx.clientId, contact: c.ctx.contactId, event: c.ctx.eventId, rank: c.ctx.rank, urgency: c.ctx.urgency,
        score: prep.cardScore.get(c.ctx.clientId) ?? 0, headline: fb.render(c.text.headline), whyT: c.text.why, whyR: fb.render(c.text.why),
        tp: pair(c.text.talkingPoints), wo: pair(c.text.watchOuts), keys: c.ctx.keys, factors: prep.cardFactors.get(c.ctx.clientId) ?? {}, gen: c.generator,
        status: old?.status ?? "new", acted: old?.acted_at ?? null,
      };
    });
    if (cards.length) await q(
      `insert into call_cards (brief_id, profile_id, client_id, contact_id, event_id, rank, score, urgency, headline, why_template, why_rendered, talking_points, watch_outs, fact_keys, factors, generator, status, acted_at)
       select $1, $2, (x->>'client')::uuid, nullif(x->>'contact','')::uuid, nullif(x->>'event','')::uuid, (x->>'rank')::int, (x->>'score')::numeric, x->>'urgency', x->>'headline', x->>'whyT', x->>'whyR',
              x->'tp', x->'wo', array(select jsonb_array_elements_text(x->'keys')), x->'factors', x->>'gen', x->>'status', nullif(x->>'acted','')::timestamptz
         from jsonb_array_elements($3::jsonb) x`,
      [b, prep.profileId, JSON.stringify(cards)],
    );

    const recs = [
      ...(po.briefRecord ? [po.briefRecord] : []),
      ...po.cards.flatMap((c) => (c.record ? [c.record] : [])),
    ];
    if (recs.length) await q(
      `insert into generation_records (brief_id, profile_id, target, provider, model, status, attempts, prompt_tokens, completion_tokens, latency_ms, validation)
       select $1, $2, x->>'target', x->>'provider', x->>'model', x->>'status', (x->>'attempts')::int, (x->>'promptTokens')::int, (x->>'completionTokens')::int, (x->>'latencyMs')::int, x->'validation' from jsonb_array_elements($3::jsonb) x`,
      [b, prep.profileId, JSON.stringify(recs)],
    );
    return cards.length;
  });
}
