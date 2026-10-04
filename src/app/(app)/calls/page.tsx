import { Building2, Mail, Phone, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CallRow } from "@/components/call-row";
import { Badge, UrgencyBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { RichText } from "@/components/ui/fact";
import { EmptyState } from "@/components/ui/states";
import { getMe } from "@/lib/auth/session";
import { getBundle, type CardRow } from "@/lib/data/brief";
import { SEGMENT_LABEL } from "@/lib/format";
import { WEIGHTS } from "@/lib/pipeline/score";
import { cn } from "@/lib/cn";
import { CardActions } from "./card-actions";

export const metadata = { title: "Call list" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "now", label: "Call now" },
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "done", label: "Done" },
];

const FACTOR_LABEL: Record<string, string> = {
  exposure: "Exposure to the story", magnitude: "Size of the move or event", relevance: "Fit with their interests",
  timing: "Time-criticality", relationship: "Relationship tier", contactGap: "Time since last contact",
};

export default async function Calls({ searchParams }: { searchParams: Promise<{ card?: string; f?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "sales") redirect("/");
  const sp = await searchParams;
  const bundle = await getBundle(me.id);
  if (!bundle) return <Card><EmptyState title="No brief yet" body="Your call list appears once the morning pipeline has run." /></Card>;

  const f = FILTERS.some((x) => x.key === sp.f) ? sp.f! : "all";
  const all = bundle.cards;
  const list = all.filter((c) => (f === "all" ? c.status !== "done" && c.status !== "dismissed" : f === "done" ? c.status === "done" : c.urgency === f && c.status !== "done" && c.status !== "dismissed"));
  const selected: CardRow | undefined = all.find((c) => c.id === sp.card) ?? list[0];
  const count = (k: string) => (k === "all" ? all.filter((c) => c.status !== "done" && c.status !== "dismissed").length : k === "done" ? all.filter((c) => c.status === "done").length : all.filter((c) => c.urgency === k && c.status !== "done" && c.status !== "dismissed").length);

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Call list</h1>
          <p className="mt-0.5 text-[13.5px] text-muted">Ranked for you by exposure, size of the move, timing and relationship. Open a call to see why.</p>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="flex gap-1 overflow-x-auto border-b border-line p-2" role="tablist" aria-label="Filter calls">
            {FILTERS.map((x) => (
              <Link key={x.key} href={`/calls?f=${x.key}`} role="tab" aria-selected={f === x.key}
                className={cn("whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12.5px] font-medium", f === x.key ? "bg-navy text-white" : "text-muted hover:bg-sunken")}>
                {x.label} <span className={cn("num ml-0.5", f === x.key ? "text-white/60" : "text-subtle")}>{count(x.key)}</span>
              </Link>
            ))}
          </div>
          {list.length ? (
            <div className="divide-y divide-line">
              {list.map((c) => <CallRow key={c.id} c={c} facts={bundle.facts} href={`/calls?card=${c.id}&f=${f}`} active={selected?.id === c.id} />)}
            </div>
          ) : <EmptyState title="Nothing here" body={f === "done" ? "Calls you mark as called show up here." : "No calls match this filter."} />}
        </Card>

        {selected ? <Detail c={selected} facts={bundle.facts} /> : <Card><EmptyState title="Select a call" /></Card>}
      </div>
    </div>
  );
}

function Detail({ c, facts }: { c: CardRow; facts: Record<string, import("@/components/ui/fact").FactView> }) {
  const factors = Object.entries(WEIGHTS).map(([k, w]) => ({ k, w, v: Number((c.factors as Record<string, number>)[k] ?? 0) }));
  const also = (c.factors.alsoRelevant as { label: string }[] | undefined) ?? [];
  const used = c.factKeys.map((k) => facts[k]).filter((x) => x && x.unit !== "text");
  return (
    <Card className="rise overflow-hidden">
      <div className="border-b border-line p-5">
        <div className="flex flex-wrap items-center gap-2">
          <UrgencyBadge urgency={c.urgency} />
          <Badge tone="outline">{SEGMENT_LABEL[c.segment]}</Badge>
          <Badge tone="outline">Tier {c.tier}</Badge>
          <span className="num ml-auto text-[12px] text-muted">Rank {c.rank} · score <span className="font-semibold text-ink">{Math.round(c.score)}</span></span>
        </div>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <Link href={`/clients/${c.clientId}`} className="group inline-flex items-center gap-2 text-[22px] font-semibold tracking-[-0.015em] hover:text-brand-600"><Building2 size={18} className="text-subtle group-hover:text-brand" /> {c.clientName}</Link>
            <p className="mt-1 text-[14.5px] font-medium text-ink-2">{c.headline}</p>
          </div>
        </div>
        {c.contact ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg bg-bg px-3.5 py-2.5 text-[13px]">
            <span><span className="font-semibold">{c.contact.name}</span> <span className="text-muted">· {c.contact.title}</span></span>
            <span className="inline-flex items-center gap-1.5 text-muted"><Phone size={13} /> <span className="num">{c.contact.phone}</span></span>
            <span className="inline-flex items-center gap-1.5 text-muted"><Mail size={13} /> {c.contact.email}</span>
          </div>
        ) : null}
        <div className="mt-4"><CardActions id={c.id} status={c.status} clientName={c.clientName} /></div>
      </div>

      <CardBody className="space-y-6">
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Why now</h4>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink"><RichText template={c.whyTemplate} facts={facts} /></p>
        </section>

        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">What to say</h4>
          <ul className="mt-2 space-y-2.5">
            {c.talkingPoints.map((t, i) => (
              <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink">
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <span><RichText template={t.template} facts={facts} /></span>
              </li>
            ))}
          </ul>
        </section>

        {c.watchOuts.length ? (
          <section className="rounded-lg border border-amber/30 bg-amber-50 p-3.5">
            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber"><ShieldAlert size={13} /> Watch-outs</h4>
            <ul className="mt-1.5 space-y-1.5 text-[13.5px] text-ink-2">
              {c.watchOuts.map((t, i) => <li key={i}><RichText template={t.template} facts={facts} /></li>)}
            </ul>
          </section>
        ) : null}

        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Why it ranks here</h4>
          <div className="mt-2.5 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {factors.map((x) => (
              <div key={x.k}>
                <div className="flex justify-between text-[12px]"><span className="text-ink-2">{FACTOR_LABEL[x.k]}</span><span className="num text-muted">weight {Math.round(x.w * 100)}%</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-sunken"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.round(x.v * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          {also.length ? <p className="mt-3 text-[12.5px] text-muted">Also relevant: {also.map((a) => a.label).join(", ")}.</p> : null}
        </section>

        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">Sources</h4>
          <div className="mt-2 overflow-hidden rounded-lg border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg text-left text-muted"><tr><th className="px-3 py-1.5 font-medium">Figure</th><th className="px-3 py-1.5 text-right font-medium">Value</th><th className="px-3 py-1.5 font-medium">Source</th></tr></thead>
              <tbody className="divide-y divide-line">
                {used.map((f) => <tr key={f.key}><td className="px-3 py-1.5 text-ink-2">{f.label}</td><td className="num px-3 py-1.5 text-right font-semibold">{f.display}</td><td className="px-3 py-1.5 text-muted">{f.source}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">Written by {c.generator === "llm" ? "the model, then checked" : c.generator === "hybrid" ? "the model and the template writer, checked" : "the template writer"}. Every figure above was inserted by code from its source.</p>
        </section>
      </CardBody>
    </Card>
  );
}
