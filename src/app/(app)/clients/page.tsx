import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { focusCoverage, getCoverage, getFocus } from '@/lib/live/reports';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { HoldingsTable } from '@/components/live/report-content';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Client coverage' };
export default async function Page() {
  const me = await getMe();
  if (!me) redirect('/login');
  const db = await getDb(),
    all = await getCoverage(db, me.id),
    book = focusCoverage(all, await getFocus(db, me.id));
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Your assigned book</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Client coverage</h1>
        <p className="mt-2 text-sm text-muted">
          {book.clients.length} clients · {book.holdings.length} holdings
          {book.clients.length < all.clients.length ? (
            <>
              {' '}
              · showing the clients chosen in{' '}
              <Link href="/setup" className="font-medium text-brand underline underline-offset-4">
                Brief setup
              </Link>{' '}
              ({all.clients.length} assigned)
            </>
          ) : null}
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {book.clients.map((c) => (
          <Card key={c.id}>
            <CardBody>
              <h2 className="text-lg font-semibold">{c.name}</h2>
              <p className="mt-2 text-xs text-muted">
                {c.accounts} fund accounts · {c.holdings} holdings
              </p>
              <p className="mt-4 font-medium text-brand">{c.symbols.join(' · ')}</p>
              <Link
                className="mt-5 inline-block text-sm font-medium text-brand underline underline-offset-4"
                href={'/brief?client=' + c.id}
              >
                Open client brief →
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Holdings" sub="Values as recorded in the client database" />
        <HoldingsTable holdings={book.holdings} />
      </Card>
    </div>
  );
}
