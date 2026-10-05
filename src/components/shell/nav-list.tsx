"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/auth/session";
import { NAV } from "./nav";

/** The primary navigation, shared by the fixed sidebar and the mobile drawer so they can never drift apart. */
export function NavList({ role, onNavigate, roomy }: { role: Role; onNavigate?: () => void; roomy?: boolean }) {
  const path = usePathname();
  return (
    <nav className="space-y-5" aria-label="Primary">
      {NAV.map((g) => {
        const items = g.items.filter((i) => i.roles.includes(role));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-white/35">{g.group}</p>
            <ul className="space-y-px">
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + "/");
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                        roomy ? "py-2.5" : "py-[7px]",
                        active ? "bg-white/[0.08] text-white before:absolute before:-left-3 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white/90",
                      )}
                    >
                      <i.icon size={16} strokeWidth={1.5} className={active ? "text-white" : "text-white/45"} />
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
  );
}
