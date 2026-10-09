import type { Role } from "@/lib/auth/session";
import { BrandMark } from "./brand";
import { NavList } from "./nav-list";

/** The rail stays fixed within the viewport; content owns the page scroll. */
export function Sidebar({ role, firm }: { role: Role; firm: string }) {
  return (
    <aside className="desktop-sidebar hidden h-full w-[208px] shrink-0 flex-col overflow-hidden bg-navy lg:flex">
      <div className="flex h-24 shrink-0 items-center justify-center border-b border-navy-line px-5"><BrandMark firm={firm} /></div>
      <div className="min-h-0 flex-1 px-3 py-5"><NavList role={role} /></div>
      <div className="shrink-0 border-t border-navy-line px-5 py-4 text-[12px] leading-relaxed text-white/55">
        <p className="font-medium text-white/85">Your morning, connected.</p>
        <p className="mt-0.5">Insights for your coverage.</p>
      </div>
    </aside>
  );
}
