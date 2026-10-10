'use client';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

/** A card whose body starts collapsed. The body is rendered by the server and handed in as children. */
export function DisclosureCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="sys-health"
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[12px] px-5 py-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-ink">{title}</span>
          {sub ? <span className="mt-0.5 block text-xs text-muted">{sub}</span> : null}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      <div id="sys-health" hidden={!open} className="border-t border-line">
        {children}
      </div>
    </Card>
  );
}
