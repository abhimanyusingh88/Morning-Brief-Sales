import { redirect } from 'next/navigation';
import { EmailPreview } from '@/components/ops/email-preview';
import { RunPicker } from '@/components/ops/run-picker';
import { etStamp } from '@/components/brief/lib';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';
import { Status, type Tone } from '@/components/ui/status';
import { getMe } from '@/lib/auth/session';
import { getDeliveriesView, isOpsRole } from '@/lib/data/ops';
import { getDb } from '@/lib/db';

export const metadata = { title: 'Deliveries' };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { tone: Tone; label: string }> = {
  simulated: { tone: 'idle', label: 'Simulated, not sent' },
  delivered: { tone: 'ok', label: 'Delivered' },
  scheduled: { tone: 'warn', label: 'Scheduled' },
  failed: { tone: 'bad', label: 'Failed' },
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="eyebrow">{label}</p>
        <p className="num mt-1 text-[24px] font-semibold tracking-[-0.02em] text-ink">{value}</p>
      </CardBody>
    </Card>
  );
}

export default async function Deliveries({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (!isOpsRole(me.role)) redirect('/');
  const v = await getDeliveriesView(await getDb(), me.id, (await searchParams).run);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Deliveries"
        description="Track dashboard publication and prepared email digests for each salesperson."
        actions={<RunPicker runs={v.runs} current={v.run?.id ?? null} base="/deliveries" />}
      />
      {!v.run || (v.rows.length === 0 && v.held.length === 0) ? (
        <Card>
          <EmptyState title="No deliveries yet" body="Deliveries are scheduled when a morning run publishes briefs." />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Dashboard" value={v.counts.dashboard} />
            <Stat label="Email digests" value={v.counts.email} />
            <Stat label="Failed" value={v.counts.failed} />
            <Stat label="Held by QC" value={v.counts.held} />
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left">
                  {['Salesperson', 'Channel', 'Status', 'Send time', 'To / subject', ''].map((h, i) => (
                    <th key={i} className="eyebrow px-4 py-2.5 font-medium first:pl-5 last:pr-5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => {
                  const st = STATUS[r.status] ?? { tone: 'idle' as Tone, label: r.status };
                  const at = r.deliveredAt ?? r.scheduledFor;
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 pl-5">
                        <p className="font-medium text-ink">{r.name}</p>
                        <p className="text-[12px] text-muted">{r.desk}</p>
                      </td>
                      <td className="px-4 py-2.5 capitalize text-ink-2">{r.channel}</td>
                      <td className="px-4 py-2.5">
                        <Status tone={st.tone}>{st.label}</Status>
                      </td>
                      <td className="num px-4 py-2.5 text-ink-2">{at ? etStamp(at) : '—'}</td>
                      <td className="max-w-[260px] px-4 py-2.5">
                        <p className="truncate text-ink-2">{r.to ?? 'In-app'}</p>
                        {r.subject ? <p className="truncate text-[12px] text-muted">{r.subject}</p> : null}
                      </td>
                      <td className="px-4 py-2.5 pr-5 text-right">
                        {r.html ? <EmailPreview subject={r.subject} to={r.to} html={r.html} /> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          {v.held.length ? (
            <Card>
              <CardHeader
                title="Held by QC"
                sub="These briefs are drafts and have no delivery until released on the QC review screen."
              />
              <ul className="divide-y divide-line">
                {v.held.map((h) => (
                  <li key={h.briefId} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                    <span className="font-medium text-ink">
                      {h.name}
                      <span className="ml-2 text-muted">{h.desk}</span>
                    </span>
                    <span className="num text-muted">planned {etStamp(h.plannedFor)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
