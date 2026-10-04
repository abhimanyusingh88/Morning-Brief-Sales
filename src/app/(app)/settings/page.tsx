import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getMe } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { PrefsForm } from "./prefs-form";

export const metadata = { title: "Preferences" };
export const dynamic = "force-dynamic";

export default async function Settings() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "sales" && me.role !== "desk_head") redirect("/");
  const db = await getDb();
  const r = (await db.asUser(me.id, (q) => q(`select max_cards, tone, include_macro, to_char(brief_time, 'HH24:MI') brief_time, focus_tags from preferences where profile_id = $1`, [me.id])))[0];
  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <header>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Preferences</h1>
        <p className="mt-0.5 text-[13.5px] text-muted">Shape tomorrow morning&apos;s brief. Changes apply from the next run.</p>
      </header>
      <Card>
        <CardHeader title="Your brief" />
        <CardBody>
          <PrefsForm initial={{ maxCards: Number(r?.max_cards ?? 8), tone: (r?.tone as "concise" | "detailed") ?? "concise", includeMacro: Boolean(r?.include_macro ?? true), briefTime: String(r?.brief_time ?? "06:30"), focusTags: (r?.focus_tags as string[]) ?? [] }} />
        </CardBody>
      </Card>
    </div>
  );
}
