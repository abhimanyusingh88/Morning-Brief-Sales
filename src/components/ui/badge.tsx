import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/cn';

const badge = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-sunken text-ink-2',
        brand: 'bg-brand-50 text-brand-600',
        up: 'bg-up-50 text-up',
        down: 'bg-down-50 text-down',
        amber: 'bg-amber-50 text-amber',
        navy: 'bg-navy text-white',
        outline: 'border border-line-strong text-muted bg-surface',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}

const URGENCY = {
  now: { tone: 'amber' as const, label: 'Call now' },
  today: { tone: 'brand' as const, label: 'Today' },
  this_week: { tone: 'neutral' as const, label: 'This week' },
};
export function UrgencyBadge({ urgency }: { urgency: 'now' | 'today' | 'this_week' }) {
  const u = URGENCY[urgency];
  return (
    <Badge tone={u.tone}>
      {urgency === 'now' ? <span className="live-dot h-1.5 w-1.5 rounded-full bg-amber" /> : null}
      {u.label}
    </Badge>
  );
}
