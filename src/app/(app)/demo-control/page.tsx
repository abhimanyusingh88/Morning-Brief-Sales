import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getMe } from "@/lib/auth/session";
import { SCENARIOS, defaultScenarios } from "@/lib/market/scenarios";
import { demoBusinessDate } from "@/lib/config";
import { ControlPanel } from "./control-panel";

export const metadata = { title: "Demo control" };
export const dynamic = "force-dynamic";

export default async function DemoControl() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  const date = demoBusinessDate();
  return (
    <div className="mx-auto max-w-[820px] space-y-6">
      <header>
        <h1 className="text-[24px] font-semibold tracking-[-0.02em]">Demo control</h1>
        <p className="mt-0.5 text-[13.5px] text-muted">Pick today&apos;s market story, run the morning pipeline in front of the room, and reset between walkthroughs.</p>
      </header>
      <Card>
        <CardHeader title="Market story" sub={`Pre-market scenario for ${date}`} />
        <CardBody>
          <ControlPanel scenarios={SCENARIOS.map((s) => ({ key: s.key, label: s.label }))} initial={defaultScenarios(date)} />
        </CardBody>
      </Card>
    </div>
  );
}
