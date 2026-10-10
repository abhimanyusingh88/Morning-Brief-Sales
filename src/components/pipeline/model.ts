/** Client-side model of one morning run: what the stream sends, folded into the state the viewer draws. */
import type { FeedState } from '@/lib/feeds/connectors';
import type { FeedCategory } from '@/lib/feeds/registry';
import type { PipelineEvent, StepState } from '@/lib/pipeline/bus';

export type { FeedState, StepState, PipelineEvent };

export interface StageDef {
  n: number;
  simAt: string;
  name: string;
  detail: string;
}
export type StepDef = readonly [key: string, label: string, stage: number, simAt: string];

export type Conn = 'connecting' | 'live' | 'reconnecting' | 'closed' | 'failed';
export type RunStatus = 'connecting' | 'running' | 'succeeded' | 'failed';

export interface RunView {
  runId: string | null;
  businessDate: string | null;
  status: RunStatus;
  steps: StepState[];
  feeds: Record<string, FeedState>;
  summary: Record<string, unknown> | null;
  /** local time at which each step was first seen running (drives the clock between events) */
  seen: Record<number, number>;
  conn: Conn;
}

export const skeleton = (defs: readonly StepDef[]): StepState[] =>
  defs.map(([key, label, stage, simAt], i) => ({
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

export const initialView = (runId: string | null, defs: readonly StepDef[]): RunView => ({
  runId,
  businessDate: null,
  status: 'connecting',
  steps: skeleton(defs),
  feeds: {},
  summary: null,
  seen: {},
  conn: 'connecting',
});

export type Action =
  { type: 'event'; ev: PipelineEvent; now: number; defs: readonly StepDef[] } | { type: 'conn'; conn: Conn };

// Use the workflow definition for display metadata when replaying older runs.
// Stored step results and logs are preserved without changing the database.
function displayStep(step: StepState, defs: readonly StepDef[]): StepState {
  const def = defs.find(([key]) => key === step.key);
  return def ? { ...step, stage: def[2], simAt: def[3] } : step;
}

export function reduce(v: RunView, a: Action): RunView {
  if (a.type === 'conn') return v.conn === a.conn ? v : { ...v, conn: a.conn };
  const { ev, now } = a;
  switch (ev.type) {
    case 'run':
      // every (re)connection replays from the start, so a run event always begins afresh
      return {
        ...v,
        businessDate: ev.businessDate,
        status: ev.status,
        steps: ev.steps.length ? ev.steps.map((step) => displayStep(step, a.defs)) : skeleton(a.defs),
        feeds: {},
        summary: null,
        seen: {},
        conn: 'live',
      };
    case 'step': {
      const seen =
        ev.step.status === 'running' && v.seen[ev.step.seq] == null ? { ...v.seen, [ev.step.seq]: now } : v.seen;
      return { ...v, seen, steps: v.steps.map((s) => (s.seq === ev.step.seq ? displayStep(ev.step, a.defs) : s)) };
    }
    case 'feed':
      return { ...v, feeds: { ...v.feeds, [ev.feed.feedKey]: ev.feed } };
    case 'log':
      return { ...v, steps: v.steps.map((s) => (s.key === ev.key ? { ...s, log: [...s.log, ev.line] } : s)) };
    case 'done':
      return { ...v, status: ev.status, summary: ev.summary, conn: 'closed' };
  }
}

// ---------------------------------------------------------------- derived

export type StageStatus = 'pending' | 'running' | 'done' | 'failed';
export interface StageView {
  def: StageDef;
  status: StageStatus;
  done: number;
  total: number;
}

export function stageViews(stages: readonly StageDef[], steps: StepState[]): StageView[] {
  return stages.map((def) => {
    const mine = steps.filter((s) => s.stage === def.n);
    const done = mine.filter((s) => s.status === 'succeeded' || s.status === 'skipped').length;
    const status: StageStatus = mine.some((s) => s.status === 'failed')
      ? 'failed'
      : mine.some((s) => s.status === 'running')
        ? 'running'
        : done === mine.length && mine.length
          ? 'done'
          : done > 0
            ? 'running'
            : 'pending';
    return { def, status, done, total: mine.length };
  });
}

const GROUPS: { key: string; label: string; steps: string[] }[] = [
  { key: 'sources', label: 'Sources', steps: ['ingest_feeds'] },
  { key: 'normalise', label: 'Normalise', steps: ['entitlement_filter'] },
  { key: 'tag', label: 'Tag', steps: ['tag_events'] },
  { key: 'match', label: 'Match', steps: ['load_preferences', 'match_book', 'score_rank', 'rank_select'] },
  {
    key: 'compose',
    label: 'Compose',
    steps: ['build_facts', 'compose_sections', 'narrative', 'generate_brief', 'generate_cards', 'validate', 'persist'],
  },
  { key: 'qc', label: 'QC', steps: ['qc_review'] },
  { key: 'deliver', label: 'Deliver', steps: ['publish', 'deliver'] },
];

export interface FlowNode {
  key: string;
  label: string;
  status: 'idle' | 'run' | 'ok' | 'bad';
  figure: string | null;
  caption: string;
  note: string | null;
}

const n = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
export const fmtInt = (x: number) => x.toLocaleString('en-US');

/** The data-flow strip: Sources → Normalise → Tag → Match → Compose → QC → Deliver, each with the figure that lands there. */
export function flowNodes(steps: StepState[], feeds: Record<string, FeedState>, feedTotal: number): FlowNode[] {
  const by = (k: string) => steps.find((s) => s.key === k);
  const done = (k: string) => by(k)?.status === 'succeeded';
  const feedList = Object.values(feeds);
  const ok = feedList.filter((f) => f.status === 'ok').length;
  const landed = feedList.reduce((a, f) => a + (f.status === 'running' ? 0 : f.rows), 0);
  const qc = by('qc_review');
  const held = n(qc?.detail?.held);
  const pub = by('publish');
  const del = by('deliver');
  const email = n(del?.detail?.email);
  const fig = (v: number | null, when: boolean) => (when && v != null ? fmtInt(v) : null);
  const figures: Record<string, [string | null, string]> = {
    sources: [feedList.length ? `${ok} / ${feedTotal}` : null, 'feeds ok'],
    normalise: [feedList.length ? fmtInt(landed) : null, 'rows landed'],
    tag: [fig(by('tag_events')?.rowsOut ?? null, done('tag_events')), 'events tagged'],
    match: [fig(by('match_book')?.rowsOut ?? null, done('match_book')), 'opportunities'],
    compose: [fig(by('compose_sections')?.rowsIn ?? null, done('compose_sections')), 'briefs composed'],
    qc: [done('qc_review') && qc?.rowsOut != null ? `${fmtInt(qc.rowsOut)} / ${held ?? 0}` : null, 'passed / held'],
    deliver: [fig(pub?.rowsOut ?? null, done('publish')), 'dashboards published'],
  };
  return GROUPS.map((g) => {
    const mine = g.steps.map(by).filter((s): s is StepState => Boolean(s));
    const status: FlowNode['status'] = mine.some((s) => s.status === 'failed')
      ? 'bad'
      : mine.some((s) => s.status === 'running')
        ? 'run'
        : mine.length && mine.every((s) => s.status === 'succeeded')
          ? 'ok'
          : 'idle';
    const [figure, caption] = figures[g.key];
    return {
      key: g.key,
      label: g.label,
      status,
      figure,
      caption,
      note: g.key === 'deliver' && done('deliver') && email != null ? `${fmtInt(email)} emails queued` : null,
    };
  });
}

// ---------------------------------------------------------------- clock

const hm = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 3600 + m * 60;
};
export const clockText = (sec: number) => {
  const t = Math.floor(sec);
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((x) => String(x).padStart(2, '0')).join(':');
};

/**
 * The simulated New York clock. It jumps to a step's own time when the step starts and eases toward (never reaching)
 * the next step's time while it runs, so a long step looks busy and a short one still moves.
 */
export function simSeconds(steps: StepState[], seen: Record<number, number>, now: number, tau = 3000): number {
  let idx = -1;
  steps.forEach((s, i) => {
    if (s.status !== 'pending') idx = i;
  });
  if (idx < 0) return hm(steps[0]?.simAt ?? '04:00');
  const s = steps[idx];
  const start = hm(s.simAt);
  const next = steps[idx + 1] ? hm(steps[idx + 1].simAt) : start + 60;
  const gap = Math.max(0, next - start);
  const elapsed =
    s.status === 'running'
      ? Math.max(0, now - (seen[s.seq] ?? now))
      : s.startedAt && s.finishedAt
        ? Math.max(0, new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime())
        : 0;
  return start + gap * 0.96 * (1 - Math.exp(-elapsed / tau));
}

// ---------------------------------------------------------------- feeds

export type FeedUiStatus = 'queued' | 'connecting' | 'ok' | 'delayed' | 'down' | 'none';
export function feedUiStatus(f: FeedState | undefined, runStatus: RunStatus, ingestDone: boolean): FeedUiStatus {
  if (!f) return runStatus === 'running' || runStatus === 'connecting' ? (ingestDone ? 'none' : 'queued') : 'none';
  return f.status === 'running' ? 'connecting' : f.status;
}

export const CATEGORY_LABEL: Record<FeedCategory, string> = {
  market: 'Market data',
  reference: 'Reference data',
  news: 'News',
  calendar: 'Calendars',
  corporate: 'Corporate events',
  client: 'Client book',
  compliance: 'Compliance',
  delivery: 'Delivery',
};
export const CATEGORY_ORDER: FeedCategory[] = [
  'market',
  'reference',
  'news',
  'calendar',
  'corporate',
  'client',
  'compliance',
  'delivery',
];

// ---------------------------------------------------------------- formatting

export const etTime = (iso: string | null | undefined, seconds = false): string =>
  iso
    ? new Date(iso).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        ...(seconds ? { second: '2-digit' } : {}),
        hour12: false,
        timeZone: 'America/New_York',
      })
    : '—';

export const fmtMs = (ms: number | null | undefined) =>
  ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
export const fmtDuration = (ms: number | null | undefined) => {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

export const stepWallMs = (s: StepState): number | null =>
  s.startedAt && s.finishedAt ? Math.max(0, new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) : null;
