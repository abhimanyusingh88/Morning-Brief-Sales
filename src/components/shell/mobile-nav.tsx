"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, Sunrise, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/auth/session";
import { NAV } from "./nav";

export function MobileNav({ role, firm }: { role: Role; firm: string }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label="Open menu" className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken lg:hidden">
          <Menu size={18} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/40 lg:hidden" />
        <Dialog.Content aria-describedby={undefined} className="fixed bottom-0 left-0 top-0 z-50 flex w-[272px] max-w-[85vw] flex-col bg-navy text-white lg:hidden">
          <div className="flex h-14 items-center justify-between border-b border-navy-line px-4">
            <Dialog.Title className="flex items-center gap-2.5 text-[14px] font-semibold">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-cyan"><Sunrise size={18} /></span>
              <span className="leading-tight">Morning Brief<span className="block text-[11px] font-normal text-white/50">{firm}</span></span>
            </Dialog.Title>
            <Dialog.Close asChild><button type="button" aria-label="Close menu" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10"><X size={16} /></button></Dialog.Close>
          </div>
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Primary">
            {NAV.map((g) => {
              const items = g.items.filter((i) => i.roles.includes(role));
              if (!items.length) return null;
              return (
                <div key={g.group}>
                  <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/35">{g.group}</p>
                  <ul className="space-y-0.5">
                    {items.map((i) => {
                      const active = path === i.href || path.startsWith(i.href + "/");
                      return (
                        <li key={i.href}>
                          <Link href={i.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] font-medium", active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5")}>
                            <i.icon size={16} className={active ? "text-cyan" : "text-white/45"} />
                            {i.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
          <div className="border-t border-navy-line p-3 text-[11.5px] text-white/60"><span className="font-semibold text-white/80">Demo workspace</span> · synthetic data</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
