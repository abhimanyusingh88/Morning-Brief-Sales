"use client";
import * as React from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Status, type Tone } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { fmtDuration, fmtInt } from "./model";

export interface HistoryRow {
  id: string;
  startedAt: string;
  businessDate: string;
  trigger: string;
  status: "running" | "succeeded" | "failed";
  durationMs: number | null;
  published: number | null;
  held: number | null;
  feedsOk: number | null;
  feedsTotal: number | null;
}

const TONE: Record<HistoryRow["status"], { tone: Tone; label: string }> = { running: { tone: "run", label: "Running" }, succeeded: { tone: "ok", label: "Complete" }, failed: { tone: "bad", label: "Failed" } };
const started = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
const TH = "px-3 py-2 font-medium first:pl-5 last:pr-5";

export function History({ runs, selectedId, onSelect }: { runs: HistoryRow[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Run history" sub="Select a run to replay it in the viewer above." />
      {runs.length ? (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[720px] text-[12.5px]">
            <thead className="bg-bg/70 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle">
              <tr>
                <th className={TH}>Started</th><th className={TH}>For</th><th className={TH}>Trigger</th><th className={TH}>Status</th>
                <th className={cn(TH, "text-right")}>Duration</th><th className={cn(TH, "text-right")}>Briefs</th><th className={cn(TH, "text-right")}>Feeds ok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => {
                const sel = r.id === selectedId;
                const t = TONE[r.status];
                return (
                  <tr key={r.id} onClick={() => onSelect(r.id)} aria-current={sel ? "true" : undefined} className={cn("cursor-pointer hover:bg-sunken/60", sel && "bg-brand-50/50")}>
                    <td className="px-3 py-2 first:pl-5">
                      <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(r.id); }} className="cursor-pointer rounded font-medium text-ink hover:text-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{started(r.startedAt)}</button>
                    </td>
                    <td className="num px-3 py-2 text-ink-2">{fmtDate(r.businessDate, { month: "short", day: "numeric" })}</td>
                    <td className="px-3 py-2 capitalize text-ink-2">{r.trigger === "demo" ? "Manual" : r.trigger}</td>
                    <td className="px-3 py-2"><Status tone={t.tone}>{t.label}</Status></td>
                    <td className="num px-3 py-2 text-right text-ink-2">{r.status === "running" ? "—" : fmtDuration(r.durationMs)}</td>
                    <td className="num px-3 py-2 text-right text-ink-2">{r.published == null ? "—" : <>{fmtInt(r.published)}{r.held ? <span className="text-amber"> · {r.held} held</span> : null}</>}</td>
                    <td className="num px-3 py-2 text-right text-ink-2 last:pr-5">{r.feedsTotal ? `${r.feedsOk} / ${r.feedsTotal}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No runs yet" body="Run the morning to see it here." />}
    </Card>
  );
}
