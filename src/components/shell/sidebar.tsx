import type { Role } from "@/lib/auth/session";
import { BrandMark } from "./brand";
import { NavList } from "./nav-list";

/** Pinned to the viewport: only the main column scrolls. The nav scrolls inside the rail if a role has many items. */
export function Sidebar({ role, firm }: { role: Role; firm: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[224px] shrink-0 flex-col self-start bg-navy lg:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-navy-line px-4"><BrandMark firm={firm} /></div>
      <div className="scroll-thin flex-1 overflow-y-auto px-3 py-4"><NavList role={role} /></div>
      <div className="shrink-0 border-t border-navy-line p-3">
        <div className="rounded-md border border-white/10 px-3 py-2.5 text-[11.5px] leading-snug text-white/55">
          <p className="font-semibold text-white/80">Demo workspace</p>
          Synthetic firm, clients, feeds and prices. No client data.
        </div>
      </div>
    </aside>
  );
}
