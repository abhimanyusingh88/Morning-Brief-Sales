"use client";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { Building2, CornerDownLeft, PhoneCall } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

interface Hit { kind: "client" | "page" | "call"; id: string; label: string; sub?: string; href: string }

const Ctx = React.createContext<{ open: () => void }>({ open: () => {} });

export function SearchTrigger({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  return (
    <Ctx.Provider value={{ open: () => setOpen(true) }}>
      <button onClick={() => setOpen(true)} className="flex h-9 min-w-0 flex-1 max-w-[420px] cursor-pointer items-center gap-2 rounded-lg border border-line bg-bg px-3 text-[13px] text-muted hover:border-line-strong" aria-label="Search">
        {children}
      </button>
      <Palette open={open} setOpen={setOpen} />
    </Ctx.Provider>
  );
}

function Palette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<Hit[]>([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        if (r.ok) setHits((await r.json()).hits);
      } catch {} finally { setBusy(false); }
    }, 120);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);

  const go = (h: Hit) => { setOpen(false); setQ(""); router.push(h.href); };
  const groups: [string, Hit["kind"]][] = [["Pages", "page"], ["Clients", "client"], ["Today's calls", "call"]];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command shouldFilter={false} label="Search">
            <Command.Input value={q} onValueChange={setQ} autoFocus placeholder="Search clients, calls and pages…" className="h-12 w-full border-b border-line bg-transparent px-4 text-[15px] outline-none placeholder:text-subtle" />
            <Command.List className="scroll-thin max-h-[52vh] overflow-y-auto p-2">
              {!hits.length && !busy ? <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">No matches</Command.Empty> : null}
              {groups.map(([title, kind]) => {
                const items = hits.filter((h) => h.kind === kind);
                if (!items.length) return null;
                return (
                  <Command.Group key={kind} heading={title} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle">
                    {items.map((h) => (
                      <Command.Item key={h.kind + h.id} value={h.kind + h.id} onSelect={() => go(h)} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-[13.5px] data-[selected=true]:bg-brand-50">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sunken text-muted">{h.kind === "client" ? <Building2 size={14} /> : h.kind === "call" ? <PhoneCall size={14} /> : <CornerDownLeft size={14} />}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{h.label}</span>{h.sub ? <span className="block truncate text-xs text-muted">{h.sub}</span> : null}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                );
              })}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
