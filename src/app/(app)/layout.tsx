import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { AskProvider } from "@/components/shell/chat-drawer";
import { fmtTimeET } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  const db = await getDb();
  const [meta] = await db.asUser(me.id, (q) => q(`select (select max(as_of) from market_quotes) a, (select max(source) from market_quotes) s, (select firm_name from firm_settings limit 1) firm`));
  const asOf = meta?.a ? fmtTimeET(new Date(meta.a as string).toISOString()) : "—";
  return (
    <AskProvider>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="app-shell flex h-dvh overflow-hidden">
        <Sidebar role={me.role} firm={String(meta?.firm ?? "Northgate Capital Markets")} />
        <div className="app-column flex min-h-0 min-w-0 flex-1 flex-col">
          <Topbar me={me} hue={me.hue} asOf={asOf} sources={`Market data: ${String(meta?.s ?? "simulated")}`} firm={String(meta?.firm ?? "Northgate Capital Markets")} />
          <main id="main-content" tabIndex={-1} className="app-main scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain focus:outline-none">
            <div className="workspace-content mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
          </main>
        </div>
      </div>
    </AskProvider>
  );
}
