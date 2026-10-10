'use client';
import { useRef,useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X,Activity,LoaderCircle,RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReportContext } from './report-context';
import type { EffectsAnalysis } from '@/lib/live/effects-ai';
import type { Story } from '@/lib/live/types';
import { stamp } from '@/lib/live/time';

export function NewsEffects({story}:{story:Story}){
 const context=useReportContext();
 return <EffectsPanel key={(context?.reportId??'')+':'+(context?.clientId??'')+':'+(context?.symbol??'')} story={story}/>;
}
function EffectsPanel({story}:{story:Story}){
 const context=useReportContext(),[open,setOpen]=useState(false),[analysis,setAnalysis]=useState<EffectsAnalysis|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const active=useRef<AbortController|null>(null);
 async function load(){
  if(!context){setError('Reload the brief to analyze this article.');return;}
  active.current?.abort();const controller=new AbortController();active.current=controller;const timeout=setTimeout(()=>controller.abort(),160000);
  setLoading(true);setError('');
  try{
   for(let attempt=0;attempt<60;attempt++){
    const response=await fetch('/api/live/effects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({report:context.reportId,client:context.clientId,article:story.id,symbol:context.symbol??''}),signal:controller.signal});
    const body=await response.json();if(!response.ok)throw new Error(body.error??'Analysis unavailable');
    if(response.status===202){await new Promise(resolve=>setTimeout(resolve,2000));if(controller.signal.aborted)return;continue;}
    if(!controller.signal.aborted)setAnalysis(body);return;
   }
   throw new Error('Analysis is still preparing. Reopen Effects shortly to retrieve it.');
  }catch(e){if(controller.signal.aborted)setError('Analysis took too long. Reopen Effects to check its cached result.');else setError(e instanceof Error?e.message:'Analysis unavailable.');}
  finally{clearTimeout(timeout);setLoading(false);}
 }
 const matched=[...new Map(story.matches.map(m=>[m.clientId+':'+m.symbol+':'+m.direction,m])).values()];
 return <Dialog.Root open={open} onOpenChange={value=>{setOpen(value);if(value&&!analysis&&!loading)void load();}}>
  <Dialog.Trigger asChild><button type="button" className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-line-strong bg-surface px-2.5 text-[12px] font-semibold text-ink shadow-[0_1px_0_rgba(14,22,39,0.04)] transition-colors hover:border-navy hover:bg-sunken" aria-label={'Potential client effects: '+story.title}><Activity size={13} className="text-brand"/>Effects</button></Dialog.Trigger>
  <Dialog.Portal>
   <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm"/>
   <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-24px)] max-w-[1000px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop focus:outline-none">
    <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><Dialog.Title className="text-lg font-semibold">Client effects analysis</Dialog.Title><p className="mt-1 text-[11px] text-muted">AI analysis of this article and the selected holdings</p></div><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="Close client effects"><X size={18}/></Button></Dialog.Close></div>
    <div className="overflow-y-auto p-5 sm:p-7">
     <h3 className="text-xl font-semibold leading-snug tracking-tight">{story.title}</h3>
     <Dialog.Description className="mt-3 text-xs leading-relaxed text-muted">Reported facts are separate from possible client impacts. This is evidence-based discussion support; it does not establish a price reaction or a trade decision.</Dialog.Description>
     {loading?<div role="status" className="mt-6 rounded-xl border border-line bg-sunken/50 p-5"><p className="flex items-center gap-2 text-sm font-semibold"><LoaderCircle size={16} className="animate-spin"/>Analyzing the article for your client holdings…</p><p className="mt-2 text-xs leading-relaxed text-muted">Reviewing source evidence, checking the connection to each holding, and distinguishing possible effects from facts.</p></div>:null}
     {error?<div role="alert" className="mt-5 rounded-xl border border-line bg-sunken/50 p-4"><p className="text-sm leading-relaxed">{error}</p><Button size="sm" className="mt-3" onClick={load} disabled={loading}><RefreshCw size={13}/>Try again</Button></div>:null}
     {analysis?<div className="mt-6 space-y-6">
      <section className="rounded-xl border border-brand-100 bg-brand-50 p-5"><h4 className="text-sm font-semibold text-brand">Why this news matters</h4><p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-ink-2">{analysis.overview}</p></section>
      <section><h4 className="text-sm font-semibold">What the source reports</h4><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-ink-2">{analysis.reportedFacts.map((fact,i)=><li key={i}>{fact}</li>)}</ul></section>
      {analysis.holdings.map(h=><section key={h.holdingId} className="overflow-hidden rounded-xl border border-line">
       <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sunken/40 px-5 py-4"><div><h4 className="text-base font-semibold">{h.client}</h4><p className="mt-1 text-xs text-muted">{h.fund} · Account {h.account}</p></div><div className="flex flex-wrap gap-2">{h.impact?<span className={'rounded px-2 py-1 text-xs font-bold '+(h.impact==='Favourable'?'bg-up-50 text-up':h.impact==='Adverse'?'bg-down-50 text-down':h.impact==='Mixed'?'bg-amber-50 text-amber':'bg-sunken text-ink-2')}>{h.impact} for position</span>:null}{h.confidence?<span className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink-2">{h.confidence} confidence · {h.horizon}</span>:null}<span className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold">{h.symbol}</span><span className={'rounded px-2 py-1 text-xs font-medium '+(h.direction==='Long'?'bg-brand-50 text-brand':'bg-amber-50 text-amber')}>{h.direction}</span></div></div>
       <div className="space-y-5 p-5">{h.talkingPoint?<div className="rounded-lg border-l-4 border-l-navy bg-sunken/50 px-4 py-3"><h5 className="text-[11px] font-bold uppercase tracking-wider text-muted">Talking point</h5><p className="mt-1 text-[15px] font-medium leading-relaxed text-ink">{h.talkingPoint}</p></div>:null}<div><h5 className="text-xs font-semibold text-brand">Connection to this holding</h5><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-2">{h.relevance}</p></div>
        {h.possibleEffects.map((effect,i)=><div key={i}><h5 className="text-sm font-semibold">{effect.heading}</h5><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-2">{effect.explanation}</p></div>)}
        <div className="rounded-lg bg-sunken/60 p-4"><h5 className="text-xs font-semibold">What remains uncertain</h5><p className="mt-2 text-sm leading-relaxed text-ink-2">{h.uncertainty}</p></div>
        <div><h5 className="text-xs font-semibold">Specific evidence to watch</h5><ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-relaxed text-ink-2">{h.evidenceToWatch.map((item,i)=><li key={i}>{item}</li>)}</ul></div>
       </div>
      </section>)}
      <p className="text-[11px] leading-relaxed text-muted">{analysis.evidenceBasis==='original'?'Original source reporting reviewed.':'Based on the publisher excerpt; detailed article evidence was unavailable.'} Prepared {stamp(analysis.generatedAt)}. Analysis is cached for this evidence and client book.</p>
     </div>:!loading?<div className="mt-6"><h4 className="text-sm font-semibold">Matched holdings</h4><ul className="mt-2 space-y-2 text-sm text-ink-2">{matched.map(m=><li key={m.clientId+m.symbol+m.direction}>{m.client} · {m.symbol} · {m.direction}</li>)}</ul><p className="mt-3 text-xs text-muted">No generic effects have been substituted for an unavailable AI analysis.</p></div>:null}
    </div>
    <div className="flex justify-end border-t border-line px-5 py-3"><Dialog.Close asChild><Button size="sm">Back to news</Button></Dialog.Close></div>
   </Dialog.Content>
  </Dialog.Portal>
 </Dialog.Root>;
}
