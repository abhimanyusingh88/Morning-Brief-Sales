import { Printer } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { RichText } from "@/components/ui/fact";
import { EmptyState } from "@/components/ui/states";
import { getMe } from "@/lib/auth/session";
import { getBundle } from "@/lib/data/brief";
import { fmtDate, fmtTimeET } from "@/lib/format";
import { PrintButton } from "./print-button";

export const metadata = { title: "Morning brief" };

const ORDER = ["overnight", "macro", "calendar", "book", "flow", "risks"];

export default async function BriefPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "sales") redirect("/");
  const b = await getBundle(me.id);
  if (!b) return <Card><EmptyState title="No brief yet" body="Your morning brief appears once the pipeline has run." /></Card>;
  const secs = [...b.sections].sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind));
  const used = new Set(secs.flatMap((s) => s.factKeys));
  const sources = [...used].map((k) => b.facts[k]).filter((f) => f && f.unit !== "text");
  return (
    <article className="mx-auto max-w-[860px] space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-medium text-muted">{fmtDate(b.brief.businessDate)} · prepared for {me.fullName}</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em]">Morning brief</h1>
          <p className="mt-1.5 text-[15px] text-ink-2">{b.brief.headline}</p>
        </div>
        <PrintButton><Printer size={14} /> Print</PrintButton>
      </header>

      {secs.map((s) => (
        <Card key={s.id} className="rise">
          <CardBody>
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-ink">{s.title}</h2>
              <Badge tone="outline">{s.generator === "llm" ? "AI-written, checked" : "Rule-based"}</Badge>
            </div>
            <p className="mt-2.5 text-[15px] leading-[1.7] text-ink-2"><RichText template={s.template} facts={b.facts} /></p>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardBody>
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em]">Sources and timestamps</h2>
          <p className="mt-1 text-[12.5px] text-muted">Every figure in this brief was inserted by code from the source below. The writer only places it.</p>
          <div className="mt-3 overflow-hidden rounded-lg border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg text-left text-muted"><tr><th className="px-3 py-1.5 font-medium">Figure</th><th className="px-3 py-1.5 text-right font-medium">Value</th><th className="px-3 py-1.5 font-medium">Source</th><th className="px-3 py-1.5 font-medium">As of</th></tr></thead>
              <tbody className="divide-y divide-line">
                {sources.map((f) => <tr key={f.key}><td className="px-3 py-1.5 text-ink-2">{f.label}</td><td className="num px-3 py-1.5 text-right font-semibold">{f.display}</td><td className="px-3 py-1.5 text-muted">{f.source}</td><td className="num px-3 py-1.5 text-muted">{fmtTimeET(f.asOf)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11.5px] text-muted">Version {b.brief.version} · generated {fmtTimeET(b.brief.generatedAt)}</p>
        </CardBody>
      </Card>
    </article>
  );
}
