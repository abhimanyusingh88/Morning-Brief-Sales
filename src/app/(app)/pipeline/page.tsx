import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DisclosureCard } from '@/components/pipeline/disclosure-card';
import type { HistoryRow } from '@/components/pipeline/history';
import { MorningRun } from '@/components/pipeline/morning-run';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/states';
import { getMe } from '@/lib/auth/session';
import { demoBusinessDate } from '@/lib/config';
import { getDb } from '@/lib/db';
import { SCENARIOS, defaultScenarios } from '@/lib/market/scenarios';
import { STAGES, STEPS } from '@/lib/pipeline/run';
import { Health } from './health';

export const metadata = { title: 'Morning run' };
export const dynamic = 'force-dynamic';

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role === 'sales') redirect('/');
  const sp = await searchParams;
  const db = await getDb();
  const rows = await db.asUser(me.id, (q) =>
    q(
      `select r.id, r.business_date::text bd, r.trigger, r.status, r.started_at, r.finished_at, r.summary,
            (select count(*) filter (where f.status = 'ok') from feed_runs f where f.run_id = r.id)::int feeds_ok,
            (select count(*) from feed_runs f where f.run_id = r.id)::int feeds_total
       from pipeline_runs r order by r.started_at desc limit 15`,
    ),
  );
  const runs: HistoryRow[] = rows.map((r) => {
    const sum = obj(r.summary);
    const ms = r.finished_at
      ? new Date(r.finished_at as string).getTime() - new Date(r.started_at as string).getTime()
      : null;
    return {
      id: String(r.id),
      startedAt: new Date(r.started_at as string).toISOString(),
      businessDate: String(r.bd),
      trigger: String(r.trigger),
      status: r.status as HistoryRow['status'],
      durationMs: num(sum.durationMs) ?? ms,
      published: num(obj(sum.published).briefs),
      held: num(obj(sum.qc).held),
      feedsOk: num(r.feeds_ok),
      feedsTotal: num(r.feeds_total),
    };
  });
  const date = demoBusinessDate();
  const initialRunId = runs.find((r) => r.id === sp.run)?.id ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Morning run"
        description="Monitor your morning workflow, from data ingestion and matching to quality review and delivery."
      />
      <MorningRun
        stages={STAGES.map((s) => ({ ...s }))}
        steps={STEPS}
        scenarios={SCENARIOS.map((s) => ({ key: s.key, label: s.label }))}
        defaults={{ date, scenarios: defaultScenarios(date) }}
        canRun={me.role === 'admin' || me.role === 'desk_head'}
        role={me.role}
        runs={runs}
        initialRunId={initialRunId}
        health={
          <DisclosureCard title="System health" sub="Database, language model and market-data wiring">
            <Suspense
              fallback={
                <div className="p-5">
                  <Skeleton className="h-10 w-full" />
                </div>
              }
            >
              <Health />
            </Suspense>
          </DisclosureCard>
        }
      />
    </div>
  );
}
