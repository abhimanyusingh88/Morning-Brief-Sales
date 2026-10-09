'use client';
import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Option = { value: string; label: string; hint?: string };

/** Design-system dropdown: consistent 36px control, keyboard navigable list, optional search for long lists. */
export function Select({ value, onChange, options, label, icon, searchable, disabled, className, align = 'start' }: { value: string; onChange: (v: string) => void; options: Option[]; label: string; icon?: React.ReactNode; searchable?: boolean; disabled?: boolean; className?: string; align?: 'start' | 'end' }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const current = options.find((o) => o.value === value) ?? options[0];
  const list = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const choose = (v: string) => { onChange(v); setOpen(false); setQ(''); };
  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setActive(Math.max(0, list.findIndex((x) => x.value === value))); else setQ(''); }}>
      <Popover.Trigger asChild disabled={disabled}>
        <button type="button" aria-label={label} className={cn('inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-[13px] text-ink shadow-[0_1px_0_rgba(14,22,39,0.03)] transition-colors hover:border-brand focus-visible:border-brand data-[state=open]:border-brand data-[state=open]:ring-2 data-[state=open]:ring-brand-100 disabled:opacity-60', className)}>
          {icon ? <span className="shrink-0 text-muted">{icon}</span> : null}
          <span className="min-w-0 flex-1 truncate font-medium">{current?.label}</span>
          <ChevronDown size={14} className="shrink-0 text-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align={align} sideOffset={6} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[220px] overflow-hidden rounded-lg border border-line bg-surface shadow-pop focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' && list[active]) { e.preventDefault(); choose(list[active].value); }
          }}>
          {searchable ? (
            <div className="flex items-center gap-2 border-b border-line px-3"><Search size={13} className="text-muted" /><input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder={'Search ' + label.toLowerCase() + '…'} className="h-9 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted" /></div>
          ) : null}
          <ul role="listbox" aria-label={label} className="max-h-72 overflow-y-auto p-1">
            {list.length ? list.map((o, i) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(o.value)} className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px]', i === active ? 'bg-sunken' : '', o.value === value ? 'font-semibold text-brand' : 'text-ink')}>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint ? <span className="num shrink-0 text-[11px] font-normal text-muted">{o.hint}</span> : null}
                  <Check size={13} className={cn('shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')} />
                </button>
              </li>
            )) : <li className="px-3 py-4 text-center text-[12px] text-muted">No matches</li>}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
