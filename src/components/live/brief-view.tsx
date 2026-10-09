'use client';
import { useMemo,useState,useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download,Info,Mail,RefreshCw,Search,Users,X } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card,CardBody } from '@/components/ui/card';
import { ReportContext } from './report-context';
import { BriefAssistant } from './brief-assistant';
import { ClientsDialog } from './clients-dialog';
import { ReportContent,HoldingsTable,type MarketPanel } from './report-content';
import { displayDay,stamp } from '@/lib/live/time';
import { filterStories } from '@/lib/live/presentation';
import { TOPICS,type Client,type Filters,type Holding,type Report } from '@/lib/live/types';
const SECTIONS=[['today-news','Key events'],['market-snapshot','Markets'],['market-detail','Data & sources'],['market-wrap','Wrap'],['client-book','My book'],['coverage-news','Headlines']] as const;
export function BriefView({report,clients,clientId,holdings,filters,date,market}:{report:Report|null;clients:Client[];clientId:string|null;holdings:Holding[];filters:Filters;date:string;market?:MarketPanel}){
 const router=useRouter(),[pending,start]=useTransition(),[refreshing,setRefreshing]=useState(false),[exporting,setExporting]=useState(false),[mailing,setMailing]=useState(false),[message,setMessage]=useState(''),[section,setSection]=useState('today-news');
 const readerContext=useMemo(()=>({reportId:report?.id??'',clientId,symbol:filters.symbol}),[report?.id,clientId,filters.symbol]);
 const update=(field:string,value:string)=>{const p=new URLSearchParams(window.location.search);p.delete('report');if(field==='client'){p.delete('symbol');p.delete('q');p.delete('topic');}if(value)p.set(field,value);else p.delete(field);start(()=>router.push('/brief'+(p.size?'?'+p.toString():''),{scroll:false}));};
 const refresh=async()=>{setRefreshing(true);setMessage('');try{const r=await fetch('/api/live/refresh',{method:'POST',signal:AbortSignal.timeout(200000)});const b=await r.json();if(!r.ok)throw new Error(b.error??'Refresh unavailable');router.refresh();setMessage('Brief updated from available sources.');}catch(e){setMessage(e instanceof Error?e.message:'Refresh unavailable. Your saved report remains available.');}finally{setRefreshing(false);}};
 const email=async()=>{setMailing(true);setMessage('');try{const r=await fetch('/api/live/email',{method:'POST',signal:AbortSignal.timeout(65000)});const b=await r.json();if(!r.ok)throw new Error(b.error??'Email unavailable');setMessage('Morning brief emailed to the desk distribution list, with the PDF attached.');}catch(e){setMessage(e instanceof Error?e.message:'Email unavailable. Try again shortly.');}finally{setMailing(false);}};
 const download=async()=>{if(!report)return;setExporting(true);setMessage('');try{const p=new URLSearchParams({report:report.id,q:filters.q,topic:filters.topic,symbol:filters.symbol});if(clientId)p.set('client',clientId);const r=await fetch('/api/live/export?'+p.toString());if(!r.ok){const b=await r.json();throw new Error(b.error??'Could not export this report');}const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');a.href=url;a.download='market-brief-'+report.businessDate+'-'+report.id.slice(0,8)+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setMessage(e instanceof Error?e.message:'Could not export this report. Try again.');}finally{setExporting(false);}};
 const current=clientId?holdings.filter(h=>h.clientId===clientId):holdings,symbols=[...new Set(current.map(h=>h.symbol))].sort(),active=Boolean(filters.q||filters.topic||filters.symbol);
 const count=report?filterStories(report,filters).length:0;
 return <div className="space-y-4">
  <header className="rounded-xl border border-line bg-surface px-5 py-4 shadow-card">
   <div className="flex flex-wrap items-center justify-between gap-4">
    <div className="min-w-0">
     <p className="eyebrow">Sales intelligence</p>
     <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1"><h1 className="text-[24px] font-semibold leading-none tracking-[-0.03em]">Morning brief</h1>{report?<span className="text-[12px] font-medium text-muted">Updated {stamp(report.cutoff)}</span>:<span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber">Preparing</span>}</div>
     <p className="mt-1.5 text-[12.5px] text-muted">{displayDay(date)} · US Eastern Time</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
     <ClientsDialog clients={clients} holdings={holdings} selected={clientId} onSelect={id=>update('client',id)}><Button size="md" variant="secondary"><Users size={14}/>Clients<span className="num rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">{clients.length}</span></Button></ClientsDialog>
     <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line sm:block"/>
     <div className="inline-flex overflow-hidden rounded-lg border border-line-strong shadow-[0_1px_0_rgba(14,22,39,0.03)]">
      <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex h-9 items-center gap-1.5 bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-60"><RefreshCw size={14} className={refreshing?'animate-spin':''}/>{refreshing?'Updating…':'Refresh'}</button>
      <button type="button" onClick={download} disabled={!report||pending||exporting} className="inline-flex h-9 items-center gap-1.5 border-l border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-60"><Download size={14}/>{exporting?'Preparing…':'PDF'}</button>
     </div>
     <Button size="md" variant="dark" onClick={email} disabled={!report||mailing}><Mail size={14}/>{mailing?'Sending…':'Email brief'}</Button>
    </div>
   </div>
  </header>
  <div className="sticky top-0 z-20 rounded-xl border border-line bg-surface/95 shadow-card backdrop-blur">
   <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
    <Select label="Client" value={clientId??''} onChange={v=>update('client',v)} disabled={pending} searchable icon={<Users size={14}/>} className="w-full sm:w-64" options={[{value:'',label:'All my clients',hint:String(holdings.length)},...clients.map(c=>({value:c.id,label:c.name,hint:String(c.holdings)}))]}/>
    <form className="min-w-[220px] flex-1" onSubmit={e=>{e.preventDefault();update('q',String(new FormData(e.currentTarget).get('q')??''));}}><label className="flex h-9 items-center rounded-lg border border-line-strong bg-surface transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-100 hover:border-brand"><Search size={14} aria-hidden="true" className="ml-3 shrink-0 text-muted"/><input name="q" aria-label="Search news" defaultValue={filters.q} key={filters.q} maxLength={160} placeholder="Search headlines, companies, events…" disabled={pending} className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] outline-none placeholder:text-muted"/><kbd className="mr-2.5 hidden rounded border border-line bg-sunken px-1.5 text-[10px] text-muted sm:inline">↵</kbd></label></form>
    <Select label="Topic" value={filters.topic} onChange={v=>update('topic',v)} disabled={pending} className="w-[calc(50%-4px)] sm:w-40" align="end" options={[{value:'',label:'All topics'},...TOPICS.map(t=>({value:t,label:t}))]}/>
    <Select label="Stock" value={filters.symbol} onChange={v=>update('symbol',v)} disabled={pending} searchable className="w-[calc(50%-4px)] sm:w-36" align="end" options={[{value:'',label:'All stocks'},...symbols.map(s=>({value:s,label:s}))]}/>
    {active?<button type="button" disabled={pending} onClick={()=>start(()=>router.push('/brief'+(clientId?'?client='+clientId:''),{scroll:false}))} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-medium text-brand hover:bg-brand-50"><X size={13}/>Clear</button>:null}
   </div>
   <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3">
    <nav aria-label="Brief sections" className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">{SECTIONS.map(([id,l])=><a key={id} href={'#'+id} onClick={()=>setSection(id)} className={'whitespace-nowrap border-b-2 px-2.5 py-2 text-[12px] font-semibold transition-colors '+(section===id?'border-brand text-brand':'border-transparent text-ink-2 hover:text-ink')}>{l}</a>)}</nav>
    <div className="hidden items-center gap-4 py-2 text-[11.5px] text-muted lg:flex"><span><span className="num font-semibold text-ink">{clientId?1:clients.length}</span> {clientId||clients.length===1?'client':'clients'}</span><span><span className="num font-semibold text-ink">{current.length}</span> positions</span><span><span className="num font-semibold text-ink">{report?count:0}</span> developments</span></div>
   </div>
  </div>
  {message?<div role="status" className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink-2 shadow-card"><Info size={14} className="shrink-0 text-brand"/><span className="flex-1">{message}</span><button type="button" aria-label="Dismiss" onClick={()=>setMessage('')} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink"><X size={13}/></button></div>:null}
  <div aria-busy={pending} className={pending?'opacity-60 transition-opacity':'transition-opacity'}>{report?<ReportContext.Provider value={readerContext}><ReportContent report={report} filters={filters} market={market}/></ReportContext.Provider>:<div className="space-y-4"><Card><CardBody><h2 className="text-sm font-semibold">Your client coverage is ready</h2><p className="mt-2 text-xs leading-relaxed text-muted">No current briefing has been published for this view. Refresh to prepare it from available sources.</p></CardBody></Card><Card><HoldingsTable holdings={current}/></Card></div>}</div>
  {report?<ReportContext.Provider value={readerContext}><BriefAssistant key={report.id+JSON.stringify(filters)} report={report} filters={filters} clients={clients}/></ReportContext.Provider>:null}
 </div>;
}
