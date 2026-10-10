import type { Db } from '../db/types';
import { cachedCompleter } from '../ai/cache';
import { llmConfigured, modelName } from '../ai/gateway';
import { writeBrief, writeCard, type WriteRecord } from '../ai/llm-writer';
import { prepareProfile, forbiddenTerms, type Prepared } from '../ai/prepare';
import { templateBrief, templateCard } from '../ai/templates';
import { validateText } from '../ai/validator';
import {
  buildPersonal,
  buildUniversal,
  type BuiltSection,
  type FeedHealth,
  type Universal,
  sectionPosition,
} from '../brief/build';
import { narrativeSection, templateNarrative, writeNarrative, type Narrative } from '../brief/narrative';
import { loadAllPrefs } from '../brief/prefs';
import type { BriefPrefs } from '../brief/spec';
import { runFeeds, type FeedState, type Outage } from '../feeds/connectors';
import { classifyHeadline } from '../feeds/content';
import { defaultScenarios } from '../market/scenarios';
import { publish, type StepState } from './bus';
import { deliver, type DeliveryItem } from './deliver';
import { suppressedByBarrier } from './match';
import { persistDraft, publishedAt, type CardOut, type ProfileOut } from './persist';
import { automatedChecks, pickSample, simulatedSpotCheck, universalHash, type QcSubject } from './qc';
import { buildCandidates, selectCards } from './rank';
import { WEIGHTS } from './score';
import { loadSnapshot } from './snapshot';
import type { Candidate, Snapshot } from './types';

export interface RunOptions {
  db: Db;
  businessDate: string;
  trigger?: 'schedule' | 'manual' | 'demo';
  scenarios?: string[];
  /** false forces the template writer even when a key is configured */
  useLlm?: boolean;
  /** only these profiles (ids). Default: everyone with coverage. */
  profileIds?: string[];
  /** minimum visible time per step, so a live demo run is watchable */
  minStepMs?: number;
  /** pace the run as a time-lapse of the morning (connectors finish one after another, steps hold their share of the clock) */
  timelapse?: boolean;
  /** simulate feed problems: the affected sections are withheld with "data temporarily unavailable" */
  outages?: Record<string, Outage>;
  /** the simulated spot-check reviewer holds one brief, so the hold-and-release path can be shown */
  qcFlag?: boolean;
  /** ignore stored model output and call the model again */
  bypassCache?: boolean;
  runId?: string;
}

/** The five stages of the specification's pipeline table, with the simulated New York clock each starts at. */
export const STAGES = [
  { n: 1, simAt: '04:00', name: 'Data ingestion', detail: 'Pull all data feeds' },
  { n: 2, simAt: '04:30', name: 'Tagging and matching', detail: 'Match tagged content to each saved profile' },
  { n: 3, simAt: '05:00', name: 'Narrative generation', detail: 'Catalysts, one-line summary, call cards' },
  { n: 4, simAt: '05:30', name: 'QC review', detail: 'Automated checks and a human spot-check' },
  { n: 5, simAt: '06:30', name: 'Delivery', detail: 'Publish the dashboard, send the email digest' },
] as const;

export const STEPS: readonly (readonly [string, string, number, string])[] = [
  ['ingest_feeds', 'Pull every data feed', 1, '04:00'],
  ['entitlement_filter', 'Apply entitlements and the information barrier', 2, '04:30'],
  ['tag_events', 'Tag content to sector, ticker and product', 2, '04:33'],
  ['load_preferences', "Load each salesperson's saved setup", 2, '04:36'],
  ['match_book', "Match events to each client's book", 2, '04:39'],
  ['score_rank', 'Score client opportunities', 2, '04:42'],
  ['rank_select', "Select each salesperson's call list", 2, '04:45'],
  ['build_facts', 'Build the fact book (source and timestamp on every figure)', 3, '05:00'],
  ['compose_sections', "Compose each brief from the day's tagged content", 3, '05:04'],
  ['narrative', 'Write the Catalysts section and the one-line summary', 3, '05:08'],
  ['generate_brief', 'Write the call-list briefs', 3, '05:12'],
  ['generate_cards', 'Write call cards and talking points', 3, '05:16'],
  ['validate', 'Validate every number and name in generated text', 4, '05:24'],
  ['persist', 'Store the drafts', 4, '05:27'],
  ['qc_review', 'QC review: automated checks and spot-check', 4, '05:30'],
  ['publish', 'Publish dashboards', 5, '06:30'],
  ['deliver', 'Send email digests', 5, '06:31'],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const CALL_LIST_KINDS = ['book', 'flow', 'risks'];

export async function runPipeline(
  o: RunOptions,
): Promise<{ runId: string; status: 'succeeded' | 'failed'; summary: Record<string, unknown> }> {
  const { db, businessDate } = o;
  const useLlm = (o.useLlm ?? true) && llmConfigured();
  const started = Date.now();
  const minStep = o.minStepMs ?? (o.timelapse ? 3600 : 0);
  const complete = useLlm ? cachedCompleter(db, { bypass: o.bypassCache }) : undefined;

  const runId = (
    await db.asService((q) =>
      q<{ id: string }>(
        `insert into pipeline_runs (id, business_date, trigger, scope, status) values (coalesce($4::uuid, gen_random_uuid()), $1, $2, $3, 'running') returning id`,
        [businessDate, o.trigger ?? 'manual', o.profileIds ? 'subset' : 'all', o.runId ?? null],
      ),
    )
  )[0].id;

  const steps: StepState[] = STEPS.map(([key, label, stage, simAt], i) => ({
    seq: i + 1,
    stage,
    simAt,
    key,
    label,
    status: 'pending',
    startedAt: null,
    finishedAt: null,
    rowsIn: null,
    rowsOut: null,
    detail: { stage, simAt },
    log: [],
  }));

  // Writes are chained so an older snapshot of a step can never overwrite a newer one.
  let writes: Promise<unknown> = Promise.resolve();
  const persist = (s: StepState) => {
    writes = writes
      .then(() =>
        db.asService((q) =>
          q(
            `update pipeline_steps set status=$3, started_at=$4, finished_at=$5, rows_in=$6, rows_out=$7, detail=$8::jsonb, log=$9::text[] where run_id=$1 and seq=$2`,
            [
              runId,
              s.seq,
              s.status,
              s.startedAt,
              s.finishedAt,
              s.rowsIn,
              s.rowsOut,
              JSON.stringify(s.detail),
              [...s.log],
            ],
          ),
        ),
      )
      .catch(() => {});
    return writes;
  };

  async function step<T>(
    key: string,
    fn: (
      log: (line: string) => void,
      set: (p: Partial<Pick<StepState, 'rowsIn' | 'rowsOut' | 'detail'>>) => void,
    ) => Promise<T>,
  ): Promise<T> {
    const s = steps.find((x) => x.key === key)!;
    s.status = 'running';
    s.startedAt = new Date().toISOString();
    void persist(s);
    publish(runId, { type: 'step', runId, step: structuredClone(s) });
    const t0 = Date.now();
    const tag = `[pipeline ${runId.slice(0, 8)}]`;
    console.log(`${tag} ▶ ${s.simAt} ET ${s.label}`);
    const log = (line: string) => {
      s.log.push(line);
      void persist(s);
      console.log(`${tag}   ${line}`);
      publish(runId, { type: 'log', runId, key, line, at: new Date().toISOString() });
    };
    const set = (p: Partial<Pick<StepState, 'rowsIn' | 'rowsOut' | 'detail'>>) => Object.assign(s, p);
    try {
      const r = await fn(log, set);
      const realMs = Date.now() - t0;
      const wait = minStep - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
      s.status = 'succeeded';
      s.finishedAt = new Date().toISOString();
      s.detail = { ...s.detail, ms: realMs };
      console.log(`${tag} ✓ ${s.label} (${(realMs / 1000).toFixed(1)}s)`);
      await persist(s);
      publish(runId, { type: 'step', runId, step: structuredClone(s) });
      return r;
    } catch (e) {
      s.status = 'failed';
      s.finishedAt = new Date().toISOString();
      log(`ERROR ${e instanceof Error ? e.message : String(e)}`);
      await persist(s);
      publish(runId, { type: 'step', runId, step: structuredClone(s) });
      throw e;
    }
  }

  const summary: Record<string, unknown> = { businessDate, llm: useLlm, timelapse: Boolean(o.timelapse) };
  try {
    await db.asService((q) =>
      q(
        `insert into pipeline_steps (run_id, seq, key, label, detail) select $1, (x->>'seq')::int, x->>'key', x->>'label', jsonb_build_object('stage', (x->>'stage')::int, 'simAt', x->>'simAt') from jsonb_array_elements($2::jsonb) x`,
        [
          runId,
          JSON.stringify(
            steps.map((s) => ({ seq: s.seq, key: s.key, label: s.label, stage: s.stage, simAt: s.simAt })),
          ),
        ],
      ),
    );
    publish(runId, { type: 'run', runId, businessDate, status: 'running', steps: structuredClone(steps) });

    const scenarios = o.scenarios?.length ? o.scenarios : defaultScenarios(businessDate);
    summary.scenarios = scenarios;
    const health: FeedHealth = {};
    let feedStates: FeedState[] = [];

    // ---------------------------------------------------------------- stage 1: data ingestion (04:00)
    await step('ingest_feeds', async (log, set) => {
      log(
        `Opening ${14} connectors in parallel (${Object.keys(o.outages ?? {}).length ? `simulated outage on ${Object.keys(o.outages ?? {}).join(', ')}` : 'all healthy'})`,
      );
      const s = steps.find((x) => x.key === 'ingest_feeds')!;
      feedStates = await runFeeds({
        db,
        runId,
        businessDate,
        scenarios,
        outages: o.outages,
        pace: o.timelapse
          ? async (_k, i) => {
              await sleep(150 + i * 330);
            }
          : undefined,
        onUpdate: (f) => {
          publish(runId, { type: 'feed', runId, feed: f });
          if (f.status !== 'running' && f.finishedAt)
            s.detail = {
              ...s.detail,
              feeds: { ...(s.detail.feeds as Record<string, string> | undefined), [f.feedKey]: f.status },
            };
        },
      });
      for (const f of feedStates) {
        health[f.feedKey] = f.status;
        log(
          `${f.feedKey.padEnd(14)} ${f.status.toUpperCase().padEnd(8)} ${f.rows.toLocaleString('en-US').padStart(6)} rows · ${f.latencyMs} ms${f.status !== 'ok' ? ` · ${String(f.detail.error ?? '')}` : ''}`,
        );
      }
      const ok = feedStates.filter((f) => f.status === 'ok').length;
      const bad = feedStates.filter((f) => f.status !== 'ok');
      log(
        `${ok} of ${feedStates.length} feeds healthy${bad.length ? `; ${bad.map((b) => b.feedKey).join(', ')} will be withheld from briefs: data temporarily unavailable` : ''}`,
      );
      set({
        rowsOut: feedStates.reduce((a, f) => a + f.rows, 0),
        detail: { feeds: Object.fromEntries(feedStates.map((f) => [f.feedKey, f.status])) },
      });
      summary.feeds = { ok, down: bad.length };
    });

    // ---------------------------------------------------------------- stage 2: tagging and matching (04:30)
    let snap: Snapshot = await step('entitlement_filter', async (log, set) => {
      const s = await db.asService((q) => loadSnapshot(q, businessDate));
      const barred = suppressedByBarrier(s);
      log(`${s.events.length} public events cleared for distribution`);
      log(`${s.restrictedInstrumentIds.size} instruments on the restricted list; ${barred} signals withheld`);
      log(`${s.clients.size} clients, ${[...s.positions.values()].reduce((a, b) => a + b.length, 0)} positions loaded`);
      set({
        rowsIn: s.events.length,
        rowsOut: s.events.length,
        detail: { restricted: s.restrictedInstrumentIds.size, barred },
      });
      return s;
    });

    await step('tag_events', async (log, set) => {
      // Items the aggregator delivered without sector or product tags are classified here, by rule.
      const raw = await db.asService((q) =>
        q<{ id: string; title: string }>(
          `select id, title from events where business_date = $1 and payload->>'untagged' = 'true'`,
          [businessDate],
        ),
      );
      let fixed = 0;
      for (const e of raw) {
        const c = classifyHeadline(e.title);
        if (!c) {
          log(`no rule matched: "${e.title.slice(0, 60)}"; left untagged`);
          continue;
        }
        await db.asService((q) =>
          q(
            `update events set sector = $2, tags = $3::text[], products = $4::text[], payload = payload - 'untagged' || jsonb_build_object('tagged_by', 'rules v1') where id = $1`,
            [e.id, c.sector, c.tags, c.products],
          ),
        );
        fixed++;
        log(
          `tagged "${e.title.slice(0, 54)}${e.title.length > 54 ? '…' : ''}" → ${c.sector ?? 'market-wide'} · ${c.products.slice(0, 2).join(', ')}`,
        );
      }
      snap = await db.asService((q) => loadSnapshot(q, businessDate));
      const by = new Map<string, number>();
      for (const e of snap.events) by.set(e.sector ?? 'Macro', (by.get(e.sector ?? 'Macro') ?? 0) + 1);
      const top = [...by.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, n]) => `${k} (${n})`)
        .join(', ');
      log(
        `${fixed} untagged headlines classified; ${snap.events.length} events carry sector, ticker and product tags: ${top}`,
      );
      set({ rowsIn: raw.length, rowsOut: snap.events.length, detail: { classified: fixed } });
    });

    const everyone = [...new Set([...snap.coverage.values()].flat())];
    const prefsMap: Map<string, BriefPrefs> = await step('load_preferences', async (log, set) => {
      const ids = o.profileIds ?? everyone;
      const m = await loadAllPrefs(db, businessDate, ids);
      const custom = [...m.values()].filter((p) => p.effectiveFrom !== 'default').length;
      const email = [...m.values()].filter((p) => p.delivery !== 'dashboard').length;
      log(
        `${m.size} saved setups in force on ${businessDate} (${custom} edited by the user, ${m.size - custom} desk defaults); changes saved today apply from the next business day`,
      );
      log(`${email} salespeople receive an email digest; ${m.size - email} dashboard only`);
      set({ rowsOut: m.size });
      return m;
    });

    const cands: Candidate[] = await step('match_book', async (log, set) => {
      const c = buildCandidates(snap);
      log(`${c.length} client opportunities found across ${new Set(c.map((x) => x.profileId)).size} salespeople`);
      set({ rowsIn: snap.clients.size, rowsOut: c.length });
      return c;
    });

    await step('score_rank', async (log, set) => {
      const w = Object.entries(WEIGHTS)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ');
      log(`Weights: ${w}`);
      const avg = cands.length ? cands.reduce((a, b) => a + b.score, 0) / cands.length : 0;
      log(`Scored ${cands.length} opportunities; mean ${avg.toFixed(1)}`);
      set({ rowsIn: cands.length, rowsOut: cands.length });
    });

    const selected = await step('rank_select', async (log, set) => {
      let sel = selectCards(snap, cands);
      if (o.profileIds) sel = new Map([...sel].filter(([id]) => o.profileIds!.includes(id)));
      const n = [...sel.values()].reduce((a, b) => a + b.length, 0);
      log(`${n} calls selected for ${sel.size} salespeople (per-story cap keeps lists varied)`);
      const now = [...sel.values()].flat().filter((c) => c.urgency === 'now').length;
      log(`${now} flagged to call now`);
      await db.asService(async (q) => {
        await q(`delete from signals where business_date = $1`, [businessDate]);
        const rows = [...sel.values()].flat().map((c) => ({
          p: c.profileId,
          c: c.clientId,
          e: c.primary.trigger.eventIds[0] ?? null,
          k: c.primary.trigger.kind,
          s: c.score,
          f: c.primary.factors,
        }));
        if (rows.length)
          await q(
            `insert into signals (business_date, profile_id, client_id, event_id, kind, score, factors)
           select $1, (x->>'p')::uuid, (x->>'c')::uuid, (x->>'e')::uuid, x->>'k', (x->>'s')::numeric, x->'f' from jsonb_array_elements($2::jsonb) x`,
            [businessDate, JSON.stringify(rows)],
          );
      });
      set({ rowsIn: cands.length, rowsOut: n, detail: { salespeople: sel.size, now } });
      return sel;
    });

    const people = new Map(
      (
        await db.asService((q) =>
          q<{ id: string; full_name: string; email: string }>(`select id, full_name, email from profiles`),
        )
      ).map((p) => [p.id, { first: p.full_name.split(' ')[0], full: p.full_name, email: p.email }]),
    );

    // ---------------------------------------------------------------- stage 3: narrative generation (05:00)
    const prepared: Prepared[] = await step('build_facts', async (log, set) => {
      const list = await pool([...selected.entries()], 4, ([profileId, picks]) =>
        prepareProfile({ db, snap, profileId, firstName: people.get(profileId)?.first ?? 'there', picks }),
      );
      const facts = list.reduce((a, p) => a + p.facts.keys().length, 0);
      log(`Client detail read under each salesperson's own permissions (row-level security)`);
      log(`${facts} facts registered, each with source and as-of time`);
      set({ rowsIn: selected.size, rowsOut: facts });
      return list;
    });

    const outs: ProfileOut[] = prepared.map((prep) => ({
      prep,
      cards: [],
      brief: templateBrief(prep.brief),
      briefGen: {},
      briefRecord: null,
      spec: [],
    }));
    for (const po of outs) po.brief.sections = po.brief.sections.filter((s) => CALL_LIST_KINDS.includes(s.kind));

    let universal!: Universal;
    await step('compose_sections', async (log, set) => {
      universal = await buildUniversal(db, businessDate, health);
      const u = universal;
      const uni = [...u.sections.values()];
      log(`Universal sections built once for everyone: ${uni.map((s) => s.kind).join(', ')}`);
      const withheld = uni.filter((s) => s.status === 'unavailable');
      if (withheld.length)
        log(`Withheld (feed not healthy): ${withheld.map((s) => s.title).join(', ')}: data temporarily unavailable`);
      let total = 0,
        omitted = 0;
      await pool(outs, 4, async (po) => {
        const prefs = prefsMap.get(po.prep.profileId);
        if (!prefs) return;
        for (const f of u.fb.all()) if (!po.prep.facts.has(f.key)) po.prep.facts.add(f);
        const list: BuiltSection[] = [];
        for (const k of ['snapshot', 'chart']) {
          const s = u.sections.get(k);
          if (s) list.push(s);
        }
        if (prefs.include.sector_lead_lag) {
          const s = u.sections.get('sector_lead_lag');
          if (s) list.push(s);
        }
        const personal = await buildPersonal(db, { u, snap, prefs, profileId: po.prep.profileId, fb: po.prep.facts });
        list.push(...personal);
        po.spec = list;
        total += list.length;
        omitted += ['overnight', 'movers', 'earnings', 'news', 'dividends', 'index_rebalance'].filter(
          (k) => prefs.include[k as keyof BriefPrefs['include']] && !personal.some((p) => p.kind === k),
        ).length;
      });
      log(
        `${total} sections composed for ${outs.length} salespeople; ${omitted} personalised sections omitted because nothing matched (no empty boxes)`,
      );
      set({ rowsIn: outs.length, rowsOut: total });
    });

    let narrative!: Narrative;
    await step('narrative', async (log, set) => {
      const forbidden = forbiddenTerms(snap);
      narrative = useLlm ? await writeNarrative(universal, forbidden, { complete, db }) : templateNarrative(universal);
      const rec: WriteRecord | null = narrative.record;
      const catalysts = narrativeSection(narrative);
      const catRequired = ['mkt_snapshot', 'futures_rates'];
      const down = catRequired.filter((f) => (health[f] ?? 'ok') !== 'ok');
      if (down.length) {
        log(`Catalysts withheld: ${down.join(', ')} not available. Data temporarily unavailable.`);
        const sec: BuiltSection = {
          ...catalysts,
          status: 'unavailable',
          note: 'Data temporarily unavailable.',
          template: '',
          data: { oneLine: '', withheldBecause: down },
          generator: 'code',
        };
        universal.sections.set('catalysts', sec);
      } else {
        universal.sections.set('catalysts', catalysts);
        const inputs = narrative.inputKeys.length;
        log(
          `${inputs} inputs (futures, rates, Fed calendar, commodities, breadth, positioning, headline flow) given to the writer as fact keys; it never sees a figure`,
        );
        if (rec)
          log(
            `${rec.model}: ${rec.status} after ${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'} · ${((rec.latencyMs ?? 0) / 1000).toFixed(1)} s · ${(rec.completionTokens ?? 0).toLocaleString('en-US')} tokens out`,
          );
        else log(useLlm ? 'Writer unavailable; template narrative used' : 'Template writer used (no model configured)');
        log(`${narrative.paragraphs.length} paragraphs, generator: ${narrative.generator}`);
      }
      for (const po of outs) {
        for (const f of universal.fb.all()) if (!po.prep.facts.has(f.key)) po.prep.facts.add(f); // headline facts added by the narrative step
        const cat = universal.sections.get('catalysts');
        if (cat) po.spec.splice(Math.min(2, po.spec.length), 0, cat);
        po.spec.sort((a, b) => sectionPosition(a.kind) - sectionPosition(b.kind));
      }
      summary.narrative = rec
        ? {
            status: rec.status,
            tokensOut: rec.completionTokens,
            promptTokens: rec.promptTokens,
            generator: narrative.generator,
          }
        : { generator: narrative.generator };
      set({
        rowsIn: narrative.inputKeys.length,
        rowsOut: narrative.paragraphs.length + 1,
        detail: { generator: narrative.generator, status: rec?.status ?? 'template' },
      });
    });

    await step('generate_brief', async (log, set) => {
      let briefsDone = 0;
      let reportedFailure = false;
      if (useLlm)
        log(
          `Calling ${modelName()} for ${outs.length} call-list briefs (6 at a time; replayed from cache when unchanged)`,
        );
      await pool(outs, 6, async (po) => {
        if (!useLlm) {
          po.briefGen = { headline: 'template' };
          return;
        }
        const r = await writeBrief(po.prep, { complete, kinds: CALL_LIST_KINDS });
        po.brief = r.text;
        po.briefGen = r.generators;
        po.briefRecord = r.record;
        briefsDone += 1;
        log(
          `Brief ${briefsDone}/${outs.length} ${r.record.status} · ${((r.record.latencyMs ?? 0) / 1000).toFixed(1)}s · ${(r.record.completionTokens ?? 0).toLocaleString('en-US')} tokens out`,
        );
        const err = r.record.validation?.error;
        if (err && !reportedFailure) {
          reportedFailure = true;
          log(`Model call failed, template used instead: ${String(err).slice(0, 200)}`);
        }
      });
      const recs = outs.map((x) => x.briefRecord).filter((x): x is WriteRecord => Boolean(x));
      log(
        useLlm
          ? `${recs.length} briefs drafted by the model; ${recs.filter((r) => r.status === 'accepted').length} accepted first time`
          : 'Template writer used (no model configured)',
      );
      set({ rowsIn: outs.length, rowsOut: outs.length });
    });

    await step('generate_cards', async (log, set) => {
      const jobs = outs.flatMap((po) => po.prep.cards.map((ctx) => ({ po, ctx })));
      let cardsDone = 0;
      let reportedFailure = false;
      if (useLlm)
        log(`Calling ${modelName()} for ${jobs.length} call cards (10 at a time; replayed from cache when unchanged)`);
      const done = await pool(jobs, 10, async ({ po, ctx }) => {
        if (!useLlm)
          return { po, out: { ctx, text: templateCard(ctx), generator: 'template', record: null } as CardOut };
        const r = await writeCard(ctx, po.prep, { complete });
        cardsDone += 1;
        if (cardsDone % 10 === 0 || cardsDone === jobs.length) log(`Cards ${cardsDone}/${jobs.length} written`);
        const err = r.record.validation?.error;
        if (err && !reportedFailure) {
          reportedFailure = true;
          log(`Model call failed, template used instead: ${String(err).slice(0, 200)}`);
        }
        return { po, out: { ctx, text: r.text, generator: r.generator, record: r.record } as CardOut };
      });
      for (const d of done) d.po.cards.push(d.out);
      for (const po of outs) po.cards.sort((a, b) => a.ctx.rank - b.ctx.rank);
      const recs = done.map((d) => d.out.record).filter((x): x is WriteRecord => Boolean(x));
      const by = (s: string) => recs.filter((r) => r.status === s).length;
      if (useLlm)
        log(
          `${jobs.length} cards: ${by('accepted')} accepted, ${by('repaired')} repaired after validation, ${by('fallback') + by('failed')} on template`,
        );
      else log(`${jobs.length} cards written with the template writer`);
      summary.generation = {
        accepted: by('accepted'),
        repaired: by('repaired'),
        fallback: by('fallback'),
        failed: by('failed'),
        promptTokens: recs.reduce((a, r) => a + (r.promptTokens ?? 0), 0),
        completionTokens: recs.reduce((a, r) => a + (r.completionTokens ?? 0), 0),
      };
      set({ rowsIn: jobs.length, rowsOut: jobs.length });
    });

    // ---------------------------------------------------------------- stage 4: validation, storage, QC (05:30)
    await step('validate', async (log, set) => {
      let checked = 0,
        replaced = 0;
      for (const po of outs) {
        const allowedBrief = new Set(po.prep.facts.keys().filter((k) => !/^c\d+\./.test(k)));
        const bad = (text: string, allowed: Set<string>) => {
          checked++;
          return !validateText(text, { allowedKeys: allowed, forbiddenTerms: po.prep.forbidden }).ok;
        };
        const tb = templateBrief(po.prep.brief);
        if (bad(po.brief.headline, allowedBrief)) {
          po.brief.headline = tb.headline;
          replaced++;
        }
        po.brief.sections = po.brief.sections.map((s, i) =>
          bad(s.body, allowedBrief) ? (replaced++, tb.sections.find((x) => x.kind === s.kind) ?? tb.sections[i]) : s,
        );
        // the market brief: every template, and each Catalysts paragraph, goes through the same validator
        for (const s of po.spec) {
          if (s.status !== 'ok' || !s.template) continue;
          if (bad(s.template, allowedBrief)) {
            replaced++;
            throw new Error(
              `Section ${s.kind} failed validation for ${po.prep.profileId}: ${validateText(s.template, { allowedKeys: allowedBrief }).errors.slice(0, 3).join('; ')}`,
            );
          }
        }
        for (const c of po.cards) {
          const allowed = new Set(c.ctx.keys);
          const t = templateCard(c.ctx);
          const fix = (v: string, base: string) => (bad(v, allowed) ? (replaced++, base) : v);
          c.text = {
            headline: fix(c.text.headline, t.headline),
            why: fix(c.text.why, t.why),
            talkingPoints: c.text.talkingPoints.map((x, i) => fix(x, t.talkingPoints[i] ?? t.talkingPoints[0])),
            watchOuts: c.text.watchOuts.map((x, i) => fix(x, t.watchOuts[i] ?? t.watchOuts[0])),
          };
          po.prep.facts.render([c.text.headline, c.text.why, ...c.text.talkingPoints, ...c.text.watchOuts].join(' '));
        }
      }
      log(`${checked} strings checked: no digits outside fact tokens, no unknown tokens, no restricted names`);
      log(replaced ? `${replaced} strings replaced by the template version` : 'No replacements needed');
      summary.validation = { checked, replaced };
      set({ rowsIn: checked, rowsOut: checked - replaced });
    });

    const stored = await step('persist', async (log, set) => {
      const res = new Map<string, { briefId: string }>();
      let cards = 0;
      for (const po of outs) {
        const r = await persistDraft(db, runId, businessDate, po, health);
        res.set(po.prep.profileId, { briefId: r.briefId });
        cards += r.cards;
      }
      log(
        `${outs.length} briefs stored as drafts, ${cards} call cards, ${outs.reduce((a, p) => a + p.prep.facts.keys().length, 0).toLocaleString('en-US')} facts with lineage`,
      );
      set({ rowsIn: outs.length, rowsOut: cards });
      return res;
    });

    const held = new Set<string>();
    await step('qc_review', async (log, set) => {
      const reference = universalHash(outs[0]?.spec ?? []);
      const subjects = outs.map((po): QcSubject => ({
        profileId: po.prep.profileId,
        name: people.get(po.prep.profileId)?.full ?? '',
        facts: po.prep.facts,
        sections: po.spec,
        prefs: prefsMap.get(po.prep.profileId)!,
        forbidden: po.prep.forbidden,
        health,
        cardText: po.cards.flatMap((c) => [c.text.headline, c.text.why, ...c.text.talkingPoints, ...c.text.watchOuts]),
      }));
      const rows: {
        brief: string;
        profile: string;
        kind: string;
        status: string;
        checks: unknown;
        reviewer: string | null;
        notes: string | null;
      }[] = [];
      let autoFail = 0;
      for (const s of subjects) {
        const checks = automatedChecks(s, reference);
        const fail = checks.filter((c) => !c.ok);
        if (fail.length) {
          autoFail++;
          held.add(s.profileId);
          log(`HOLD ${s.name}: ${fail.map((f) => f.label).join('; ')}`);
        }
        rows.push({
          brief: stored.get(s.profileId)!.briefId,
          profile: s.profileId,
          kind: 'automated',
          status: fail.length ? 'flagged' : 'passed',
          checks,
          reviewer: 'Automated QC',
          notes: fail.length ? `${fail.length} checks failed` : 'All checks passed',
        });
      }
      log(
        `Automated QC: ${subjects.length - autoFail} of ${subjects.length} briefs passed all ${rows[0] ? (rows[0].checks as unknown[]).length : 0} checks (traceability, validator, information barrier, setup, universal sections identical, stale data, units, empty sections)`,
      );
      const sample = pickSample(subjects);
      log(`Spot-check: ${sample.length} of ${subjects.length} briefs sampled for the human reviewer`);
      let flagged = 0;
      for (const [i, s] of sample.entries()) {
        if (o.timelapse) await sleep(420);
        const r = simulatedSpotCheck(s, Boolean(o.qcFlag) && i === 0);
        if (r.status === 'flagged') {
          flagged++;
          held.add(s.profileId);
        }
        log(`${r.status === 'passed' ? 'PASS' : 'HOLD'} ${s.name}: ${r.notes}`);
        rows.push({
          brief: stored.get(s.profileId)!.briefId,
          profile: s.profileId,
          kind: 'spot_check',
          status: r.status,
          checks: r.checks,
          reviewer: r.reviewer,
          notes: r.notes,
        });
      }
      await db.asService(async (q) => {
        await q(`delete from qc_reviews where brief_id = any($1::uuid[])`, [rows.map((r) => r.brief)]);
        await q(
          `insert into qc_reviews (run_id, brief_id, profile_id, kind, status, checks, reviewer, notes, reviewed_at)
           select $1, (x->>'brief')::uuid, (x->>'profile')::uuid, x->>'kind', x->>'status', x->'checks', x->>'reviewer', x->>'notes', now() from jsonb_array_elements($2::jsonb) x`,
          [runId, JSON.stringify(rows)],
        );
        const heldIds = [...held].map((id) => stored.get(id)!.briefId);
        await q(
          `update briefs set qc_status = case when id = any($2::uuid[]) then 'flagged' else 'passed' end where run_id = $1`,
          [runId, heldIds],
        );
      });
      if (held.size) log(`${held.size} brief${held.size > 1 ? 's' : ''} held for review; not published, not emailed`);
      summary.qc = { automatedFailed: autoFail, sampled: sample.length, flagged, held: held.size };
      set({
        rowsIn: subjects.length,
        rowsOut: subjects.length - held.size,
        detail: { sampled: sample.length, held: held.size },
      });
    });

    // ---------------------------------------------------------------- stage 5: delivery (06:30)
    await step('publish', async (log, set) => {
      let n = 0;
      for (const po of outs) {
        if (held.has(po.prep.profileId)) continue;
        const prefs = prefsMap.get(po.prep.profileId)!;
        await db.asService((q) =>
          q(`update briefs set status = 'published', published_at = $2::timestamptz where id = $1`, [
            stored.get(po.prep.profileId)!.briefId,
            publishedAt(businessDate, po.prep.profileId, prefs.sendTime),
          ]),
        );
        n++;
      }
      log(
        `${n} dashboards published${held.size ? `; ${held.size} held` : ''}. Each person's brief is visible only to them (row-level security)`,
      );
      summary.published = {
        briefs: n,
        cards: outs.filter((p) => !held.has(p.prep.profileId)).reduce((a, p) => a + p.cards.length, 0),
      };
      set({ rowsIn: outs.length, rowsOut: n });
    });

    await step('deliver', async (log, set) => {
      const items: DeliveryItem[] = outs
        .filter((po) => !held.has(po.prep.profileId))
        .map((po) => {
          const cat = po.spec.find((s) => s.kind === 'catalysts');
          const generatedAtIso = new Date(`${businessDate}T05:15:00-04:00`).toISOString();
          return {
            briefId: stored.get(po.prep.profileId)!.briefId,
            profileId: po.prep.profileId,
            name: people.get(po.prep.profileId)?.full ?? '',
            email: people.get(po.prep.profileId)?.email ?? '',
            prefs: prefsMap.get(po.prep.profileId)!,
            facts: po.prep.facts,
            sections: po.spec,
            oneLine: (cat?.data.oneLine as string) ?? '',
            businessDate,
            generatedAt: generatedAtIso,
          };
        });
      const r = await deliver(db, runId, items, (health.email_relay ?? 'ok') === 'ok', log);
      log(`Nothing is ever sent to a client: recipients are the salespeople only`);
      summary.delivery = r;
      set({ rowsIn: items.length, rowsOut: r.dashboard + r.email, detail: r });
    });

    summary.durationMs = Date.now() - started;
    await db.asService((q) =>
      q(`update pipeline_runs set status='succeeded', finished_at=now(), summary=$2::jsonb where id=$1`, [
        runId,
        JSON.stringify(summary),
      ]),
    );
    publish(runId, { type: 'done', runId, status: 'succeeded', summary });
    return { runId, status: 'succeeded', summary };
  } catch (e) {
    summary.error = e instanceof Error ? e.message : String(e);
    console.error(`[pipeline ${runId.slice(0, 8)}] FAILED: ${summary.error}`);
    summary.durationMs = Date.now() - started;
    await db
      .asService((q) =>
        q(`update pipeline_runs set status='failed', finished_at=now(), summary=$2::jsonb where id=$1`, [
          runId,
          JSON.stringify(summary),
        ]),
      )
      .catch(() => {});
    publish(runId, { type: 'done', runId, status: 'failed', summary });
    return { runId, status: 'failed', summary };
  }
}
