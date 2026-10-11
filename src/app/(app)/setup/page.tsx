import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getCoverage, getFocus, getPreferences } from '@/lib/live/reports';
import { SetupForm } from './setup-form';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brief setup' };
export default async function Page() {
  const me = await getMe();
  if (!me) redirect('/login');
  const db = await getDb();
  const [book, prefs, focus] = await Promise.all([
    getCoverage(db, me.id),
    getPreferences(db, me.id),
    getFocus(db, me.id),
  ]);
  return (
    <div className="mx-auto max-w-[760px] space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Brief setup"
        description="Choose the clients, topics and stocks your brief shows. The full brief is still prepared and saved for your whole book; these choices decide what you see."
      />
      <SetupForm prefs={prefs} focus={focus} clients={book.clients} holdings={book.holdings} />
    </div>
  );
}
