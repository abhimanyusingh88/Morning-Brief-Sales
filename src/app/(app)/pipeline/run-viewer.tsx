"use client";
import { AlertCircle, CheckCircle2, Circle, Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export interface Step { seq: number; key: string; label: string; status: "pending" | "running" | "succeeded" | "failed" | "skipped"; startedAt: string | null; finishedAt: string | null; rowsIn: number | null; rowsOut: number | null; detail: Record<string, unknown>; log: string[] }
type Ev =
  | { type: "run"; runId: string; steps: Step[]; status: string }
  | { type: "step"; step: Step }
  | { type: "log"; key: string; line: string }
  | { type: "done"; status: "succeeded" | "failed"; summary: Record<string, unknown> };

const ms = (s: Step) => (typeof s.detail.ms === "number" ? (s.detail.ms as number) : s.startedAt && s.finishedAt ? new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime() : null);
const dur = (n: number | null) => (n == null ? "" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);

export function RunViewer({ runId, initialSteps, initialStatus, initialSummary, canRun }: { runId: string | null; initialSteps: Step[]; initialStatus: string; initialSummary: Record<string, unknown>; canRun: boolean }) {
  const router = useRouter();
  const [id, setId] = React.useState(runId);
  const [steps, setSteps] = React.useState<Step[]>(initialSteps);
  const [status, setStatus] = React.useState(initialStatus);
  const [summary, setSummary] = React.useState<Record<string, unknown>>(initialSummary);
  const [focus, setFocus] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const logEnd = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!id || (status !== "running")) return;
    const es = new EventSource(`/api/pipeline/runs/${id}/stream`);
    const on = (e: MessageEvent) => {
      const ev = JSON.parse(e.data) as Ev;
      if (ev.type === "run" && ev.steps.length) { setSteps(ev.steps); setStatus(ev.status); }
      if (ev.type === "step") setSteps((all) => all.map((s) => (s.seq === ev.step.seq ? ev.step : s)));
      if (ev.type === "log") setSteps((all) => all.map((s) => (s.key === ev.key && !s.log.includes(ev.line) ? { ...s, log: [...s.log, ev.line] } : s)));
      if (ev.type === "done") { setStatus(ev.status); setSummary(ev.summary); es.close(); router.refresh(); }
    };
    for (const t of ["run", "step", "log", "done"]) es.addEventListener(t, on as EventListener);
    es.onerror = () => { /* the stream closes when the run ends */ };
    return () => es.close();
  }, [id, status, router]);

  const start = async (live: boolean) => {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch("/api/pipeline/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ live }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Could not start");
      const { runId: newId } = await r.json();
      setSteps(steps.map((s) => ({ ...s, status: "pending", log: [], startedAt: null, finishedAt: null, rowsIn: null, rowsOut: null })));
      setSummary({});
      setFocus(null);
      setId(newId);
      setStatus("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start");
    } finally {
      setStarting(false);
    }
  };

  const active = steps.find((s) => s.status === "running") ?? steps.filter((s) => s.status !== "pending").at(-1);
  const shown = steps.find((s) => s.key === focus) ?? active ?? steps[0];
  React.useEffect(() => { logEnd.current?.scrollIntoView({ block: "end" }); }, [shown?.log.length, shown?.key]);
  const done = steps.filter((s) => s.status === "succeeded").length;
  const gen = (summary.generation ?? {}) as Record<string, number>;
  const pub = (summary.published ?? {}) as Record<string, number>;
  const val = (summary.validation ?? {}) as Record<string, number>;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={status === "running" ? "Morning pipeline running" : status === "failed" ? "Last run failed" : "Last morning run"}
        sub={steps.length ? `${done} of ${steps.length} steps complete` : "No runs yet"}
        right={canRun ? (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => start(true)} disabled={starting || status === "running"}><Play size={13} /> Run live</Button>
            <Button size="sm" variant="primary" onClick={() => start(false)} disabled={starting || status === "running"}>{starting || status === "running" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run now</Button>
          </div>
        ) : null}
      />
      {error ? <p role="alert" className="border-b border-line bg-down-50 px-5 py-2 text-[13px] text-down">{error}</p> : null}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ol className="divide-y divide-line border-b border-line lg:border-b-0 lg:border-r">
          {steps.map((s) => (
            <li key={s.key}>
              <button onClick={() => setFocus(s.key)} className={cn("flex w-full cursor-pointer items-center gap-3 px-5 py-2.5 text-left hover:bg-sunken/60", shown?.key === s.key && "bg-brand-50/60")}>
                <span className="w-4 shrink-0">
                  {s.status === "succeeded" ? <CheckCircle2 size={16} className="text-up" /> : s.status === "running" ? <Loader2 size={16} className="animate-spin text-brand" /> : s.status === "failed" ? <AlertCircle size={16} className="text-down" /> : <Circle size={16} className="text-line-strong" />}
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", s.status === "pending" ? "text-subtle" : "font-medium text-ink")}>{s.label}</span>
                <span className="num shrink-0 text-[12px] text-muted">{s.status === "succeeded" ? `${s.rowsOut != null ? `${s.rowsOut.toLocaleString()} rows · ` : ""}${dur(ms(s))}` : ""}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="flex min-h-[320px] flex-col bg-navy text-[12.5px] text-white/85">
          <div className="flex items-center justify-between border-b border-navy-line px-4 py-2.5">
            <span className="mono text-[11.5px] text-white/50">{shown ? `${shown.seq.toString().padStart(2, "0")} · ${shown.key}` : "log"}</span>
            {status === "running" ? <span className="flex items-center gap-1.5 text-[11.5px] text-cyan"><span className="live-dot h-1.5 w-1.5 rounded-full bg-cyan" /> live</span> : null}
          </div>
          <div className="scroll-thin mono max-h-[420px] flex-1 space-y-1 overflow-y-auto p-4 leading-relaxed">
            {shown?.log.length ? shown.log.map((l, i) => <p key={i}><span className="text-cyan/70">›</span> {l}</p>) : <p className="text-white/35">{shown?.status === "pending" ? "Waiting…" : "No output."}</p>}
            <div ref={logEnd} />
          </div>
        </div>
      </div>
      {status === "succeeded" || status === "failed" ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line bg-bg px-5 py-3 text-[12.5px]">
          <Badge tone={status === "succeeded" ? "up" : "down"}>{status === "succeeded" ? "Succeeded" : "Failed"}</Badge>
          {typeof summary.durationMs === "number" ? <span className="text-muted">Took <span className="num font-semibold text-ink">{dur(summary.durationMs as number)}</span></span> : null}
          {pub.briefs ? <span className="text-muted"><span className="num font-semibold text-ink">{pub.briefs}</span> briefs · <span className="num font-semibold text-ink">{pub.cards}</span> call cards</span> : null}
          {val.checked ? <span className="text-muted"><span className="num font-semibold text-ink">{val.checked.toLocaleString()}</span> strings checked, <span className="num font-semibold text-ink">{val.replaced}</span> replaced</span> : null}
          {summary.llm ? <span className="text-muted">Model: <span className="num font-semibold text-ink">{gen.accepted ?? 0}</span> accepted · <span className="num font-semibold text-ink">{gen.repaired ?? 0}</span> repaired · <span className="num font-semibold text-ink">{(gen.fallback ?? 0) + (gen.failed ?? 0)}</span> template</span> : <span className="text-muted">Writer: template (no model configured)</span>}
          {typeof summary.error === "string" ? <span className="text-down">{summary.error}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}
