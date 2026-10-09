import { redirect,notFound } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getCoverage,getReport,parseFilters,validId } from '@/lib/live/reports';
import { businessDate } from '@/lib/live/time';
import { getCalendar,getMovers,getSeries,OVERNIGHT } from '@/lib/live/intraday';
import { BriefView } from '@/components/live/brief-view';
export const dynamic='force-dynamic';export const metadata={title:'Market brief'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const me=await getMe();if(!me)redirect('/login');const raw=await searchParams;const p=new URLSearchParams(Object.entries(raw).filter((e):e is [string,string]=>typeof e[1]==='string'));const client=p.get('client')||null;const db=await getDb();const coverage=await getCoverage(db,me.id);if(client&&(!validId(client)||!coverage.clients.some(c=>c.id===client)))notFound();
 const symbols=[...new Set(coverage.holdings.filter(h=>!client||h.clientId===client).map(h=>h.symbol))];
 // Public market data only: symbols are sent to the quote provider, never client names or positions.
 const [report,overnight,movers,calendar]=await Promise.all([getReport(db,me.id,client),Promise.all(OVERNIGHT.map(o=>getSeries(o.symbol,o.label,'1d','5m'))),getMovers(symbols),getCalendar(new Date(),db)]);
 return <BriefView report={report} clients={coverage.clients} holdings={coverage.holdings} clientId={client} filters={parseFilters(p)} date={businessDate()} market={{overnight:overnight.filter(s=>s!==null),movers,calendar}}/>;}
