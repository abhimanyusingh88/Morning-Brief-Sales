import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge, UrgencyBadge } from "@/components/ui/badge";
import { RichText, type FactView } from "@/components/ui/fact";
import type { CardRow } from "@/lib/data/brief";
import { cn } from "@/lib/cn";

export function firstSentence(t: string) {
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : t;
}

export function CallRow({ c, facts, href, active }: { c: CardRow; facts: Record<string, FactView>; href: string; active?: boolean }) {
  return (
    <Link href={href} className={cn("group flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-sunken/70", active && "bg-brand-50 hover:bg-brand-50")}>
      <span className={cn("num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold", c.urgency === "now" ? "bg-amber-50 text-amber" : "bg-sunken text-muted")}>{c.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("truncate text-[14px] font-semibold text-ink", c.status === "done" && "text-subtle line-through")}>{c.clientName}</span>
          <UrgencyBadge urgency={c.urgency} />
          {c.status === "done" ? <Badge tone="up">Done</Badge> : c.status === "snoozed" ? <Badge tone="neutral">Snoozed</Badge> : null}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[13px] font-medium leading-snug text-ink-2">{c.headline}</span>
        <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-muted"><RichText template={firstSentence(c.whyTemplate)} facts={facts} /></span>
      </span>
      <ChevronRight size={16} className="mt-1 shrink-0 text-line-strong transition group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
}
