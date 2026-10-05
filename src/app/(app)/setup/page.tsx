import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getMe } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getPrefsView } from "@/lib/brief/prefs";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Brief setup" };
export const dynamic = "force-dynamic";

export default async function Setup() {
  const me = await getMe();
  if (!me) redirect("/login");
  const view = await getPrefsView(await getDb(), me.id);
  return (
    <div className="mx-auto max-w-[760px] space-y-6">
      <PageHeader eyebrow="Account" title="Brief setup" description="Choose your sectors, products and sections. Saved changes apply from the next business day's brief; today's brief is never regenerated." />
      <SetupForm initial={view.current} pending={view.pending} businessDate={view.businessDate} isDefault={view.isDefault} />
    </div>
  );
}
