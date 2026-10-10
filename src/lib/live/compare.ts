import type { FactBook } from '../ai/facts';
import type { Metric,Report,Story } from './types';
import { formatMetric,metricChange,sameNewsEvent } from './presentation';
import { displayDay,stamp } from './time';
// Day-over-day comparison of two published briefs for the same client scope. Everything here is computed in code
// from the two saved snapshots: level-to-level moves use the same unit rules as the brief (indices and yields in bp,
// commodities and crypto in percent, VIX as level plus percent). A model may narrate it, but never computes it.
export type MetricDelta={key:string;label:string;unit:string;base:string;current:string;baseAsOf:string|null;currentAsOf:string|null;
 move:{value:number;label:string}|null;levelChange:string|null;baseSession:string|null;currentSession:string|null;stale:boolean;session:string|null;source:string|null};
export type ThemeShift={topic:string;base:number;current:number};
export type HoldingShift={symbol:string;direction:string;clients:string[];base:number;current:number};
export type Comparison={current:{day:string;cutoff:string;stories:number};base:{day:string;cutoff:string;stories:number};scope:string;
 metrics:MetricDelta[];themes:ThemeShift[];holdings:HoldingShift[];continuing:{current:Story;base:Story}[];newStories:Story[];faded:Story[];
 keyEvents:{current:string[];base:string[]}};
const session=(m:Metric)=>metricChange(m)?.label??null;
function delta(now:Metric,then:Metric):MetricDelta{
 const pseudo={...now,value:now.value,previous:then.value} as Metric;
 const move=now.value!==null&&then.value!==null?metricChange(pseudo):null;
 // VIX is quoted as a level: report the point change alongside the percent move.
 const levelChange=now.unit==='level'&&now.value!==null&&then.value!==null?((now.value-then.value>0?'+':'')+(now.value-then.value).toFixed(2)+' pts'):null;
 return {key:now.key,label:now.label,unit:now.unit,base:formatMetric(then),current:formatMetric(now),baseAsOf:then.observedAt??then.observedDate,currentAsOf:now.observedAt??now.observedDate,
  move,levelChange,baseSession:session(then),currentSession:session(now),// Same quote on both days (a closed market), or two quotes from one session (an intraday read, then the close).
  stale:Boolean((now.observedAt??now.observedDate)&&(now.observedAt??now.observedDate)===(then.observedAt??then.observedDate)&&now.value===then.value),session:now.observedDate&&now.observedDate===then.observedDate?now.observedDate:null,source:now.source??then.source};
}
const directCount=(r:Report,symbol:string)=>r.articles.filter(a=>a.category!=='macro'&&(a.symbols.includes(symbol)||a.matches.some(m=>m.symbol===symbol&&m.reason!=='Sector connection'))).length;
export function compareReports(current:Report,base:Report):Comparison{
 const metrics=current.metrics.flatMap(m=>{const b=base.metrics.find(x=>x.key===m.key);return b&&(m.value!==null||b.value!==null)?[delta(m,b)]:[];});
 const topics=new Set([...current.articles,...base.articles].flatMap(a=>a.topics));
 const count=(r:Report,t:string)=>r.articles.filter(a=>a.topics.includes(t)).length;
 const themes=[...topics].map(topic=>({topic,base:count(base,topic),current:count(current,topic)})).filter(t=>t.base||t.current).sort((a,b)=>Math.abs(b.current-b.base)-Math.abs(a.current-a.base)||b.current-a.current).slice(0,10);
 const held=new Map<string,HoldingShift>();
 for(const h of [...current.holdings,...base.holdings]){const k=h.symbol+':'+h.direction;const x=held.get(k)??{symbol:h.symbol,direction:h.direction,clients:[],base:0,current:0};if(!x.clients.includes(h.client))x.clients.push(h.client);held.set(k,x);}
 const holdings=[...held.values()].map(h=>({...h,base:directCount(base,h.symbol),current:directCount(current,h.symbol)})).sort((a,b)=>Math.abs(b.current-b.base)-Math.abs(a.current-a.base)||b.current-a.current);
 // The same event on both days is a continuing story; the rest are new today or no longer in the top of the book.
 const top=(r:Report)=>[...r.articles].sort((a,b)=>b.score-a.score).slice(0,40);
 const nowTop=top(current),thenTop=top(base);
 const continuing=nowTop.flatMap(c=>{const b=thenTop.find(x=>sameNewsEvent(c,x));return b?[{current:c,base:b}]:[];}).slice(0,8);
 const newStories=nowTop.filter(c=>!thenTop.some(x=>sameNewsEvent(c,x))).slice(0,8);
 const faded=thenTop.filter(b=>!nowTop.some(x=>sameNewsEvent(x,b))).slice(0,6);
 return {current:{day:current.businessDate,cutoff:current.cutoff,stories:current.articles.length},base:{day:base.businessDate,cutoff:base.cutoff,stories:base.articles.length},scope:current.clientName,
  metrics,themes,holdings,continuing,newStories,faded,keyEvents:{current:current.desk?.keyEvents.map(e=>e.text).slice(0,5)??[],base:base.desk?.keyEvents.map(e=>e.text).slice(0,5)??[]}};
}
const day=(d:string)=>displayDay(d);
const signed=(n:number)=>(n>0?'+':'')+n;
/** A complete, code-written comparison for the chat: used directly, and as the fallback when no model answer verifies. */
export function comparisonAnswer(c:Comparison):string{
 const a=day(c.current.day),b=day(c.base.day);
 const moved=c.metrics.filter(m=>m.move).sort((x,y)=>Math.abs(y.move!.value)/(y.move!.label.endsWith('bp')?100:1)-Math.abs(x.move!.value)/(x.move!.label.endsWith('bp')?100:1));
 const lines=[`**${a} versus ${b} — ${c.scope}**`,
  `Briefs compared: ${a} (published ${stamp(c.current.cutoff)}, ${c.current.stories} stories) and ${b} (published ${stamp(c.base.cutoff)}, ${c.base.stories} stories).`,
  '## Markets, level to level',
  ...(moved.length?moved.map(m=>`• **${m.label}**: ${m.base} → ${m.current} (${m.move!.label}${m.levelChange?', '+m.levelChange:''})${m.stale?' · same observation on both days (market closed)':m.session?' · both from the '+m.session+' session (earlier quote, then later quote)':''}`):['• No market level is available on both days.']),
  ...(c.metrics.some(m=>!m.move)?['• Not comparable (missing on one day): '+c.metrics.filter(m=>!m.move).map(m=>m.label).join(', ')]:[]),
  '## Session moves on each day',
  ...c.metrics.filter(m=>m.baseSession||m.currentSession).slice(0,8).map(m=>`• **${m.label}**: ${b} ${m.baseSession??'n/a'} · ${a} ${m.currentSession??'n/a'}`),
  '## Themes in the news',
  ...(c.themes.length?c.themes.slice(0,6).map(t=>`• **${t.topic}**: ${t.base} → ${t.current} stories (${signed(t.current-t.base)})`):['• No tagged themes on either day.']),
  '## Your book',
  ...(c.holdings.filter(h=>h.base||h.current).slice(0,8).map(h=>`• **${h.symbol}** ${h.direction} (${h.clients.join(', ')}): ${h.base} → ${h.current} direct or peer stories`)),
  ...(c.holdings.every(h=>!h.base&&!h.current)?['• No direct or peer news on held names on either day.']:[]),
  '## Continuing stories',
  ...(c.continuing.length?c.continuing.slice(0,5).map(s=>`• ${s.current.title} — ${s.current.publisher}`):['• No event appears in the top stories of both days.']),
  '## New since '+b,
  ...(c.newStories.length?c.newStories.slice(0,5).map(s=>`• ${s.title} — ${s.publisher}`):['• Nothing new reached the top of the book.']),
  ...(c.faded.length?['## No longer leading',...c.faded.slice(0,4).map(s=>`• ${s.title} — ${s.publisher}`)]:[]),
  `Level-to-level moves compare each brief's latest observation (indices and yields in bp, commodities and crypto in percent, VIX also in points). Observations are timestamped in the briefs; a market closed on one day carries its previous session.`];
 return lines.join('\n');
}
/** The comparison as model evidence: every figure is a fact token, so the validator still rejects invented numbers. */
export function comparisonContext(c:Comparison,facts:FactBook){
 const add=(key:string,label:string,display:string,source:string,asOf:string)=>facts.add({key,label,display,value:null,unit:'text',source,asOf});
 const at=c.current.cutoff;
 const stories=[...c.continuing.map(x=>x.current),...c.newStories,...c.faded];
 const ref=(s:Story,i:number,kind:string)=>({id:s.id,title:add('cmp.'+kind+'.'+i+'.title','Published headline',s.title,s.publisher,s.publishedAt),publisher:s.publisher,published:add('cmp.'+kind+'.'+i+'.at','Publication time',stamp(s.publishedAt),s.publisher,s.publishedAt)});
 return {stories,context:{
  instruction:'Compare the current brief with the base day. Lead with the biggest change in the market picture, then what changed for the held names, then which stories are continuing versus new. Every figure must be one of these tokens.',
  current_day:add('cmp.day.current','Current brief day',displayDay(c.current.day),'Report',at),base_day:add('cmp.day.base','Base brief day',displayDay(c.base.day),'Report',c.base.cutoff),
  current_story_count:add('cmp.count.current','Stories in current brief',String(c.current.stories),'Report',at),base_story_count:add('cmp.count.base','Stories in base brief',String(c.base.stories),'Report',c.base.cutoff),
  markets:c.metrics.map(m=>({label:m.label,base_level:add('cmp.m.'+m.key+'.base',m.label+' on base day',m.base,m.source??'',m.baseAsOf??c.base.cutoff),current_level:add('cmp.m.'+m.key+'.current',m.label+' on current day',m.current,m.source??'',m.currentAsOf??at),
   move_between_days:m.move?add('cmp.m.'+m.key+'.move',m.label+' move between the two briefs',m.move.label,m.source??'',m.currentAsOf??at):null,direction:m.move?(m.move.value>0?'higher':m.move.value<0?'lower':'unchanged'):null,
   points_change:m.levelChange?add('cmp.m.'+m.key+'.pts',m.label+' point change',m.levelChange,m.source??'',m.currentAsOf??at):null,
   base_session_move:m.baseSession?add('cmp.m.'+m.key+'.bs',m.label+' session move on base day',m.baseSession,m.source??'',m.baseAsOf??c.base.cutoff):null,current_session_move:m.currentSession?add('cmp.m.'+m.key+'.cs',m.label+' session move on current day',m.currentSession,m.source??'',m.currentAsOf??at):null,same_observation_both_days:m.stale,same_session:m.session})),
  themes:c.themes.map((t,i)=>({topic:t.topic,base_count:add('cmp.t.'+i+'.base',t.topic+' stories on base day',String(t.base),'Report',c.base.cutoff),current_count:add('cmp.t.'+i+'.current',t.topic+' stories on current day',String(t.current),'Report',at),trend:t.current>t.base?'more coverage':t.current<t.base?'less coverage':'unchanged'})),
  holdings:c.holdings.slice(0,20).map((h,i)=>({symbol:h.symbol,direction:h.direction,clients:h.clients,base_stories:add('cmp.h.'+i+'.base',h.symbol+' stories on base day',String(h.base),'Report',c.base.cutoff),current_stories:add('cmp.h.'+i+'.current',h.symbol+' stories on current day',String(h.current),'Report',at)})),
  continuing:c.continuing.map((x,i)=>ref(x.current,i,'cont')),new_on_current_day:c.newStories.map((s,i)=>ref(s,i,'new')),no_longer_leading:c.faded.map((s,i)=>ref(s,i,'faded')),
  key_events_untokenized_reference:c.keyEvents}};
}
