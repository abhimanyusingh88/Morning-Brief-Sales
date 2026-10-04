import { CheckCircle2, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getMe } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fmtTimeET, timeAgo } from "@/lib/format";

export const metadata = { title: "Compliance" };
export const dynamic = "force-dynamic";

const CONTROLS = [
  ["Figures come from code, not the model", "Writers emit tokens; the validator rejects any digit, number word or unit outside a token."],
  ["Row-level security on every client read", "Each person sees only their own coverage. Generation reads client data under the salesperson's own permissions."],
  ["Information barrier", "Instruments on the restricted list produce no signals and are never named in generated text."],
  ["Provenance on every value", "Each figure carries its source and as-of time, one hover away."],
  ["The agent drafts; the human sends", "No code path sends anything to a client."],
] as const;

export default async function Compliance() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "compliance" && me.role !== "admin") redirect("/");
  const db = await getDb();
  const d = await db.asUser(me.id, async (q) => ({
    restricted: await q(`select e.title, e.occurred_at, e.business_date::text bd, i.symbol, i.name from events e left join instruments i on i.id = e.instrument_id where e.entitlement = 'restricted_ib' order by e.occurred_at desc`),
    gens: await q(`select generator, count(*)::int n from call_cards group by 1 order by n desc`),
    recs: await q(`select target, model, status, attempts, prompt_tokens, completion_tokens, latency_ms, created_at from generation_records order by created_at desc limit 12`),
    audit: await q(`select a.at, a.action, a.object_type, p.full_name actor, a.detail from audit_log a left join profiles p on p.id = a.actor_id order by a.at desc limit 20`),
    run: (await q(`select summary from pipeline_runs where status = 'succeeded' order by started_at desc limit 1`))[0],
    barrier: (await q(`select s.log from pipeline_steps s join pipeline_runs r on r.id = s.run_id where s.key = 'entitlement_filter' and r.status = 'succeeded' order by r.started_at desc limit 1`))[0],
  }));
  const val = ((d.run?.summary as Record<string, unknown>)?.validation ?? {}) as Record<string, number>;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Compliance console</h1>
        <p className="mt-0.5 text-[13.5px] text-muted">What the system did, what it refused to do, and the record of both.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Controls in force" right={<ShieldCheck size={16} className="text-up" />} />
          <ul className="divide-y divide-line">
            {CONTROLS.map(([t, b]) => <li key={t} className="flex gap-3 px-5 py-3"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-up" /><span><span className="block text-[13.5px] font-semibold">{t}</span><span className="text-[12.5px] text-muted">{b}</span></span></li>)}
          </ul>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Information barrier" sub="Restricted-list names are withheld from every salesperson's output" />
            {d.restricted.length ? (
              <table className="w-full text-[13px]"><tbody className="divide-y divide-line">
                {d.restricted.map((r, i) => <tr key={i}><td className="px-5 py-2.5"><span className="font-semibold">{String(r.name ?? r.title)}</span> <span className="mono text-[11.5px] text-subtle">{String(r.symbol ?? "")}</span></td><td className="px-3 py-2.5 text-muted">{String(r.title)}</td><td className="num px-5 py-2.5 text-right text-muted">{String(r.bd)}</td></tr>)}
              </tbody></table>
            ) : <EmptyState title="Restricted list is empty" />}
            {(d.barrier?.log as string[] | undefined)?.length ? <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">Last run: {(d.barrier!.log as string[]).filter((l) => /restricted/i.test(l)).join(" ")}</p> : null}
          </Card>
          <Card>
            <CardHeader title="Validation" sub="Every generated string is checked before it is stored" />
            <div className="grid grid-cols-2 gap-4 px-5 py-4">
              <div><p className="num text-[24px] font-semibold">{(val.checked ?? 0).toLocaleString()}</p><p className="text-[12px] text-muted">strings checked in the last run</p></div>
              <div><p className="num text-[24px] font-semibold">{val.replaced ?? 0}</p><p className="text-[12px] text-muted">replaced by the safe version</p></div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">{d.gens.map((g) => <Badge key={String(g.generator)} tone="outline">{String(g.generator)}: {Number(g.n)}</Badge>)}</div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Model calls" sub="Lineage for generated text" />
          {d.recs.length ? (
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg text-left text-muted"><tr><th className="px-5 py-2 font-medium">Target</th><th className="px-3 py-2 font-medium">Model</th><th className="px-3 py-2 font-medium">Result</th><th className="px-5 py-2 text-right font-medium">Tokens</th></tr></thead>
              <tbody className="divide-y divide-line">
                {d.recs.map((r, i) => <tr key={i}><td className="max-w-[160px] truncate px-5 py-2">{String(r.target).split(":")[0]}</td><td className="px-3 py-2 text-ink-2">{String(r.model)}</td><td className="px-3 py-2"><Badge tone={r.status === "accepted" ? "up" : r.status === "repaired" ? "brand" : "amber"}>{String(r.status)}</Badge></td><td className="num px-5 py-2 text-right">{(Number(r.prompt_tokens ?? 0) + Number(r.completion_tokens ?? 0)).toLocaleString()}</td></tr>)}
              </tbody>
            </table>
          ) : <EmptyState title="No model calls recorded" body="The template writer produced the latest briefs, so there is nothing to trace." />}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Audit log" sub="Who did what, newest first" />
          {d.audit.length ? (
            <ul className="divide-y divide-line">
              {d.audit.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                  <span><span className="font-medium">{String(a.actor ?? "System")}</span> <span className="mono text-[12px] text-muted">{String(a.action)}</span></span>
                  <span className="num shrink-0 text-[12px] text-muted" title={fmtTimeET(new Date(a.at as string).toISOString())}>{timeAgo(new Date(a.at as string).toISOString())}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nothing logged yet" body="Actions such as marking a call or asking the assistant are recorded here." />}
        </Card>
      </div>
    </div>
  );
}
