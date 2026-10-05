import Link from "next/link";
import { redirect } from "next/navigation";
import { AuditTable } from "@/components/brief/audit-table";
import { BriefChrome } from "@/components/brief/brief-chrome";
import { etTime, joinAnd, midSentence, sectionKeys, stampDate } from "@/components/brief/lib";
import { CALL_LIST_KINDS, OneLine, SectionView, SPEC_KINDS } from "@/components/brief/sections";
import { Tpl } from "@/components/brief/tpl";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getMe } from "@/lib/auth/session";
import { getBundle } from "@/lib/data/brief";
import { getDb } from "@/lib/db";
import { getPrefsView } from "@/lib/brief/prefs";

export const metadata = { title: "Morning brief" };
export const dynamic = "force-dynamic";

export default async function BriefPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "sales") redirect("/");
  const audit = (await searchParams).audit === "1";
  const b = await getBundle(me.id);
  if (!b) {
    return (
      <div className="mx-auto w-full max-w-[860px]">
        <Card>
          <EmptyState
            title="No brief published yet"
            body="Your morning brief appears here once the overnight run has been checked and published. Until then there is nothing to show."
            action={<Button asChild variant="secondary"><Link href="/pipeline">See the morning run</Link></Button>}
          />
        </Card>
      </div>
    );
  }

  const prefs = (await getPrefsView(await getDb(), me.id)).current;
  const { sections, facts, brief } = b;
  const byKind = new Map(sections.map((s) => [s.kind, s]));
  const spec = sections.filter((s) => SPEC_KINDS.includes(s.kind)).sort((x, y) => x.position - y.position);
  const callList = sections.filter((s) => CALL_LIST_KINDS.includes(s.kind) && s.status === "ok").sort((x, y) => x.position - y.position);
  const catalysts = byKind.get("catalysts");

  // What the brief was built for: the sectors and products stored with its sections, else the setup in force.
  const str = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);
  const sectors = [byKind.get("movers"), byKind.get("earnings"), byKind.get("overnight")].map((s) => str(s?.data.sectors)).find((x) => x.length) ?? prefs.sectors;
  const products = str(byKind.get("overnight")?.data.products).length ? str(byKind.get("overnight")?.data.products) : prefs.products;

  const shown = spec.filter((s) => s.status === "ok");
  const keys = [...new Set([...shown, ...callList].flatMap((s) => sectionKeys(s, facts)))];
  const stamp = `${stampDate(brief.businessDate)} · ${etTime(brief.publishedAt ?? brief.generatedAt)}`;

  return (
    <BriefChrome initialAudit={audit} audit={<AuditTable keys={keys} facts={facts} version={brief.version} generatedAt={brief.generatedAt} />}>
      <article className="paper-surface rounded-[12px] border border-paper-line bg-paper px-5 py-7 sm:px-10 sm:py-9 print:border-0 print:p-0">
        <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-ink-rule pb-2.5">
          <h1 className="serif text-[34px] italic leading-none tracking-[-0.01em] text-ink">Morning brief</h1>
          <p className="mono text-[12px] text-muted">{stamp}</p>
        </header>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          Built for your coverage — <b className="font-semibold text-ink">{joinAnd(sectors)}</b>
          {products.length ? <>, {joinAnd(products.map(midSentence))}</> : null}.
        </p>

        <div className="mt-5"><OneLine s={catalysts} facts={facts} /></div>

        <div className="mt-8">
          {spec.map((s) => <SectionView key={s.id} s={s} facts={facts} />)}
        </div>

        <p className="mt-10 border-t border-paper-line pt-4 text-[11.5px] leading-relaxed text-muted">
          Generated {etTime(brief.generatedAt)} from simulated market, news and calendar feeds, filtered to your saved sectors and products.
        </p>
      </article>

      {callList.length ? (
        <Card className="print:hidden">
          <CardHeader title="Your book today" sub="The call-list context behind today's ranking." right={<Button asChild variant="ghost" size="sm"><Link href="/today">Open Today</Link></Button>} />
          <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {callList.map((s) => (
              <div key={s.id} className="p-5">
                <h3 className="text-[13px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2"><Tpl t={s.template} facts={facts} /></p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </BriefChrome>
  );
}
