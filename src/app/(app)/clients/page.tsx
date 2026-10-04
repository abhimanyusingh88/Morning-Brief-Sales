import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, UrgencyBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getMe } from "@/lib/auth/session";
import { listClients } from "@/lib/data/clients";
import { SEGMENT_LABEL } from "@/lib/format";
import { formatUsd } from "@/lib/market/format";
import { cn } from "@/lib/cn";

export const metadata = { title: "Clients" };

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string; s?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "sales" && me.role !== "desk_head") redirect("/");
  const sp = await searchParams;
  const rows = await listClients(me.id, { q: sp.q, segment: sp.s });
  const segs = Object.keys(SEGMENT_LABEL);
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Clients</h1>
        <p className="mt-0.5 text-[13.5px] text-muted">{rows.length} clients in your coverage.</p>
      </header>
      <Card className="overflow-hidden">
        <form className="flex flex-wrap items-center gap-2 border-b border-line p-3" role="search">
          <input name="q" defaultValue={sp.q} placeholder="Search by name" aria-label="Search clients" className="h-9 w-64 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] outline-none focus:border-brand focus:ring-2 focus:ring-brand-100" />
          <div className="flex flex-wrap gap-1">
            <Link href="/clients" className={cn("rounded-md px-2.5 py-1.5 text-[12.5px] font-medium", !sp.s ? "bg-navy text-white" : "text-muted hover:bg-sunken")}>All</Link>
            {segs.map((s) => <Link key={s} href={`/clients?s=${s}`} className={cn("rounded-md px-2.5 py-1.5 text-[12.5px] font-medium", sp.s === s ? "bg-navy text-white" : "text-muted hover:bg-sunken")}>{SEGMENT_LABEL[s]}</Link>)}
          </div>
        </form>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-bg text-left text-[12px] text-muted">
                <tr><th className="px-5 py-2 font-medium">Client</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Tier</th><th className="px-3 py-2 text-right font-medium">AUM</th><th className="px-3 py-2 text-right font-medium">Last contact</th><th className="px-5 py-2 font-medium">Today</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-sunken/60">
                    <td className="px-5 py-2.5"><Link href={`/clients/${r.id}`} className="font-semibold text-ink hover:text-brand-600">{r.name}</Link></td>
                    <td className="px-3 py-2.5 text-ink-2">{SEGMENT_LABEL[r.segment]}</td>
                    <td className="px-3 py-2.5"><Badge tone={r.tier === 1 ? "navy" : "outline"}>Tier {r.tier}</Badge></td>
                    <td className="num px-3 py-2.5 text-right text-ink-2">{formatUsd(r.aumUsdMn * 1e6)}</td>
                    <td className={cn("num px-3 py-2.5 text-right", (r.lastContactDays ?? 999) > 45 ? "font-medium text-amber" : "text-ink-2")}>{r.lastContactDays == null ? "—" : `${r.lastContactDays} d ago`}</td>
                    <td className="px-5 py-2.5">{r.cardId && r.cardUrgency ? <Link href={`/calls?card=${r.cardId}`}><UrgencyBadge urgency={r.cardUrgency as "now" | "today" | "this_week"} /></Link> : <span className="text-subtle">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No clients match" body="Try a different name or clear the filter." />}
      </Card>
    </div>
  );
}
