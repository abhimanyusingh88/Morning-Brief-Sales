import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { Status } from "@/components/ui/status";
import { CATEGORY_LABEL, CATEGORY_ORDER, etTime, fmtMs } from "@/components/pipeline/model";
import { getMe } from "@/lib/auth/session";
import { getFeedsView, isOpsRole, type FeedView } from "@/lib/data/ops";
import { getDb } from "@/lib/db";

export const metadata = { title: "Data feeds" };
export const dynamic = "force-dynamic";

const TONE = { ok: "ok", warn: "warn", bad: "bad", idle: "idle", run: "run" } as const;

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card><CardBody>
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 text-[24px] font-semibold tracking-[-0.02em] text-ink">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[12px] text-muted">{sub}</p> : null}
    </CardBody></Card>
  );
}

function FeedRow({ f }: { f: FeedView }) {
  const run = f.run;
  return (
    <details className="group border-b border-line last:border-0">
      <summary className="grid cursor-pointer list-none grid-cols-[18px_minmax(0,1.6fr)_minmax(0,1fr)_90px_80px_80px] items-center gap-3 px-5 py-3 hover:bg-sunken/60 max-md:grid-cols-[18px_minmax(0,1fr)_auto]">
        <ChevronRight size={14} strokeWidth={1.5} className="text-muted transition-transform group-open:rotate-90" />
        <div className="min-w-0"><p className="truncate text-[13.5px] font-medium text-ink">{f.def.name}</p><p className="truncate text-[12px] text-muted">{f.def.vendor} · {f.def.transport}</p></div>
        <div className="max-md:hidden"><Status tone={TONE[f.freshness.tone]}>{f.freshness.label}</Status></div>
        <p className="num text-right text-[13px] text-ink-2 max-md:hidden">{run ? run.rows.toLocaleString("en-US") : "—"}</p>
        <p className="num text-right text-[13px] text-ink-2 max-md:hidden">{fmtMs(run?.latencyMs)}</p>
        <p className="num text-right text-[12.5px] text-muted">{run?.asOf ? etTime(run.asOf) : "—"}</p>
      </summary>
      <div className="grid gap-5 bg-sunken/40 px-5 py-4 pl-[50px] text-[13px] md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-ink-2">{f.def.description}</p>
          <dl className="space-y-1.5 text-[12.5px]">
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Endpoint</dt><dd className="num break-all font-mono text-[12px]">{f.def.endpoint}</dd></div>
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Cadence</dt><dd>{f.def.cadence}</dd></div>
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">SLA</dt><dd className="num">by {f.def.slaTime} ET</dd></div>
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Freshness</dt><dd>{f.freshness.detail}</dd></div>
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Stored in</dt><dd className="num font-mono text-[12px]">{f.stored}</dd></div>
            {f.authScope ? <div className="flex gap-3"><dt className="w-24 shrink-0 text-muted">Auth scope</dt><dd>{f.authScope}</dd></div> : null}
          </dl>
          <div>
            <p className="eyebrow mb-1.5">Feeds these sections</p>
            <div className="flex flex-wrap gap-1.5">{f.dependents.map((d) => <Badge key={d.key} tone={d.withheld ? "down" : d.gated ? "amber" : "neutral"}>{d.label}{d.withheld ? " · withheld" : ""}</Badge>)}</div>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <p className="eyebrow mb-1.5">To go live, the firm provides</p>
            <p className="mb-1 text-[12.5px] text-ink-2">{f.adapter.type}</p>
            <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-muted">{f.adapter.needs.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
          {run?.sample ? (<div><p className="eyebrow mb-1.5">Last payload (sample)</p><pre className="num max-h-48 overflow-auto rounded-lg border border-line bg-surface p-3 font-mono text-[11.5px] leading-relaxed">{JSON.stringify(run.sample, null, 2)}</pre></div>) : null}
          {f.history.length ? (
            <div>
              <p className="eyebrow mb-1.5">Recent runs</p>
              <ul className="space-y-1">{f.history.slice(0, 5).map((h) => <li key={h.runId} className="flex items-center justify-between text-[12.5px]"><span className="num text-muted">{h.businessDate.slice(5)}</span><Status tone={h.status === "ok" ? "ok" : h.status === "delayed" ? "warn" : "bad"}>{h.status}</Status><span className="num text-ink-2">{h.rows.toLocaleString("en-US")} rows · {fmtMs(h.latencyMs)}</span></li>)}</ul>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}

export default async function Feeds() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!isOpsRole(me.role)) redirect("/");
  const v = await getFeedsView(await getDb(), me.id);
  const s = v.stats;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operations" title="Data feeds" description="Every connector the morning run reads, its health against the SLA, what it stored, and what the firm would provide to take it live. All feeds here are simulated." />
      {!v.run ? (
        <Card><EmptyState title="No morning run yet" body="Run the morning from the Morning run screen and every connector will report here." /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Healthy" value={<>{s.healthy}<span className="text-muted"> / {s.total}</span></>} />
            <Stat label="Rows ingested" value={s.rows.toLocaleString("en-US")} />
            <Stat label="Slowest" value={s.slowest ? fmtMs(s.slowest.latencyMs) : "—"} sub={s.slowest?.name} />
            <Stat label="Sections withheld" value={s.withheld.count} sub={s.withheld.count ? s.withheld.labels.join(", ") : "Nothing withheld"} />
          </div>
          {CATEGORY_ORDER.map((c) => {
            const list = v.feeds.filter((f) => f.def.category === c);
            if (!list.length) return null;
            return (
              <section key={c} aria-label={CATEGORY_LABEL[c]}>
                <h2 className="eyebrow mb-2">{CATEGORY_LABEL[c]}</h2>
                <Card className="overflow-hidden">{list.map((f) => <FeedRow key={f.def.key} f={f} />)}</Card>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
