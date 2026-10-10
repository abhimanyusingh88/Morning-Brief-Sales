import { redirect } from 'next/navigation';
import { AgentWorkspace } from '@/components/agent/workspace';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getThread, isUuid, listThreads } from '@/lib/agent/threads';

export const metadata = { title: 'Agent' };
export const dynamic = 'force-dynamic';

export default async function AgentPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; client?: string; q?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect('/login');
  if (me.role !== 'sales' && me.role !== 'desk_head') redirect('/');
  const sp = await searchParams;
  const db = await getDb();
  const threads = await listThreads(db, me.id);
  const active = sp.t && isUuid(sp.t) ? await getThread(db, me.id, sp.t) : null;
  const clientId = sp.client && isUuid(sp.client) ? sp.client : undefined;
  return (
    <AgentWorkspace
      firstName={me.fullName.split(' ')[0]}
      initialThreads={threads}
      initialActive={active}
      clientId={clientId}
      prefill={sp.q?.slice(0, 500)}
    />
  );
}
