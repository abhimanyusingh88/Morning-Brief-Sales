import { Check, X } from "lucide-react";
import { redirect } from "next/navigation";
import { HoldRelease, ViewBrief } from "@/components/ops/qc-actions";
import { RunPicker } from "@/components/ops/run-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { getMe } from "@/lib/auth/session";
import { getQcView, isOpsRole } from "@/lib/data/ops";
import { getDb } from "@/lib/db";

export const metadata = { title: "QC review" };
export const dynamic = "force-dynamic";

const CHECK_LABEL: Record<string, string> = {
  traceable: "Sources", no_free_numbers: "Numbers", information_barrier: "Barrier",
  setup_honoured: "Setup", universal_identical: "Consistency", stale_withheld: "Freshness",
  units: "Units", no_empty_sections: "Content",
};

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return <Card><CardBody><p className="eyebrow">{label}</p><p className="num mt-1 text-[24px] font-semibold tracking-[-0.02em] text-ink">{value}</p>{sub ? <p className="mt-0.5 text-[12px] text-muted">{sub}</p> : null}</CardBody></Card>;
}

export default async function Qc({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!isOpsRole(me.role)) redirect("/");
  const v = await getQcView(await getDb(), me.id, (await searchParams).run);
  const s = v.summary;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operations" title="QC review" description="Every brief is checked automatically and a sample is spot-checked before it publishes. A brief that fails is held and never delivered until someone releases it." actions={<RunPicker runs={v.runs} current={v.run?.id ?? null} base="/qc" />} />
      {!v.run || v.rows.length === 0 ? (
        <Card><EmptyState title="Nothing to review yet" body="Briefs appear here once a morning run has generated them." /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Checked" value={s.checked} sub="8 automated checks each" />
            <Stat label="Passed" value={s.passed} />
            <Stat label="Held" value={s.held} sub={s.held ? "Not delivered" : "Nothing held"} />
            <Stat label="Spot-checked" value={<>{s.sampledPassed}<span className="text-muted"> / {s.sampled}</span></>} sub={s.sampledFlagged ? `${s.sampledFlagged} flagged` : "none flagged"} />
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left"><th className="eyebrow w-[220px] px-5 py-2.5 font-medium">Salesperson</th>
                  {v.checkColumns.map((c) => <th key={c.name} title={c.label} aria-label={c.label} className="whitespace-nowrap px-2 py-3 text-center text-[11px] font-medium text-muted">{CHECK_LABEL[c.name] ?? c.label}</th>)}
                  <th className="eyebrow px-3 py-2.5 font-medium">Spot check</th><th className="eyebrow px-3 py-2.5 font-medium">State</th><th className="px-5 py-2.5" /></tr>
              </thead>
              <tbody>
                {v.rows.map((r) => {
                  const spot = r.reviews.at(-1);
                  return (
                    <tr key={r.briefId} className="border-b border-line last:border-0">
                      <td className="px-5 py-3"><p className="font-medium text-ink">{r.name}</p><p className="mt-1 max-w-[200px] truncate text-[12px] text-muted" title={`${r.title}${r.desk ? ` · ${r.desk}` : ""}`}>{r.title}{r.desk ? ` · ${r.desk}` : ""}</p></td>
                      {v.checkColumns.map((c) => {
                        const ck = r.automated?.checks.find((x) => x.name === c.name);
                        return <td key={c.name} className="px-2 py-2.5 text-center" title={ck?.detail}>{!ck ? <span className="text-muted">—</span> : ck.ok ? <Check size={14} strokeWidth={1.75} className="mx-auto text-up" aria-label="passed" /> : <X size={14} strokeWidth={1.75} className="mx-auto text-down" aria-label="failed" />}</td>;
                      })}
                      <td className="px-3 py-2.5 text-[12px] text-ink-2" title={spot?.reviewer ?? undefined}>{spot ? <span className="capitalize">{spot.status}</span> : r.sampled ? "Pending" : <span className="whitespace-nowrap text-muted">Not sampled</span>}</td>
                      <td className="px-3 py-2.5">{r.held ? <Badge tone="down">Held</Badge> : r.status === "published" ? <Badge tone="up">Published</Badge> : <Badge tone="amber">Draft</Badge>}</td>
                      <td className="px-5 py-2.5 text-right"><span className="inline-flex items-center gap-1"><ViewBrief briefId={r.briefId} name={r.name} /><HoldRelease briefId={r.briefId} held={r.held} canAct={true} /></span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
