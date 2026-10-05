"use client";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";

export function ControlPanel({ scenarios, initial }: { scenarios: { key: string; label: string }[]; initial: string[] }) {
  const router = useRouter();
  const [sel, setSel] = React.useState<string[]>(initial);
  const [live, setLive] = React.useState(true);
  const [busy, setBusy] = React.useState<"run" | "reset" | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const run = async () => {
    setBusy("run"); setNote(null);
    const r = await fetch("/api/pipeline/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarios: sel, live }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setNote(j.error ?? "Could not start the run"); setBusy(null); return; }
    router.push(`/pipeline?run=${j.runId}`);
  };
  const reset = async () => {
    setBusy("reset"); setNote(null);
    const r = await fetch("/api/demo/reset", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setNote(r.ok ? `Reset ${j.reset} call card${j.reset === 1 ? "" : "s"} to new.` : j.error ?? "Could not reset");
    setBusy(null);
  };

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="sr-only">Scenarios</legend>
        <div className="space-y-2">
          {scenarios.map((s) => (
            <label key={s.key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 hover:border-line-strong has-[:checked]:border-brand has-[:checked]:bg-brand-50/50">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={sel.includes(s.key)} onChange={() => setSel((c) => (c.includes(s.key) ? c.filter((x) => x !== s.key) : [...c, s.key]))} />
              <span className="text-[13.5px] font-medium">{s.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex cursor-pointer items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4 accent-brand" checked={live} onChange={(e) => setLive(e.target.checked)} /> Follow each step with paced playback</label>
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button variant="primary" size="lg" onClick={run} disabled={busy !== null || !sel.length}>{busy === "run" ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run morning pipeline</Button>
        <Button variant="secondary" size="lg" onClick={reset} disabled={busy !== null}>{busy === "reset" ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />} Reset call statuses</Button>
        {note ? <p role="status" className="text-[13px] text-muted">{note}</p> : null}
      </div>
    </div>
  );
}
