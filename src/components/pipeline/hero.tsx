'use client';
import { Check, ChevronRight, CircleAlert, Loader2, RotateCw } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Status, type Tone } from '@/components/ui/status';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { useNow } from './use-now';
import {
  clockText,
  fmtDuration,
  flowNodes,
  simSeconds,
  stageViews,
  type FlowNode,
  type RunView,
  type StageDef,
  type StageView,
} from './model';

function Clock({ view, running }: { view: RunView; running: boolean }) {
  const now = useNow(running);
  const t = clockText(simSeconds(view.steps, view.seen, now));
  return (
    <div className="flex items-baseline gap-3" aria-hidden>
      <span className="num font-mono text-[40px] font-medium leading-none tracking-[-0.03em] text-ink sm:text-[52px]">
        {t}
      </span>
      <span className="font-mono text-[13px] font-medium tracking-wide text-muted">ET</span>
    </div>
  );
}

function Wall({ view, running }: { view: RunView; running: boolean }) {
  const now = useNow(running, 500);
  const first = view.steps[0]?.startedAt ? new Date(view.steps[0].startedAt).getTime() : null;
  const done = typeof view.summary?.durationMs === 'number' ? (view.summary.durationMs as number) : null;
  const ms = running ? (first ? Math.max(0, now - first) : null) : done;
  return <span className="num font-mono">{fmtDuration(ms)}</span>;
}

const STATUS: Record<RunView['status'], { tone: Tone; label: string }> = {
  connecting: { tone: 'idle', label: 'Connecting' },
  running: { tone: 'run', label: 'Running' },
  succeeded: { tone: 'ok', label: 'Complete' },
  failed: { tone: 'bad', label: 'Failed' },
};

function StageBar({ s }: { s: StageView }) {
  const frac = s.total ? (s.done + (s.status === 'running' ? 0.5 : 0)) / s.total : 0;
  const label =
    s.status === 'done' ? 'Done' : s.status === 'running' ? 'In progress' : s.status === 'failed' ? 'Failed' : 'Queued';
  return (
    <li className="min-w-0">
      <div className="flex min-h-10 items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
          <span
            className={cn(
              'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[11px] font-semibold',
              s.status === 'done'
                ? 'border-up bg-up text-white'
                : s.status === 'running'
                  ? 'border-brand text-brand'
                  : s.status === 'failed'
                    ? 'border-down bg-down text-white'
                    : 'border-line-strong text-subtle',
            )}
          >
            {s.status === 'done' ? <Check size={11} strokeWidth={2.5} /> : s.status === 'failed' ? '!' : s.def.n}
          </span>
          <span className="leading-snug">{s.def.name}</span>
        </p>
        <span
          className={cn(
            'shrink-0 text-[11px] font-medium',
            s.status === 'running'
              ? 'text-brand-600'
              : s.status === 'failed'
                ? 'text-down'
                : s.status === 'done'
                  ? 'text-up'
                  : 'text-subtle',
          )}
        >
          {label}
        </span>
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-sunken"
        role="progressbar"
        aria-label={`${s.def.name} progress`}
        aria-valuemin={0}
        aria-valuemax={s.total}
        aria-valuenow={s.done}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            s.status === 'failed' ? 'bg-down' : s.status === 'done' ? 'bg-up' : 'bg-brand',
          )}
          style={{ width: `${Math.round(frac * 100)}%` }}
        />
      </div>
      <p className="num mt-1.5 text-[12px] text-muted">
        <span className="font-mono">{s.def.simAt}</span> · {s.done} of {s.total} steps
      </p>
    </li>
  );
}

function FlowCell({ n, last }: { n: FlowNode; last: boolean }) {
  return (
    <li
      className={cn(
        'relative min-w-0 rounded-lg border bg-surface px-3 py-2.5',
        n.status === 'run'
          ? 'border-brand/50 bg-brand-50/50'
          : n.status === 'bad'
            ? 'border-down/40 bg-down-50/60'
            : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow truncate">{n.label}</p>
        {n.status === 'run' ? (
          <Loader2 size={12} strokeWidth={1.5} className="animate-spin text-brand" aria-label="In progress" />
        ) : n.status === 'ok' ? (
          <Check size={12} strokeWidth={2} className="text-up" aria-label="Done" />
        ) : n.status === 'bad' ? (
          <CircleAlert size={12} strokeWidth={1.5} className="text-down" aria-label="Failed" />
        ) : null}
      </div>
      <p
        className={cn(
          'num mt-1 font-mono text-[18px] font-medium leading-6',
          n.figure ? 'text-ink' : 'text-line-strong',
        )}
      >
        {n.figure ?? '—'}
      </p>
      <p className="text-[12px] leading-snug text-muted">{n.caption}</p>
      {n.note ? <p className="num truncate text-[12px] text-muted">{n.note}</p> : null}
      {!last ? (
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className="absolute -right-[13px] top-1/2 z-10 hidden -translate-y-1/2 text-subtle 2xl:block"
        />
      ) : null}
    </li>
  );
}

export function Hero({
  view,
  stages,
  feedTotal,
  onRetry,
}: {
  view: RunView;
  stages: readonly StageDef[];
  feedTotal: number;
  onRetry: () => void;
}) {
  const running = view.status === 'running';
  const steps = view.steps;
  const cur =
    [...steps].reverse().find((s) => s.status === 'running') ??
    [...steps].reverse().find((s) => s.status !== 'pending') ??
    null;
  const sv = stageViews(stages, steps);
  const stage = cur ? stages.find((s) => s.n === cur.stage) : null;
  const st = STATUS[view.status];
  const where = cur
    ? view.status === 'succeeded'
      ? 'All 17 steps complete'
      : view.status === 'failed'
        ? `Stopped at step ${cur.seq} of ${steps.length}`
        : `Step ${cur.seq} of ${steps.length}`
    : 'Waiting for the first step';
  const flow = flowNodes(steps, view.feeds, feedTotal);
  const dateLabel = view.businessDate
    ? fmtDate(view.businessDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <Card>
      {view.conn === 'reconnecting' && view.status !== 'succeeded' && view.status !== 'failed' ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-t-[12px] border-b border-amber/30 bg-amber-50 px-5 py-2 text-[12.5px] font-medium text-amber"
        >
          <Loader2 size={13} strokeWidth={1.5} className="animate-spin" /> Connection lost. Reconnecting, the run keeps
          going on the server.
        </div>
      ) : null}
      {view.conn === 'failed' ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-t-[12px] border-b border-down/30 bg-down-50 px-5 py-2 text-[12.5px] font-medium text-down"
        >
          <span>Could not follow this run live.</span>
          <Button size="sm" onClick={onRetry}>
            <RotateCw size={13} strokeWidth={1.5} /> Try again
          </Button>
        </div>
      ) : null}

      <div className="grid gap-x-10 gap-y-5 px-5 pb-5 pt-5 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
        <div>
          <p className="eyebrow mb-2">
            Workflow clock · New York
            {dateLabel ? <span className="normal-case tracking-normal"> · {dateLabel}</span> : null}
          </p>
          <Clock view={view} running={running} />
          {/* the ticking clock is hidden from assistive technology; this line announces each step instead */}
          <p
            className="sr-only"
            aria-live="polite"
          >{`Simulated time ${cur?.simAt ?? '04:00'} ET. ${where}. ${cur?.label ?? ''} ${cur ? cur.status : ''}`}</p>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-x-10">
          <div className="min-w-0">
            <p className="num text-[12px] font-medium text-muted">
              {where}
              {stage ? (
                <>
                  {' '}
                  · <span>{stage.name}</span>
                </>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-[15px] font-semibold text-ink" title={cur?.label}>
              {cur?.label ?? 'Ready'}
            </p>
          </div>
          <dl className="flex gap-8 text-[12px] text-muted sm:justify-end">
            <div>
              <dt>Status</dt>
              <dd className="mt-0.5 text-[13px]">
                <Status tone={view.conn === 'reconnecting' && running ? 'warn' : st.tone}>
                  {view.conn === 'reconnecting' && running ? 'Reconnecting' : st.label}
                </Status>
              </dd>
            </div>
            <div>
              <dt>Wall time</dt>
              <dd className="mt-0.5 text-[13px] font-medium text-ink">
                <Wall view={view} running={running} />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <ol
        className="grid gap-x-5 gap-y-4 border-t border-line bg-bg/50 px-5 py-5 sm:grid-cols-2 xl:grid-cols-5 sm:px-6"
        aria-label="Pipeline stages"
      >
        {sv.map((s) => (
          <StageBar key={s.def.n} s={s} />
        ))}
      </ol>

      <div className="border-t border-line px-5 py-4 sm:px-6">
        <p className="eyebrow mb-2.5">Data flow</p>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-7" aria-label="Data flow">
          {flow.map((n, i) => (
            <FlowCell key={n.key} n={n} last={i === flow.length - 1} />
          ))}
        </ol>
      </div>
    </Card>
  );
}
