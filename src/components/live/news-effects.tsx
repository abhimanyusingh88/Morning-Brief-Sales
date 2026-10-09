'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X,GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { holdingEffects } from '@/lib/live/effects';
import type { Story } from '@/lib/live/types';

export function NewsEffects({story}:{story:Story}){
 const effects=holdingEffects(story);
 return <Dialog.Root><Dialog.Trigger asChild><button type="button" className="inline-flex items-center gap-1 rounded border border-line px-2.5 py-1 text-xs font-medium text-brand hover:border-brand hover:bg-brand-50" aria-label={'Potential client effects: '+story.title}><GitBranch size={12}/>Effects</button></Dialog.Trigger><Dialog.Portal>
  <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm"/>
  <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[88dvh] w-[calc(100%-24px)] max-w-[860px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop focus:outline-none">
   <div className="flex items-center justify-between border-b border-line px-5 py-4"><Dialog.Title className="text-lg font-semibold">Potential client effects</Dialog.Title><Dialog.Close asChild><Button size="icon" variant="ghost" aria-label="Close potential effects"><X size={18}/></Button></Dialog.Close></div>
   <div className="overflow-y-auto p-5 sm:p-6">
    <h3 className="text-base font-semibold leading-snug">{story.title}</h3>
    <Dialog.Description className="mt-2 text-xs leading-relaxed text-muted">Possible transmission channels for the holdings matched in this filtered view. These are conditional considerations, not confirmed effects or trading instructions.</Dialog.Description>
    <div className="mt-4 rounded-lg border border-line bg-sunken/50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Reported evidence · {story.publisher}</p><p className="mt-2 text-sm leading-relaxed text-ink-2">{story.excerpt}</p></div>
    <div className="mt-5 space-y-4">{effects.map(effect=><section key={effect.clientId+effect.symbol+effect.direction} className="rounded-xl border border-line">
     <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-sunken/40 px-4 py-3"><div><h4 className="text-sm font-semibold">{effect.client}</h4><p className="mt-1 text-[11px] text-muted">{effect.connection}</p></div><div className="flex gap-2"><span className="rounded border border-line bg-surface px-2 py-1 text-xs font-semibold">{effect.symbol}</span><span className={'rounded px-2 py-1 text-xs font-medium '+(effect.direction==='Long'?'bg-brand-50 text-brand':'bg-amber-50 text-amber')}>{effect.direction}</span></div></div>
     <div className="space-y-4 p-4">{effect.channels.map(channel=><div key={channel.label}><h5 className="text-xs font-semibold text-ink">{channel.label}</h5><p className="mt-1 text-sm leading-relaxed text-ink-2">{channel.possibility}</p><p className="mt-1.5 text-xs leading-relaxed text-muted"><span className="font-semibold">Evidence to check: </span>{channel.confirm}</p></div>)}
     </div>
    </section>)}</div>
    {!effects.length?<p className="mt-5 text-sm text-muted">This news matches a saved interest. No holding in the selected client scope has been matched, so no client-specific effect is assigned.</p>:null}
    <p className="mt-5 text-[11px] leading-relaxed text-muted">No price reaction has been verified here. Position direction is imported from the client book; leverage, hedges and financial returns have not been inferred.</p>
   </div>
   <div className="flex justify-end border-t border-line px-5 py-3"><Dialog.Close asChild><Button size="sm">Back to news</Button></Dialog.Close></div>
  </Dialog.Content>
 </Dialog.Portal></Dialog.Root>;
}
