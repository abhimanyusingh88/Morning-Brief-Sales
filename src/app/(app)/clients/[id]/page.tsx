import { ArrowDownRight, ArrowUpRight, Calendar, CircleDot, Mail, MessageSquare, Phone, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, UrgencyBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getMe } from "@/lib/auth/session";
import { getClient360 } from "@/lib/data/clients";
import { fmtDate, fmtMove, SEGMENT_LABEL, timeAgo } from "@/lib/format";
import { formatUsd } from "@/lib/market/format";
import { cn } from "@/lib/cn";

const ICON = { call: Phone, email: Mail, meeting: Users, chat: MessageSquare } as const;

export async function generateMetadata() { return { title: "Client" }; }

export default async function Client360({ params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getClient360(me.id, id);
  if (!d) notFound(); // not visible to this person: row-level security returns nothing
  const total = d.positions.reduce((a, p) => a + p.usd, 0) || 1;
  const c = d.client;
  return (
    <div className="space-y-6">
      <Link href="/clients" className="text-[13px] text-muted hover:text-ink">← Clients</Link>
      <Card>
        <CardBody className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{c.name}</h1>
              <Badge tone={c.tier === 1 ? "navy" : "outline"}>Tier {c.tier}</Badge>
              <Badge tone="outline">{SEGMENT_LABEL[c.segment]}</Badge>
              {c.status === "prospect" ? <Badge tone="amber">Prospect</Badge> : null}
            </div>
            <p className="mt-1.5 text-[13.5px] text-muted">{c.region} · {c.country} · client since {fmtDate(c.since, { month: "short", year: "numeric" })}</p>
            <p className="mt-2 max-w-2xl text-[14px] text-ink-2">{c.mandate}. Risk appetite: {c.risk}.</p>
            {d.interests.length ? <div className="mt-3 flex flex-wrap gap-1.5">{d.interests.map((t) => <Badge key={t} tone="brand">{t.replace(/_/g, " ")}</Badge>)}</div> : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-[13px]">
            <dt className="text-muted">AUM</dt><dd className="num text-right font-semibold">{formatUsd(c.aumUsdMn * 1e6)}</dd>
            <dt className="text-muted">Tracked book</dt><dd className="num text-right font-semibold">{formatUsd(total)}</dd>
            <dt className="text-muted">Positions</dt><dd className="num text-right font-semibold">{d.positions.length}</dd>
            {me.role === "sales" || me.role === "desk_head" ? <dd className="col-span-2 pt-1"><Button asChild variant="secondary" size="sm" className="w-full"><Link href={`/agent?client=${c.id}&q=${encodeURIComponent(`Brief me on ${c.name}`)}`}>Ask about this client</Link></Button></dd> : null}
          </dl>
        </CardBody>
        {d.card ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line bg-brand-50/60 px-5 py-3">
            <UrgencyBadge urgency={d.card.urgency} />
            <span className="text-[13.5px] font-medium text-ink">On today&apos;s call list: {d.card.headline}</span>
            <Button asChild size="sm" variant="primary" className="ml-auto"><Link href={`/calls?card=${d.card.id}`}>Open the call card</Link></Button>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="Positions" sub="Notional and today's move. Moves in percent; yields and spreads in basis points." />
            {d.positions.length ? (
              <div className="max-h-[420px] overflow-auto scroll-thin">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-bg text-left text-[12px] text-muted"><tr><th className="px-5 py-2 font-medium">Instrument</th><th className="px-3 py-2 font-medium">Sector</th><th className="px-3 py-2 text-right font-medium">Notional</th><th className="px-3 py-2 text-right font-medium">Share</th><th className="px-5 py-2 text-right font-medium">Today</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {d.positions.map((p) => (
                      <tr key={p.symbol}>
                        <td className="px-5 py-2"><span className="font-semibold">{p.name}</span> <span className="mono text-[11.5px] text-subtle">{p.symbol}</span></td>
                        <td className="px-3 py-2 text-ink-2">{p.sector ?? "—"}</td>
                        <td className="num px-3 py-2 text-right">{formatUsd(p.usd)}</td>
                        <td className="num px-3 py-2 text-right text-muted">{((p.usd / total) * 100).toFixed(1)}%</td>
                        <td className={cn("num px-5 py-2 text-right font-semibold", p.chg == null ? "text-subtle" : p.chg > 0 ? "text-up" : p.chg < 0 ? "text-down" : "text-muted")}>
                          {p.chg == null ? "—" : <span className="inline-flex items-center gap-0.5">{p.chg > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{fmtMove(p.unit, p.chg)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="No tracked positions" />}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Recent tickets" />
            {d.trades.length ? (
              <table className="w-full text-[13px]">
                <tbody className="divide-y divide-line">
                  {d.trades.map((t, i) => (
                    <tr key={i}>
                      <td className="px-5 py-2"><Badge tone={t.side === "buy" ? "up" : "down"}>{t.side === "buy" ? "Bought" : "Sold"}</Badge></td>
                      <td className="px-3 py-2 font-medium">{t.name}</td>
                      <td className="num px-3 py-2 text-right">{formatUsd(t.usd)}</td>
                      <td className="num px-5 py-2 text-right text-muted">{timeAgo(t.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState title="No tickets in the last weeks" />}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Contacts" />
            <ul className="divide-y divide-line">
              {d.contacts.map((p) => (
                <li key={p.id} className="px-5 py-3">
                  <p className="text-[13.5px] font-semibold">{p.name} {p.primary ? <Badge tone="brand" className="ml-1">Primary</Badge> : null}</p>
                  <p className="text-[12.5px] text-muted">{p.title}</p>
                  <p className="mt-1 flex flex-wrap gap-x-4 text-[12.5px] text-ink-2"><span className="num">{p.phone}</span><span>{p.email}</span></p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Follow-ups" />
            {d.followups.length ? (
              <ul className="divide-y divide-line">
                {d.followups.map((f) => (
                  <li key={f.id} className="flex items-start gap-2.5 px-5 py-3 text-[13px]">
                    <Calendar size={14} className={cn("mt-0.5 shrink-0", f.status === "open" ? "text-amber" : "text-subtle")} />
                    <span><span className={cn(f.status === "done" && "text-subtle line-through")}>{f.text}</span> <span className="num text-muted">· due {fmtDate(f.dueOn, { month: "short", day: "numeric" })}</span></span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Nothing open" />}
          </Card>

          <Card>
            <CardHeader title="Activity" />
            {d.interactions.length ? (
              <ol className="relative space-y-4 px-5 py-4 before:absolute before:bottom-6 before:left-[29px] before:top-6 before:w-px before:bg-line">
                {d.interactions.map((x, i) => {
                  const I = ICON[x.kind as keyof typeof ICON] ?? CircleDot;
                  return (
                    <li key={i} className="relative flex gap-3">
                      <span className="z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface ring-4 ring-surface"><I size={13} className="text-brand" /></span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold">{x.subject}</p>
                        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{x.note}</p>
                        <p className="mt-1 text-[11.5px] text-muted">{x.kind} · {timeAgo(x.at)}{x.author ? ` · ${x.author}` : ""}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : <EmptyState title="No activity yet" />}
          </Card>

          <Card>
            <CardHeader title="Coverage" />
            <ul className="px-5 py-3 text-[13px]">{d.coverage.map((v) => <li key={v.name} className="flex justify-between py-1"><span>{v.name}</span><span className="text-muted">{v.role}</span></li>)}</ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
