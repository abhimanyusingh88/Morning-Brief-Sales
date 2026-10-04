"use client";
import { Sunrise } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/auth/session";
import { NAV } from "./nav";

export function Sidebar({ role, firm }: { role: Role; firm: string }) {
  const path = usePathname();
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col bg-navy text-white lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-navy-line px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-cyan"><Sunrise size={18} /></span>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-[-0.01em]">Morning Brief</p>
          <p className="text-[11px] text-white/50">{firm}</p>
        </div>
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
                      <Link
                        href={i.href}
                        aria-current={active ? "page" : undefined}
                        className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors", active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white")}
                      >
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
      <div className="border-t border-navy-line p-3">
        <div className="rounded-lg bg-white/5 px-3 py-2.5 text-[11.5px] leading-snug text-white/60">
          <p className="font-semibold text-white/80">Demo workspace</p>
          Synthetic firm, clients and prices. No client data.
        </div>
      </div>
    </aside>
  );
}
