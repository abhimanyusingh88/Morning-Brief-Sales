import { ArrowLeft, Info } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { etStamp } from "@/components/brief/lib";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { Status, type Tone } from "@/components/ui/status";
import { getMe } from "@/lib/auth/session";
import { getEmailDigest } from "@/lib/data/brief";

export const metadata = { title: "Email digest" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, { tone: Tone; label: string }> = {
  simulated: { tone: "idle", label: "Simulated, not sent" },
  delivered: { tone: "ok", label: "Delivered" },
  scheduled: { tone: "warn", label: "Scheduled" },
  failed: { tone: "bad", label: "Failed" },
};

export default async function EmailDigestPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "sales") redirect("/");
  const d = await getEmailDigest(me.id);
  const back = <Button asChild variant="secondary" size="sm"><Link href="/brief"><ArrowLeft size={14} strokeWidth={1.5} /> Back to the brief</Link></Button>;

  return (
    <div className="space-y-6">
      <PageHeader title="Email digest" description="The email version of your morning brief, exactly as it is stored for your send time." actions={back} />

      <div role="note" className="flex items-start gap-2.5 rounded-[12px] border border-line bg-surface px-4 py-3 text-[13px] text-ink-2">
        <Info size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" />
        <p><b className="font-semibold text-ink">Preview only.</b> Nothing is sent to a client; the relay is simulated.</p>
      </div>

      {!d || !d.html ? (
        <Card>
          <EmptyState
            title="You have no email digest"
            body="Your brief is set to dashboard only, so no email version is prepared. Choose Email digest or Both in your setup to get one from the next business day."
            action={<Button asChild variant="primary"><Link href="/setup">Open brief setup</Link></Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="order-2 overflow-hidden lg:order-1">
            <CardHeader title="Message" sub="Rendered in an isolated frame: no scripts, links or forms run." />
            <iframe title="Email digest preview" srcDoc={d.html} sandbox="" className="block h-[960px] w-full border-0 bg-white" />
          </Card>
          <Card className="order-1 self-start lg:order-2">
            <CardHeader title="Delivery" />
            <CardBody>
              <dl className="space-y-3 text-[13px]">
                <Row label="Subject"><span className="font-medium text-ink">{d.subject ?? "—"}</span></Row>
                <Row label="To"><span className="text-ink">{d.to ?? "—"}</span></Row>
                <Row label="Status">{(() => { const s = STATUS[d.status] ?? { tone: "idle" as Tone, label: d.status }; return <Status tone={s.tone}>{s.label}</Status>; })()}</Row>
                <Row label={d.deliveredAt ? "Delivered" : "Scheduled for"}><span className="num text-ink">{d.deliveredAt ?? d.scheduledFor ? etStamp((d.deliveredAt ?? d.scheduledFor)!) : "—"}</span></Row>
              </dl>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}
