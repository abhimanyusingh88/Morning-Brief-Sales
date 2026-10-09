import { redirect,notFound } from 'next/navigation';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getCoverage,getReport,parseFilters,validId } from '@/lib/live/reports';
import { businessDate } from '@/lib/live/time';
import { BriefView } from '@/components/live/brief-view';
export const dynamic='force-dynamic';export const metadata={title:'Market brief'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const me=await getMe();if(!me)redirect('/login');const raw=await searchParams;const p=new URLSearchParams(Object.entries(raw).filter((e):e is [string,string]=>typeof e[1]==='string'));const client=p.get('client')||null;const db=await getDb();const coverage=await getCoverage(db,me.id);if(client&&(!validId(client)||!coverage.clients.some(c=>c.id===client)))notFound();const report=await getReport(db,me.id,client);return <BriefView report={report} clients={coverage.clients} holdings={coverage.holdings} clientId={client} filters={parseFilters(p)} date={businessDate()}/>;}
