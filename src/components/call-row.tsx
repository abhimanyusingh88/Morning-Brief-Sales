import Link from 'next/link';
import { Badge, UrgencyBadge } from '@/components/ui/badge';
import { RichText, type FactView } from '@/components/ui/fact';
import type { CardRow } from '@/lib/data/brief';
import { cn } from '@/lib/cn';

export function firstSentence(t: string) {
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : t;
}

export function CallRow({
  c,
  facts,
  href,
  active,
}: {
  c: CardRow;
  facts: Record<string, FactView>;
  href: string;
  active?: boolean;
}) {
  const snippet = firstSentence(c.whyTemplate);
  const showSnippet = snippet && snippet.toLowerCase() !== c.headline.toLowerCase();

  return (
    <Link
      href={href}
      className={cn(
        'group relative flex items-start gap-3 border-l-2 px-4 py-3 transition-colors',
        active ? 'border-l-brand bg-slate-50/90 shadow-sm' : 'border-l-transparent hover:bg-slate-50/50',
      )}
    >
      <span className="num mt-0.5 text-xs font-mono font-medium text-slate-400 w-4 text-center shrink-0">{c.rank}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'truncate text-[13.5px] font-semibold text-slate-900',
              c.status === 'done' && 'text-slate-400 line-through',
            )}
          >
            {c.clientName}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <UrgencyBadge urgency={c.urgency} />
            {c.status === 'done' ? (
              <Badge tone="up">Done</Badge>
            ) : c.status === 'snoozed' ? (
              <Badge tone="neutral">Snoozed</Badge>
            ) : null}
          </div>
        </div>
        <p className="line-clamp-1 text-[13px] font-medium leading-snug text-slate-700">{c.headline}</p>
        {showSnippet ? (
          <p className="line-clamp-1 text-[12px] leading-snug text-slate-500">
            <RichText template={snippet} facts={facts} />
          </p>
        ) : null}
      </div>
    </Link>
  );
}
