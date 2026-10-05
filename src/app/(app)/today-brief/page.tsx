import { BookOpenText, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { etTime, joinAnd, longDate, midSentence } from "@/components/brief/lib";
import { DashSection, Hero, SnapshotCard } from "@/components/today-brief/dashboard";
import { LEFT_KINDS, RIGHT_KINDS } from "@/components/today-brief/lib";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { getMe } from "@/lib/auth/session";
import { bootState } from "@/lib/bootstrap";
import { getPrefsView } from "@/lib/brief/prefs";
import { getBundle } from "@/lib/data/brief";
import { getDb } from "@/lib/db";

export const metadata = { title: "Today's brief" };
export const dynamic = "force-dynamic";

/** The morning brief as a dashboard: the open in one line, the market picture, then reading (left) and data (right). */
export default async function TodayBriefPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "sales") redirect("/");
  const b = await getBundle(me.id);

  if (!b) {
    const preparing = bootState().running;
    return (
      <Card>
        <EmptyState
          title={preparing ? "Preparing today's brief…" : "No brief published yet"}
          body={preparing ? "The overnight pipeline is running. Your brief appears here in a moment." : "Today's brief appears here once the overnight run has been checked and published."}
          action={<Button asChild variant="secondary"><Link href="/pipeline">See the morning run</Link></Button>}
        />
      </Card>
    );
  }

  const prefs = (await getPrefsView(await getDb(), me.id)).current;
  const { sections, facts, brief } = b;
  const byKind = new Map(sections.map((s) => [s.kind, s]));
  const pick = (kinds: readonly string[]) => kinds.flatMap((k) => byKind.get(k) ?? []);
  const snapshot = byKind.get("snapshot");
  const catalysts = byKind.get("catalysts");
  const oneLine = catalysts?.status === "ok" ? (catalysts.data.oneLine as string | undefined) : undefined;

  // What the brief was built for: the sectors and products stored with its sections, else the setup in force.
  const str = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : []);
  const sectors = [byKind.get("movers"), byKind.get("earnings"), byKind.get("overnight")].map((s) => str(s?.data.sectors)).find((x) => x.length) ?? prefs.sectors;
  const products = str(byKind.get("overnight")?.data.products).length ? str(byKind.get("overnight")?.data.products) : prefs.products;
  const coverage = <>Built for your coverage — <b className="font-semibold text-white/90">{joinAnd(sectors)}</b>{products.length ? <>, {joinAnd(products.map(midSentence))}</> : null}.</>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Dashboard view <span className="normal-case font-semibold text-ink ml-1">• {me.fullName}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm" className="h-8 text-xs">
            <Link href="/brief" className="inline-flex items-center gap-1.5">
              <BookOpenText size={14} strokeWidth={1.75} />
              <span>Read as document</span>
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="h-8 text-xs">
            <Link href="/setup" className="inline-flex items-center gap-1.5">
              <SlidersHorizontal size={14} strokeWidth={1.75} />
              <span>Edit preferences</span>
            </Link>
          </Button>
        </div>
      </div>

      <Hero first={me.fullName.split(" ")[0]} dateLabel={longDate(brief.businessDate)} stamp={`Published ${etTime(brief.publishedAt ?? brief.generatedAt)}`} coverage={coverage} oneLine={oneLine} facts={facts} />

      {snapshot ? <SnapshotCard s={snapshot} facts={facts} /> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">{pick(LEFT_KINDS).map((s) => <DashSection key={s.id} s={s} facts={facts} />)}</div>
        <div className="min-w-0 space-y-5">{pick(RIGHT_KINDS).map((s) => <DashSection key={s.id} s={s} facts={facts} />)}</div>
      </div>

      <p className="px-1 text-xs leading-relaxed text-subtle">
        Generated {etTime(brief.generatedAt)} from market, news and calendar feeds, filtered to your saved sectors and products. Hover any figure to see its source. Update your preferences to change what shows up tomorrow.
      </p>
    </div>
  );
}
