import { Search } from "lucide-react";
import { UserMenu } from "./user-menu";
import { SearchTrigger } from "./command-palette";
import type { Me } from "@/lib/auth/session";
import { MobileNav } from "./mobile-nav";

export function Topbar({ me, hue, asOf, sources, firm }: { me: Me; hue: number; asOf: string; sources: string; firm: string }) {
  return (
    <header className="app-topbar z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
      <MobileNav role={me.role} firm={firm} />
      <SearchTrigger><Search size={16} className="shrink-0" /> <span className="min-w-0 truncate text-muted">Search your workspace</span> <kbd className="ml-auto hidden shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted sm:block">Ctrl K</kbd></SearchTrigger>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden shrink-0 items-center gap-2 text-[12px] text-muted xl:flex" title={sources}>
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" />
          <span>Data as of <span className="num font-medium text-ink-2">{asOf}</span></span>
        </div>
        <UserMenu name={me.fullName} title={me.title} initials={me.initials} hue={hue} />
      </div>
    </header>
  );
}
