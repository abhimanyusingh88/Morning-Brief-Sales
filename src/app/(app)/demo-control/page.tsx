import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getMe } from "@/lib/auth/session";
import { SCENARIOS, defaultScenarios } from "@/lib/market/scenarios";
import { demoBusinessDate } from "@/lib/config";
import { ControlPanel } from "./control-panel";

export const metadata = { title: "Run settings" };
export const dynamic = "force-dynamic";

export default async function DemoControl() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin") redirect("/");
  const date = demoBusinessDate();
  return (
    <div className="mx-auto max-w-[820px] space-y-6">
      <PageHeader eyebrow="Operations" title="Run settings" description="Choose the market scenarios and playback pace for your next morning run." />
      <Card>
        <CardHeader title="Market story" sub={`Pre-market scenario for ${date}`} />
        <CardBody>
          <ControlPanel scenarios={SCENARIOS.map((s) => ({ key: s.key, label: s.label }))} initial={defaultScenarios(date)} />
        </CardBody>
      </Card>
    </div>
  );
}
