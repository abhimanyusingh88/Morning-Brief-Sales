import { Building2, Mail, Phone, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CallRow } from "@/components/call-row";
import { Badge, UrgencyBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { RichText } from "@/components/ui/fact";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader eyebrow="My day" title="Call list" description="Your client priorities, ranked by exposure, timing and relationship. Select a call to see the context." />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card className="sticky top-6 flex flex-col overflow-hidden border border-slate-200 shadow-xs max-h-[calc(100vh-7rem)]">
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/50 p-1.5 no-scrollbar" role="tablist" aria-label="Filter calls">
            {FILTERS.map((x) => (
              <Link
                key={x.key}
                href={`/calls?f=${x.key}`}
                role="tab"
                aria-selected={f === x.key}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  f === x.key ? "bg-slate-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
                )}
              >
                {x.label} <span className={cn("num ml-1 text-[11px]", f === x.key ? "text-slate-300" : "text-slate-400")}>{count(x.key)}</span>
              </Link>
            ))}
          </div>
          {list.length ? (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white no-scrollbar">
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
    <Card className="rise overflow-hidden border border-slate-200 shadow-sm rounded-xl">
      <div className="border-b border-slate-100 p-5 sm:p-6 space-y-4 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <UrgencyBadge urgency={c.urgency} />
            <Badge tone="outline" className="text-xs font-medium text-slate-600">{SEGMENT_LABEL[c.segment]}</Badge>
            <Badge tone="outline" className="text-xs font-medium text-slate-600">Tier {c.tier}</Badge>
          </div>
          <span className="num text-xs font-medium text-slate-400">
            Rank <b className="font-semibold text-slate-800">{c.rank}</b> • Score <b className="font-semibold text-slate-800">{Math.round(c.score)}</b>
          </span>
        </div>

        <div>
          <Link href={`/clients/${c.clientId}`} className="group inline-flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 hover:text-brand">
            <Building2 size={20} className="text-slate-400 transition group-hover:text-brand" />
            {c.clientName}
          </Link>
          <p className="mt-1 text-sm sm:text-base font-semibold leading-snug text-slate-800">{c.headline}</p>
        </div>

        {c.contact ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200/70 bg-slate-50/70 px-3.5 py-2 text-xs sm:text-[13px] text-slate-700">
            <span className="font-semibold text-slate-900">{c.contact.name}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-600">{c.contact.title}</span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1 font-mono text-slate-600"><Phone size={12} className="text-slate-400" /> {c.contact.phone}</span>
            <span className="text-slate-300">•</span>
            <span className="inline-flex items-center gap-1 text-slate-600"><Mail size={12} className="text-slate-400" /> {c.contact.email}</span>
          </div>
        ) : null}

        <CardActions id={c.id} status={c.status} clientName={c.clientName} />
      </div>

      <CardBody className="p-5 sm:p-6 space-y-6 bg-white">
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Why now</h4>
          <p className="text-sm sm:text-[14.5px] leading-relaxed text-slate-800 font-normal">
            <RichText template={c.whyTemplate} facts={facts} />
          </p>
        </section>

        <section className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">What to say</h4>
          <ul className="space-y-2">
            {c.talkingPoints.map((t, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-800">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                <span><RichText template={t.template} facts={facts} /></span>
              </li>
            ))}
          </ul>
        </section>

        {c.watchOuts.length ? (
          <section className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-3.5">
            <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700"><ShieldAlert size={13} /> Watch-outs</h4>
            <ul className="mt-1.5 space-y-1.5 text-xs sm:text-[13.5px] text-slate-800">
              {c.watchOuts.map((t, i) => <li key={i}><RichText template={t.template} facts={facts} /></li>)}
            </ul>
          </section>
        ) : null}

        <section className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Why it ranks here</h4>
          <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
            {factors.map((x) => (
              <div key={x.k}>
                <div className="flex justify-between text-xs"><span className="text-slate-600 font-medium">{FACTOR_LABEL[x.k]}</span><span className="num text-slate-400">weight {Math.round(x.w * 100)}%</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.round(x.v * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          {also.length ? <p className="text-xs text-slate-500">Also relevant: {also.map((a) => a.label).join(", ")}.</p> : null}
        </section>

        <section className="space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sources</h4>
          <div className="scroll-thin overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[420px] text-xs">
              <thead className="bg-slate-50 text-left text-slate-500 font-semibold border-b border-slate-200">
                <tr><th className="px-3 py-2">Figure</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2">Source</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {used.map((f) => <tr key={f.key}><td className="px-3 py-2 text-slate-700">{f.label}</td><td className="num px-3 py-2 text-right font-semibold text-slate-900">{f.display}</td><td className="px-3 py-2 text-slate-500">{f.source}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">Written by {c.generator === "llm" ? "the model, then checked" : c.generator === "hybrid" ? "the model and the template writer, checked" : "the template writer"}. Every figure above was inserted by code from its source.</p>
        </section>
      </CardBody>
    </Card>
  );
}
