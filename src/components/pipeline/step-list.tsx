"use client";
import { Check, ChevronRight, Circle, Loader2, Minus, X } from "lucide-react";
import * as React from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { fmtInt, fmtMs, stepWallMs, type RunView, type StageDef, type StepState } from "./model";
import { useNow } from "./use-now";

const COLS = "grid-cols-[18px_minmax(0,1fr)_auto] sm:grid-cols-[18px_minmax(0,1fr)_44px_60px_60px_56px]";

function StepIcon({ status }: { status: StepState["status"] }) {
  const p = { size: 16, strokeWidth: 1.5 } as const;
  switch (status) {
    case "running": return <Loader2 {...p} className="animate-spin text-brand" aria-hidden />;
    case "succeeded": return <Check {...p} className="text-up" aria-hidden />;
    case "failed": return <X {...p} className="text-down" aria-hidden />;
    case "skipped": return <Minus {...p} className="text-subtle" aria-hidden />;
    default: return <Circle {...p} className="text-line-strong" aria-hidden />;
  }
}
const STATUS_TEXT: Record<StepState["status"], string> = { pending: "Queued", running: "Running", succeeded: "Done", failed: "Failed", skipped: "Skipped" };

function Wall({ step, since }: { step: StepState; since: number | undefined }) {
  const running = step.status === "running";
  const now = useNow(running, 250);
  if (running) return <>{fmtMs(Math.max(0, now - (since ?? now)))}</>;
  return <>{fmtMs(stepWallMs(step))}</>;
}

const lineTone = (l: string) => (/^(ERROR|HOLD|fail|FAIL)|\bDOWN\b|503/.test(l) ? "text-down" : /withheld|DELAYED|unavailable/i.test(l) ? "text-amber" : "text-ink-2");

/** Streams log lines in, newest at the bottom, and follows them unless the reader has scrolled up. */
function LogPane({ lines, label, live }: { lines: string[]; label: string; live: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const stick = React.useRef(true);
  React.useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  return (
    <div
      ref={ref} role="log" aria-label={`${label}: log`} tabIndex={0}
      onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
      className="scroll-thin max-h-56 overflow-auto rounded-lg bg-sunken px-3 py-2.5 font-mono text-[12.5px] leading-[1.55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {lines.length ? lines.map((l, i) => <p key={i} className={cn("whitespace-pre-wrap break-words", lineTone(l))}>{l}</p>) : <p className="text-muted">{live ? "Waiting for output…" : "No output recorded."}</p>}
    </div>
  );
}

export function StepList({ view, stages }: { view: RunView; stages: readonly StageDef[] }) {
  const [pinned, setPinned] = React.useState<Record<string, boolean>>({});
  const toggle = (key: string, now: boolean) => setPinned((p) => ({ ...p, [key]: !now }));
  const finished = view.steps.filter((s) => s.status === "succeeded").length;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader title="Workflow steps" sub="Start times, processed rows and logs for each stage." right={<span className="num pt-0.5 text-[12px] text-muted">{finished} of {view.steps.length} done</span>} />
      <div className={cn("hidden items-center gap-x-3 border-b border-line bg-bg/70 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle sm:grid", COLS)}>
        <span /><span>Step</span><span className="text-right">Clock</span><span className="text-right">Rows in</span><span className="text-right">Rows out</span><span className="text-right">Time</span>
      </div>
      <ol aria-label="Pipeline steps">
        {stages.map((stage) => (
          <li key={stage.n}>
            <p className="flex items-baseline gap-2 border-b border-line bg-bg/70 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              <span className="num">{stage.n}</span> {stage.name} <span className="num font-mono font-medium normal-case tracking-normal text-subtle">{stage.simAt}</span>
            </p>
            <ol className="divide-y divide-line border-b border-line last:border-b-0">
              {view.steps.filter((s) => s.stage === stage.n).map((s) => {
                const open = pinned[s.key] ?? (s.status === "running" || s.status === "failed");
                const hasLog = s.log.length > 0 || s.status === "running";
                return (
                  <li key={s.key} className={cn(s.status === "running" && "bg-brand-50/40")}>
                    <button
                      type="button" disabled={!hasLog} aria-expanded={hasLog ? open : undefined} onClick={() => toggle(s.key, open)}
                      className={cn("grid w-full items-start gap-x-3 px-5 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand", COLS, hasLog ? "cursor-pointer hover:bg-sunken/60" : "cursor-default")}
                    >
                      <span className="mt-[1px]"><StepIcon status={s.status} /></span>
                      <span className="min-w-0">
                        <span className={cn("flex items-start gap-1 text-[13px] leading-snug", s.status === "pending" ? "text-muted" : "font-medium text-ink")}>
                          <span className="min-w-0">{s.label}</span>
                          {hasLog ? <ChevronRight size={13} strokeWidth={1.5} aria-hidden className={cn("mt-[3px] shrink-0 text-subtle transition-transform", open && "rotate-90")} /> : null}
                        </span>
                        <span className="sr-only">{STATUS_TEXT[s.status]}</span>
                        {s.status === "failed" ? <span className="mt-0.5 block text-[12px] font-medium text-down">Failed</span> : null}
                      </span>
                      <span className="num hidden pt-px text-right font-mono text-[12.5px] text-muted sm:block">{s.simAt}</span>
                      <span className="num hidden pt-px text-right text-[12.5px] text-ink-2 sm:block">{s.rowsIn == null ? "—" : fmtInt(s.rowsIn)}</span>
                      <span className="num hidden pt-px text-right text-[12.5px] text-ink-2 sm:block">{s.rowsOut == null ? "—" : fmtInt(s.rowsOut)}</span>
                      <span className="num pt-px text-right text-[12.5px] text-muted">{s.status === "pending" ? "—" : <Wall step={s} since={view.seen[s.seq]} />}</span>
                    </button>
                    {hasLog && open ? <div className="px-5 pb-3 sm:pl-[50px]"><LogPane lines={s.log} label={s.label} live={s.status === "running"} /></div> : null}
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </Card>
  );
}
