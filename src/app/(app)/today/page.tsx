import { CalendarClock, PhoneCall, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CallRow } from "@/components/call-row";
import { MarketStrip } from "@/components/market-strip";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RichText } from "@/components/ui/fact";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { getMe } from "@/lib/auth/session";
import { bootState } from "@/lib/bootstrap";
import { getBundle, getMarketTiles, getPulse } from "@/lib/data/brief";
import { fmtDate } from "@/lib/format";
import { AskInline } from "./ask-inline";

export const metadata = { title: "Today" };

export default async function Today() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "sales") redirect("/");
  const [bundle, tiles, pulse] = await Promise.all([getBundle(me.id), getMarketTiles(me.id), getPulse(me.id)]);
  const first = me.fullName.split(" ")[0];

  if (!bundle) {
    const preparing = bootState().running;
    return (
      <Card>
        <EmptyState
          title={preparing ? "Preparing your morning brief…" : "No brief yet"}
          body={preparing ? "The overnight pipeline is running. This page will have your ranked calls in a moment." : "The morning pipeline has not produced a brief for you yet."}
          action={<Button asChild variant="primary"><Link href="/pipeline">{preparing ? "Watch it run" : "Open the pipeline"}</Link></Button>}
        />
      </Card>
    );
  }

  const { cards, sections, facts, brief } = bundle;
  const pending = cards.filter((c) => c.status === "new" || c.status === "snoozed");
  const now = cards.filter((c) => c.urgency === "now" && c.status !== "done");
  const done = cards.filter((c) => c.status === "done").length;
  const overnight = sections.find((s) => s.kind === "overnight");
  const calendar = sections.find((s) => s.kind === "calendar");
  const risks = sections.find((s) => s.kind === "risks");

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={fmtDate(brief.businessDate)} title={`Good morning, ${first}`} description={brief.headline} actions={<>
          <Button asChild variant="secondary"><Link href="/brief">Read full brief</Link></Button>
          <Button asChild variant="primary"><Link href="/calls"><PhoneCall size={15} /> Start calling</Link></Button>
      </>} />

      <MarketStrip tiles={tiles} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Who to call"
            sub={`${pending.length} to go · ${now.length} flagged to call now${done ? ` · ${done} done` : ""}`}
            right={<Button asChild size="sm" variant="ghost"><Link href="/calls">See all {cards.length}</Link></Button>}
          />
          <div className="divide-y divide-line">
            {cards.slice(0, 8).map((c) => <CallRow key={c.id} c={c} facts={facts} href={`/calls?card=${c.id}`} />)}
          </div>
        </Card>

        <div className="space-y-6">
          {overnight ? (
            <Card>
              <CardHeader title="Overnight" sub="From the pre-market tape" />
              <CardBody className="text-[13.5px] leading-relaxed text-ink-2"><RichText template={overnight.template} facts={facts} /></CardBody>
            </Card>
          ) : null}
          {calendar ? (
            <Card>
              <CardHeader title="On the calendar" right={<CalendarClock size={15} className="text-subtle" />} />
              <CardBody className="text-[13.5px] leading-relaxed text-ink-2"><RichText template={calendar.template} facts={facts} /></CardBody>
            </Card>
          ) : null}
          {risks ? (
            <Card>
              <CardHeader title="Watch list" />
              <CardBody className="text-[13.5px] leading-relaxed text-ink-2"><RichText template={risks.template} facts={facts} /></CardBody>
            </Card>
          ) : null}
          <Card className="bg-navy text-white">
            <CardBody>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold"><Sparkles size={14} className="text-cyan" /> Ask Morning Brief</p>
              <p className="mt-1 text-[12.5px] text-white/60">{pulse.followups} open follow-ups. Ask about a client, a sector, or have a note drafted.</p>
              <AskInline />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
