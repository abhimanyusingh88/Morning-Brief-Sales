'use client';
import * as Popover from '@radix-ui/react-popover';
import { ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { FEED_BY_KEY } from '@/lib/feeds/registry';

export interface FactView {
  key: string;
  label: string;
  display: string;
  source: string;
  asOf: string;
  unit?: string;
  /** the data feed this figure came from (brief_facts.feed_key) */
  feedKey?: string;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  });

/** A figure with its provenance one hover away. Every number in generated text renders through this. */
export function Fact({ f }: { f: FactView }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <span
          className="fact"
          tabIndex={0}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          {f.display}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 w-64 rounded-lg border border-line bg-surface p-3 text-left shadow-[var(--shadow-pop)]"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{f.label}</p>
          <p className="num mt-0.5 text-base font-semibold text-ink">{f.display}</p>
          <dl className="mt-2 space-y-1 text-xs">
            {f.feedKey && FEED_BY_KEY.get(f.feedKey) ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Feed</dt>
                <dd className="text-right font-medium text-ink-2">{FEED_BY_KEY.get(f.feedKey)!.name}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Source</dt>
              <dd className="text-right font-medium text-ink-2">{f.source}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">As of</dt>
              <dd className="num text-right font-medium text-ink-2">{when(f.asOf)}</dd>
            </div>
          </dl>
          <p className="mt-2 flex items-center gap-1 border-t border-line pt-2 text-[11px] text-muted">
            <ShieldCheck size={12} className="text-up" /> Figure inserted by code, not written by the model
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const TOKEN = /\{\{([A-Za-z0-9_.:\-]+)\}\}/g;

/** Renders a stored template: text as text, {{tokens}} as hoverable facts. */
export function RichText({ template, facts }: { template: string; facts: Record<string, FactView> }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of template.matchAll(TOKEN)) {
    if (m.index! > last) parts.push(template.slice(last, m.index));
    const f = facts[m[1]];
    parts.push(
      !f ? (
        <span key={`f${m.index}`}>—</span>
      ) : f.unit === 'text' ? (
        <span key={`f${m.index}`}>{f.display}</span>
      ) : (
        <Fact key={`f${m.index}`} f={f} />
      ),
    );
    last = m.index! + m[0].length;
  }
  if (last < template.length) parts.push(template.slice(last));
  return <>{parts.map((p, i) => (typeof p === 'string' ? <React.Fragment key={`t${i}`}>{p}</React.Fragment> : p))}</>;
}
