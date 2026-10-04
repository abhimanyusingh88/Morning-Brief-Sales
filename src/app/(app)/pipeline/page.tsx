import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getMe } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fmtDate, fmtTimeET } from "@/lib/format";
import { RunViewer, type Step } from "./run-viewer";
import { Health } from "./health";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role === "sales") redirect("/");
  const sp = await searchParams;
  const db = await getDb();
  const runs = await db.asUser(me.id, (q) => q(`select id, business_date::text bd, trigger, status, started_at, finished_at, summary from pipeline_runs order by started_at desc limit 10`));
  const cur = runs.find((r) => String(r.id) === sp.run) ?? runs[0];
  const rows = cur ? await db.asUser(me.id, (q) => q(`select seq, key, label, status, started_at, finished_at, rows_in, rows_out, detail, log from pipeline_steps where run_id = $1 order by seq`, [cur.id])) : [];
  const steps: Step[] = rows.map((r) => ({
    seq: Number(r.seq), key: String(r.key), label: String(r.label), status: r.status as Step["status"],
    startedAt: r.started_at ? new Date(r.started_at as string).toISOString() : null, finishedAt: r.finished_at ? new Date(r.finished_at as string).toISOString() : null,
    rowsIn: r.rows_in as number | null, rowsOut: r.rows_out as number | null, detail: (r.detail as Record<string, unknown>) ?? {}, log: (r.log as string[]) ?? [],
  }));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Pipeline</h1>
        <p className="mt-0.5 text-[13.5px] text-muted">How each morning&apos;s briefs are made: ingest, match to books, rank, write, validate, publish.</p>
      </header>
      <RunViewer key={String(cur?.id ?? "none")} runId={cur ? String(cur.id) : null} initialSteps={steps} initialStatus={cur ? String(cur.status) : "idle"} initialSummary={(cur?.summary as Record<string, unknown>) ?? {}} canRun={me.role === "admin" || me.role === "desk_head"} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader title="Run history" />
          {runs.length ? (
            <table className="w-full text-[13px]">
              <thead className="bg-bg text-left text-[12px] text-muted"><tr><th className="px-5 py-2 font-medium">Started</th><th className="px-3 py-2 font-medium">For</th><th className="px-3 py-2 font-medium">Trigger</th><th className="px-3 py-2 text-right font-medium">Duration</th><th className="px-5 py-2 font-medium">Status</th></tr></thead>
              <tbody className="divide-y divide-line">
                {runs.map((r) => {
                  const d = r.finished_at ? (new Date(r.finished_at as string).getTime() - new Date(r.started_at as string).getTime()) / 1000 : null;
                  return (
                    <tr key={String(r.id)} className="hover:bg-sunken/60">
                      <td className="px-5 py-2"><a className="font-medium text-ink hover:text-brand-600" href={`/pipeline?run=${r.id}`}>{fmtTimeET(new Date(r.started_at as string).toISOString())}</a></td>
                      <td className="px-3 py-2 text-ink-2">{fmtDate(String(r.bd), { month: "short", day: "numeric" })}</td>
                      <td className="px-3 py-2 text-ink-2">{String(r.trigger)}</td>
                      <td className="num px-3 py-2 text-right text-ink-2">{d == null ? "—" : `${d.toFixed(1)} s`}</td>
                      <td className="px-5 py-2"><Badge tone={r.status === "succeeded" ? "up" : r.status === "failed" ? "down" : "brand"}>{String(r.status)}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <EmptyState title="No runs yet" body="Run the pipeline to produce today's briefs." />}
        </Card>
        <Health />
      </div>
    </div>
  );
}
