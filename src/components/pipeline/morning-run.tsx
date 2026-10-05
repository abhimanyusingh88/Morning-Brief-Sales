"use client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { FEEDS } from "@/lib/feeds/registry";
import { ControlBar } from "./control-bar";
import { FeedMap } from "./feed-map";
import { Hero } from "./hero";
import { History, type HistoryRow } from "./history";
import type { StageDef, StepDef } from "./model";
import { ResultPanel } from "./result-panel";
import { StepList } from "./step-list";
import { useRunStream } from "./use-run-stream";

function Viewer({ runId, stages, steps, role, onStart, onDone }: { runId: string; stages: readonly StageDef[]; steps: readonly StepDef[]; role: string; onStart: () => void; onDone: () => void }) {
  const { view, retry } = useRunStream(runId, steps, { onStart, onDone });
  return (
    <div className="space-y-6" aria-busy={view.status === "connecting"}>
      <Hero view={view} stages={stages} feedTotal={FEEDS.length} onRetry={retry} />
      <ResultPanel view={view} role={role} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <StepList view={view} stages={stages} />
        <FeedMap view={view} />
      </div>
    </div>
  );
}

export function MorningRun({ stages, steps, scenarios, defaults, canRun, role, runs, initialRunId, health }: {
  stages: readonly StageDef[]; steps: readonly StepDef[];
  scenarios: { key: string; label: string }[]; defaults: { date: string; scenarios: string[] };
  canRun: boolean; role: string; runs: HistoryRow[]; initialRunId: string | null; health: React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string | null>(initialRunId ?? runs[0]?.id ?? null);
  const [active, setActive] = React.useState<string | null>(runs.find((r) => r.status === "running")?.id ?? null);

  const select = React.useCallback((id: string) => {
    setSelected(id);
    try { window.history.replaceState(null, "", `?run=${id}`); } catch { /* the address bar is a convenience only */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const started = React.useCallback((id: string) => { setActive(id); select(id); }, [select]);

  // a live run that the viewer is not showing: keep the history fresh and notice when it ends
  const activeRow = runs.find((r) => r.id === active);
  React.useEffect(() => {
    if (!active || selected === active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, selected, router]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the live marker once the server reports the run finished
  React.useEffect(() => { if (active && activeRow && activeRow.status !== "running") setActive(null); }, [active, activeRow]);

  return (
    <>
      <ControlBar scenarios={scenarios} defaults={defaults} canRun={canRun} running={Boolean(active)} onStarted={started} />
      {active && selected !== active ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-brand/30 bg-brand-50 px-5 py-3 text-[13px] text-brand-600">
          <span>A run is in progress. You are looking at an earlier one.</span>
          <Button size="sm" onClick={() => select(active)}>Watch the live run</Button>
        </div>
      ) : null}
      {selected ? (
        <Viewer key={selected} runId={selected} stages={stages} steps={steps} role={role} onStart={() => router.refresh()} onDone={() => { setActive((a) => (a === selected ? null : a)); router.refresh(); }} />
      ) : (
        <Card><EmptyState title="No morning has been run yet" body="Choose the options above and select Run the morning. The whole 04:00 to 06:30 pipeline plays here, feed by feed." /></Card>
      )}
      <History runs={runs} selectedId={selected} onSelect={select} />
      {health}
    </>
  );
}
