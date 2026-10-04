/** In-process fan-out of pipeline progress, so the monitor can stream a run as it happens. */
export interface StepState {
  seq: number;
  key: string;
  label: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  startedAt: string | null;
  finishedAt: string | null;
  rowsIn: number | null;
  rowsOut: number | null;
  detail: Record<string, unknown>;
  log: string[];
}

export type PipelineEvent =
  | { type: "run"; runId: string; businessDate: string; status: "running" | "succeeded" | "failed"; steps: StepState[] }
  | { type: "step"; runId: string; step: StepState }
  | { type: "log"; runId: string; key: string; line: string; at: string }
  | { type: "done"; runId: string; status: "succeeded" | "failed"; summary: Record<string, unknown> };

type Listener = (e: PipelineEvent) => void;
interface Channel { events: PipelineEvent[]; listeners: Set<Listener>; closed: boolean }

const g = globalThis as unknown as { __mbBus?: Map<string, Channel> };
const channels = (g.__mbBus ??= new Map());

export function publish(runId: string, e: PipelineEvent) {
  let ch = channels.get(runId);
  if (!ch) channels.set(runId, (ch = { events: [], listeners: new Set(), closed: false }));
  ch.events.push(e);
  if (e.type === "done") ch.closed = true;
  for (const l of ch.listeners) l(e);
  // keep memory bounded: only recent runs are replayable from memory
  if (channels.size > 20) channels.delete(channels.keys().next().value as string);
}

/** Replays what already happened, then follows live. Returns an unsubscribe. */
export function subscribe(runId: string, l: Listener): (() => void) | null {
  const ch = channels.get(runId);
  if (!ch) return null;
  for (const e of ch.events) l(e);
  if (ch.closed) return () => {};
  ch.listeners.add(l);
  return () => ch.listeners.delete(l);
}

export const hasChannel = (runId: string) => channels.has(runId);
