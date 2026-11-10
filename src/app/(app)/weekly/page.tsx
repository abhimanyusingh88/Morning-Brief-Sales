import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getWeekly } from '@/lib/live/weekly';
import { PageHeader } from '@/components/ui/page-header';
import { WeeklyView } from '@/components/live/weekly-view';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const metadata = { title: 'Weekly moves' };
export default async function Page() {
  const me = await getMe();
  if (!me) redirect('/login');
  const { book, clients } = await getWeekly(await getDb(), me.id);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your assigned book"
        title="Weekly moves"
        description={
          <>
            How each client&apos;s positions moved over the last five sessions, from real market closes. Follows the
            clients chosen in{' '}
            <Link href="/setup" className="font-medium text-brand underline underline-offset-4">
              Brief setup
            </Link>
            .
          </>
        }
      />
      <WeeklyView book={book} assigned={clients} />
    </div>
  );
}
