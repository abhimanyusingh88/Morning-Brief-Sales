'use client';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HoldingsTable } from './report-content';
import type { Client, Holding } from '@/lib/live/types';
/** Client coverage in a modal: pick a client to scope the brief, or review every position. */
export function ClientsDialog({
  clients,
  holdings,
  selected,
  onSelect,
  children,
}: {
  clients: Client[];
  holdings: Holding[];
  selected: string | null;
  onSelect: (id: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false),
    [focus, setFocus] = useState<string | null>(selected);
  const shown = focus ? holdings.filter((h) => h.clientId === focus) : holdings;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setFocus(selected);
      }}
    >
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="clients-desc"
          className="fixed left-1/2 top-1/2 z-50 flex h-[88dvh] w-[min(1280px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop focus:outline-none"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
            <div>
              <Dialog.Title className="text-[17px] font-semibold">Client coverage</Dialog.Title>
              <p id="clients-desc" className="mt-0.5 text-[12px] text-muted">
                {clients.length} clients · {holdings.length} positions · select a client to scope the brief
              </p>
            </div>
            <Dialog.Close asChild>
              <Button size="icon" variant="ghost" aria-label="Close client coverage">
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          <div className="grid min-h-0 flex-1 md:grid-cols-[300px_minmax(0,1fr)]">
            <ul className="max-h-[30dvh] min-h-0 overflow-y-auto border-b border-line p-2 md:max-h-none md:border-b-0 md:border-r">
              <li>
                <button
                  type="button"
                  onClick={() => setFocus(null)}
                  className={
                    'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[13px] ' +
                    (!focus ? 'bg-brand-50 font-semibold text-brand' : 'hover:bg-sunken')
                  }
                >
                  All clients<span className="num text-[11px] text-muted">{holdings.length}</span>
                </button>
              </li>
              {clients.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setFocus(c.id)}
                    className={
                      'w-full rounded-lg px-3 py-2.5 text-left ' + (focus === c.id ? 'bg-brand-50' : 'hover:bg-sunken')
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={
                          'truncate text-[13px] ' +
                          (focus === c.id ? 'font-semibold text-brand' : 'font-medium text-ink')
                        }
                      >
                        {c.name}
                      </span>
                      <span className="num shrink-0 text-[11px] text-muted">{c.holdings}</span>
                    </span>
                    <span className="mono mt-1 block truncate text-[10px] text-muted">{c.symbols.join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex min-h-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                <div>
                  <p className="text-[14px] font-semibold">
                    {focus ? clients.find((c) => c.id === focus)?.name : 'All clients'}
                  </p>
                  <p className="num text-[11px] text-muted">
                    {new Set(shown.map((h) => h.accountId)).size} accounts · {shown.length} positions ·{' '}
                    {shown.filter((h) => h.direction === 'Long').length} long /{' '}
                    {shown.filter((h) => h.direction === 'Short').length} short
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    onSelect(focus ?? '');
                    setOpen(false);
                  }}
                >
                  {focus ? 'View brief for this client' : 'View brief for all clients'}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <HoldingsTable holdings={shown} />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
