import { Search } from "lucide-react";
import { UserMenu } from "./user-menu";
import { SearchTrigger } from "./command-palette";
import { AskButton } from "./chat-drawer";
import type { Me } from "@/lib/auth/session";

export function Topbar({ me, hue, asOf, sources }: { me: Me; hue: number; asOf: string; sources: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-5 backdrop-blur">
      <SearchTrigger><Search size={15} /> <span className="text-subtle">Search clients, calls, pages</span> <kbd className="ml-auto rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10.5px] text-muted">⌘K</kbd></SearchTrigger>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 text-[12px] text-muted md:flex" title={sources}>
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-up" />
          <span>Data as of <span className="num font-medium text-ink-2">{asOf}</span></span>
        </div>
        {me.role === "sales" || me.role === "desk_head" ? <AskButton /> : null}
        <UserMenu name={me.fullName} title={me.title} initials={me.initials} hue={hue} />
      </div>
    </header>
  );
}
