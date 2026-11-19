import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getEtfView } from '@/lib/live/etf';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';
import { EtfView } from '@/components/live/etf-view';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Leveraged ETF commentary' };
export default async function Page() {
  const me = await getMe();
  if (!me) redirect('/login');
  const view = await getEtfView(await getDb());
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Flows and positioning"
        title="Leveraged ETF commentary"
        description="Creations and redemptions in the major leveraged and inverse ETFs, converted to the target exposure they add or remove, with the volatility backdrop. Every figure comes from the issuers' own daily files."
      />
      {view ? (
        <EtfView book={view.book} note={view.note} latest={view.latest} week={view.week} />
      ) : (
        <Card>
          <EmptyState
            title="Issuer files are not available yet"
            body="The fund issuers' daily files could not be read. The refresh cycle retries automatically; check back in a few minutes."
          />
        </Card>
      )}
    </div>
  );
}
