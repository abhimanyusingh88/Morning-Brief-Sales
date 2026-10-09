import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getCoverage } from '@/lib/live/reports';
import { Card,CardBody,CardHeader } from '@/components/ui/card';
import { HoldingsTable } from '@/components/live/report-content';
export const dynamic='force-dynamic';export const metadata={title:'Client coverage'};
export default async function Page(){const me=await getMe();if(!me)redirect('/login');const book=await getCoverage(await getDb(),me.id);return <div className="space-y-6"><header><p className="eyebrow">Your assigned book</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Client coverage</h1><p className="mt-2 text-sm text-muted">{book.clients.length} clients · {book.holdings.length} holdings · imported from the supplied client workbook</p></header><div className="grid gap-4 md:grid-cols-3">{book.clients.map(c=><Card key={c.id}><CardBody><h2 className="text-lg font-semibold">{c.name}</h2><p className="mt-2 text-xs text-muted">{c.accounts} fund accounts · {c.holdings} holdings</p><p className="mt-4 font-medium text-brand">{c.symbols.join(' · ')}</p><Link className="mt-5 inline-block text-sm font-medium text-brand underline underline-offset-4" href={'/brief?client='+c.id}>Open client brief →</Link></CardBody></Card>)}</div><Card><CardHeader title="Imported holdings" sub="Original values are preserved; currency and financial units are unspecified"/><HoldingsTable holdings={book.holdings}/></Card></div>}
