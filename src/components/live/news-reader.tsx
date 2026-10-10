'use client';
import { useEffect,useRef,useState } from 'react';
import { NewsEffects } from './news-effects';
import { useReportContext } from './report-context';
import type { ReadingBrief } from '@/lib/live/article-reader';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink,X,ArrowUpRight,AlignLeft,LoaderCircle,RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Figures } from '@/components/ui/figures';
import type { Story } from '@/lib/live/types';
import { stamp } from '@/lib/live/time';

async function loadReading(body:unknown,signal:AbortSignal):Promise<ReadingBrief>{
 for(let attempt=0;attempt<12;attempt++){
  const response=await fetch('/api/live/news-detail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error??'Article content unavailable');
  if(response.status!==202)return result;
  await new Promise<void>((resolve,reject)=>{const done=()=>{signal.removeEventListener('abort',abort);resolve();};const timer=setTimeout(done,2500);const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};signal.addEventListener('abort',abort,{once:true});});
 }
 throw new Error('This article is still preparing. Try again shortly.');
}
export function NewsReader({story,children}:{story:Story;children:React.ReactNode}){
 const context=useReportContext(),[open,setOpen]=useState(false),[reading,setReading]=useState<ReadingBrief|null>(null),[showSummary,setShowSummary]=useState(false),[loading,setLoading]=useState(false),[summarizing,setSummarizing]=useState(false),[retrying,setRetrying]=useState(false),[error,setError]=useState('');
 const summaryRequest=useRef<AbortController|null>(null);
 useEffect(()=>{
  if(!open){summaryRequest.current?.abort();return;}
  if(!context||reading)return;
  const controller=new AbortController();let active=true;
  loadReading({report:context.reportId,client:context.clientId,article:story.id},controller.signal)
   .then(result=>{if(active)setReading(result);})
   .catch(e=>{if(active&&!controller.signal.aborted)setError(e instanceof Error?e.message:'The publisher excerpt remains available.');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[open,context,story.id,reading]);
 // Downloads the article again and replaces the stored copy; used when only the excerpt could be read.
 async function retry(){
  if(!context)return;setRetrying(true);setError('');
  try{setReading(await loadReading({report:context.reportId,client:context.clientId,article:story.id,retry:true},AbortSignal.timeout(90000)));}
  catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'The article could not be downloaded. The publisher content below remains available.');}
  finally{setRetrying(false);}
 }
 async function summarize(){
  setShowSummary(true);
  if(reading?.summaryPoints?.length||!context)return;
  const controller=new AbortController();summaryRequest.current?.abort();summaryRequest.current=controller;
  setSummarizing(true);setError('');
  try{const result=await loadReading({report:context.reportId,client:context.clientId,article:story.id,summarize:true},controller.signal);if(!controller.signal.aborted)setReading(result);}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Summary unavailable; the original content remains below.');}
  finally{setSummarizing(false);}
 }
 const clients=[...new Map(story.matches.map(m=>[m.clientId,{name:m.client,holdings:story.matches.filter(x=>x.clientId===m.clientId)}])).values()];
 const full=reading?.basis==='full';
 return <Dialog.Root open={open} onOpenChange={value=>{setOpen(value);if(value&&!reading&&context){setLoading(true);setError('');}}}>
  <Dialog.Trigger asChild>{children}</Dialog.Trigger>
  <Dialog.Portal>
   <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm"/>
   <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[92dvh] w-[min(1360px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop focus:outline-none" aria-describedby="news-reader-description">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-sunken/50 px-6 py-3">
     <div className="flex flex-wrap items-center gap-2 text-xs"><span className="rounded bg-brand-50 px-2 py-1 font-semibold text-brand">{story.category==='company'?'Company development':story.category==='macro'?'Market development':'Industry development'}</span><span className="font-semibold text-ink">{story.publisher}</span><span className="text-muted">·</span><time className="text-muted" dateTime={story.publishedAt}>{stamp(story.publishedAt)}</time></div>
     <div className="flex flex-wrap items-center gap-2"><NewsEffects story={story}/><Button asChild size="sm" variant="secondary"><a href={story.url} target="_blank" rel="noopener noreferrer">Original<ExternalLink size={12}/></a></Button><Button size="sm" onClick={showSummary?()=>setShowSummary(false):summarize} disabled={loading||summarizing} aria-expanded={showSummary} aria-controls={'summary-'+story.id}>{summarizing?<LoaderCircle size={13} className="animate-spin"/>:<AlignLeft size={13}/>} {summarizing?'Summarizing…':showSummary?'Hide summary':'Summarize'}</Button><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="Close news article"><X size={18}/></Button></Dialog.Close></div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10 sm:py-8">
     <div className="mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
       <div className="flex flex-wrap gap-1.5">{story.topics.map(t=><span key={t} className="rounded border border-line bg-sunken/50 px-2 py-0.5 text-[11px] text-ink-2">{t}</span>)}</div>
       <Dialog.Title className="serif mt-4 max-w-[860px] text-[26px] font-semibold leading-[1.2] tracking-[-0.01em] text-ink sm:text-[34px]">{story.title}</Dialog.Title>
       <Dialog.Description id="news-reader-description" className="mt-3 text-xs leading-relaxed text-muted">Published {stamp(story.publishedAt)} · Source checked {stamp(story.verifiedAt)}</Dialog.Description>
       {loading?<p role="status" className="mt-5 flex items-center gap-2 text-xs text-muted"><LoaderCircle size={13} className="animate-spin"/>Loading available article content…</p>:null}
       {!loading&&(error||reading&&!full&&reading.basis!=='article')?<div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{error?'The article did not download.':'Only the publisher summary was downloaded.'}</span><Button size="sm" variant="secondary" onClick={retry} disabled={retrying}><RotateCw size={12} className={retrying?'animate-spin':''}/>{retrying?'Downloading…':'Retry download'}</Button></div>:null}
       {error?<p role="alert" className="mt-4 rounded-lg bg-sunken px-3 py-2 text-xs leading-relaxed text-muted">{error}</p>:null}
       {showSummary?<section id={'summary-'+story.id} className="mt-6 rounded-xl border border-brand-100 bg-brand-50 p-5" aria-label="Article key points">
        <h3 className="text-sm font-semibold text-brand">Key points explained</h3>
        {summarizing?<div role="status" className="mt-4"><p className="flex items-center gap-2 text-[13px] font-semibold text-ink"><LoaderCircle size={14} className="animate-spin text-brand"/>Generating AI summary of this article…</p><p className="mt-1 text-[12px] text-muted">Reading the full text, extracting the material facts and checking every figure against the source. This usually takes 10–20 seconds.</p><div className="mt-4 space-y-2.5" aria-hidden="true">{[92,78,85,64].map(w=><div key={w} className="skeleton h-3" style={{width:w+'%'}}/>)}</div></div>:reading?.summaryPoints?.length?<ul className="mt-4 space-y-4">{reading.summaryPoints.map((point,i)=><li key={i} className="flex gap-3 text-sm leading-relaxed"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"/><div><strong className="font-semibold text-ink">{point.label}</strong><p className="mt-1 whitespace-pre-wrap text-ink-2"><Figures text={point.text}/></p></div></li>)}</ul>:<div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-sm text-muted">The summary could not be generated right now. The article remains below.</p><Button size="sm" onClick={()=>{setReading(r=>r?{...r,summaryPoints:undefined,summaryStatus:undefined}:r);void summarize();}}>Try again</Button></div>}
        {reading?.summaryStatus==='limited'?<p className="mt-4 text-xs leading-relaxed text-muted">These points cover the content shown below. A complete article summary needs the full original text.</p>:reading?.summaryStatus==='ready'?<p className="mt-4 text-xs text-muted">Generated from the complete text shown below. Read the original for exact wording and context.</p>:null}
       </section>:null}
       <section className="mt-6 border-t border-line pt-5" aria-label={full?'Original article':'Available publisher content'}>
        <h3 className="text-sm font-semibold">{full?'Full article':reading?.basis==='article'?'Full article · '+(reading.sections[0]?.heading.replace(/^Reporting by /,'')??'related report'):loading?'Loading article…':'Publisher summary'}</h3>
        {loading?<div className="mt-4 space-y-2.5" aria-hidden="true">{[96,88,92,70,84,60].map(w=><div key={w} className="skeleton h-3" style={{width:w+'%'}}/>)}</div>:reading?.basis==='article'?<p className="mt-3 border-l-2 border-brand pl-3 text-xs leading-relaxed text-muted">Full text from {reading.via??'another publisher reporting the same story'}.</p>:!full&&reading?<p className="mt-3 border-l-2 border-amber pl-3 text-xs leading-relaxed text-muted">This publisher restricts automated reading (paywall or access controls), and no other readable report of the story was found. <a href={reading.sourceUrl||story.url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline">Open the original article</a>.</p>:null}
        <div className="mt-5 space-y-5">{(reading?.sections??[{heading:'Publisher excerpt',body:story.excerpt}]).map((section,i)=><div key={i}>{full&&reading!.sections.length>1?<h4 className="mb-3 text-base font-semibold">{section.heading}</h4>:null}<div className="space-y-4">{section.body.split(/\n\s*\n/).map((paragraph,j)=><p key={j} className="serif max-w-[760px] whitespace-pre-wrap text-[17px] leading-[1.8] text-ink-2"><Figures text={paragraph}/></p>)}</div></div>)}</div>
        <p className="mt-5 text-[11px] leading-relaxed text-muted">{full||reading?.basis==='article'?'Original source text; figures are preserved exactly as published.':'Publisher summary as published; nothing has been added.'}</p>
       </section>
       <section className="mt-7 rounded-lg border border-line p-4"><h3 className="text-sm font-semibold">Connection to this client scope</h3><p className="mt-2 text-sm leading-relaxed text-ink-2">{story.reason}</p><p className="mt-3 text-xs leading-relaxed text-muted">A consideration for discussion, not confirmation of a price effect or its direction.</p></section>
      </div>
      <aside className="space-y-4 border-t border-line pt-5 lg:sticky lg:top-0 lg:self-start lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
       <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Connected clients</h3>
       {clients.length?clients.map(c=><div key={c.name} className="rounded-lg border border-line p-3"><p className="text-sm font-semibold">{c.name}</p><div className="mt-2 flex flex-wrap gap-1.5">{[...new Set(c.holdings.map(h=>h.symbol+' '+h.direction))].map(h=><span key={h} className="rounded bg-sunken px-2 py-1 text-xs text-ink-2">{h}</span>)}</div></div>):<p className="text-xs text-muted">Matches a saved industry or watchlist interest.</p>}
       <div className="rounded-lg bg-sunken/60 p-3"><h3 className="text-xs font-semibold">Evidence</h3><p className="mt-2 text-xs leading-relaxed text-ink-2">{story.verification}</p><p className="mt-3 text-[11px] leading-relaxed text-muted">Times shown in US Eastern Time.</p></div>
       <Button asChild variant="secondary" className="w-full"><a href={story.url} target="_blank" rel="noopener noreferrer">Source attribution<ExternalLink size={13}/></a></Button>
       {story.relatedSources?.length?<div><h3 className="text-xs font-semibold">Related reporting</h3>{story.relatedSources.map(s=><a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-xs leading-relaxed text-brand underline">{s.publisher}: {s.title}</a>)}</div>:null}
      </aside>
     </div>
    </div>
    <div className="flex shrink-0 items-center justify-between border-t border-line bg-sunken/40 px-5 py-3"><p className="text-[11px] text-muted">News and client context · no automatic trading</p><Dialog.Close asChild><Button size="sm">Back to brief<ArrowUpRight size={12}/></Button></Dialog.Close></div>
   </Dialog.Content>
  </Dialog.Portal>
 </Dialog.Root>;
}
export function NewsRow({story}:{story:Story}){
 const clientCount=new Set(story.matches.map(m=>m.clientId)).size;
 return <article id={'story-'+story.id} className="scroll-mt-6 border-b border-line px-4 py-4 last:border-b-0 sm:px-5"><div className="flex items-start gap-3"><span aria-hidden="true" className={'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold '+(story.category==='company'?'bg-brand-50 text-brand':'bg-sunken text-ink-2')}>{story.category==='company'?'CO':story.category==='macro'?'MK':'IN'}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted"><span className="font-semibold text-ink-2">{story.publisher}</span><span>·</span><time dateTime={story.publishedAt}>{stamp(story.publishedAt)}</time>{story.topics.slice(0,2).map(t=><span key={t} className="rounded bg-sunken px-1.5 py-0.5 text-ink-2">{t}</span>)}</div><NewsReader story={story}><button type="button" className="mt-1.5 text-left text-[15px] font-semibold leading-snug text-ink hover:text-brand" aria-label={'Read news: '+story.title}>{story.title}</button></NewsReader><p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-2"><Figures text={story.excerpt}/></p><div className="mt-2.5 flex flex-wrap items-center gap-1.5">{[...new Set(story.matches.map(m=>m.symbol+' '+m.direction))].map(s=><span key={s} className="rounded border border-line px-1.5 py-0.5 text-[11px] font-medium">{s}</span>)}<span className="ml-1 text-[11px] text-muted">{clientCount?clientCount+' '+(clientCount===1?'client':'clients'):'Saved interest'}{story.relatedSources?.length?' · '+(story.relatedSources.length+1)+' sources':''}</span><span className="ml-auto"><NewsEffects story={story}/></span><NewsReader story={story}><button type="button" className=" inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand hover:bg-brand-50" aria-label={'Open details: '+story.title}>Read article<ArrowUpRight size={12}/></button></NewsReader></div></div></div></article>;
}
