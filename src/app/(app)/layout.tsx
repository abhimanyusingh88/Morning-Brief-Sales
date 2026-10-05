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
      <div className="flex min-h-dvh items-start">
        <Sidebar role={me.role} firm={String(meta?.firm ?? "Northgate Capital Markets")} />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <Topbar me={me} hue={me.hue} asOf={asOf} sources={`Market data: ${String(meta?.s ?? "simulated")}`} firm={String(meta?.firm ?? "Northgate Capital Markets")} />
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-6 sm:px-8">{children}</main>
        </div>
      </div>
    </AskProvider>
  );
}
