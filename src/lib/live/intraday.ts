import { fetchSource } from './fetch';
import { businessDate } from './time';
import type { Db } from '../db/types';
// Delayed public chart data. Every series carries its source URL and the provider's own market timestamp.
export type Series={symbol:string;label:string;points:{t:number;v:number}[];last:number;previousClose:number|null;changePct:number|null;at:string;currency:string|null;source:string;url:string};
export type CalendarEvent={time:string;title:string;country:string;impact:string;forecast:string;previous:string};
export type Calendar={events:CalendarEvent[];source:string;url:string;fetchedAt:string;scope:'today'|'week'};
const cache=new Map<string,{at:number;value:unknown}>();
async function cached<T>(key:string,ttl:number,load:()=>Promise<T>):Promise<T>{const hit=cache.get(key);if(hit&&Date.now()-hit.at<ttl)return hit.value as T;const value=await load();cache.set(key,{at:Date.now(),value});if(cache.size>400)cache.delete(cache.keys().next().value!);return value;}
export function parseChart(text:string,symbol:string,label:string,url:string):Series{
 const r=JSON.parse(text)?.chart?.result?.[0];if(!r?.meta||!Array.isArray(r.timestamp))throw new Error('SOURCE_SCHEMA');
 const close:unknown[]=r.indicators?.quote?.[0]?.close??[];const points=r.timestamp.map((t:number,i:number)=>({t:t*1000,v:Number(close[i])})).filter((p:{t:number;v:number})=>close.length&&Number.isFinite(p.v)&&p.v>0&&p.t>0);
 const last=Number(r.meta.regularMarketPrice??points.at(-1)?.v);const prev=Number(r.meta.chartPreviousClose??r.meta.previousClose);
 if(!Number.isFinite(last)||last<=0)throw new Error('SOURCE_SCHEMA');
 const previousClose=Number.isFinite(prev)&&prev>0?prev:null;
 return {symbol,label,points,last,previousClose,changePct:previousClose?(last/previousClose-1)*100:null,at:new Date(Number(r.meta.regularMarketTime??points.at(-1)!.t/1000)*1000).toISOString(),currency:r.meta.currency??null,source:'Yahoo Finance chart (delayed)',url};
}
export async function getSeries(symbol:string,label=symbol,range:'1d'|'5d'='1d',interval:'5m'|'15m'|'30m'='5m'):Promise<Series|null>{
 const url='https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?range='+range+'&interval='+interval+'&includePrePost=true';
 try{return await cached('s:'+url,4*60000,async()=>{const r=await fetchSource(url,AbortSignal.timeout(7000));return parseChart(r.text,symbol,label,url);});}catch{return null;}
}
export async function getMovers(symbols:string[]):Promise<Series[]>{
 const out=await Promise.all([...new Set(symbols)].slice(0,40).map(s=>getSeries(s,s,'1d','15m')));return out.filter((x):x is Series=>!!x);
}
const FF='https://nfs.faireconomy.media/ff_calendar_thisweek.json';
export function parseCalendar(text:string,now:Date):Calendar{
 const rows=JSON.parse(text);if(!Array.isArray(rows))throw new Error('SOURCE_SCHEMA');
 const all:CalendarEvent[]=rows.filter(r=>r&&typeof r==='object'&&typeof r.date==='string'&&Number.isFinite(Date.parse(r.date))&&['USD','EUR','GBP','JPY','CNY'].includes(String(r.country))).map(r=>({time:new Date(r.date).toISOString(),title:String(r.title??'').slice(0,120),country:String(r.country),impact:String(r.impact??''),forecast:String(r.forecast??''),previous:String(r.previous??'')}));
 const today=all.filter(e=>businessDate(new Date(e.time))===businessDate(now)&&e.impact!=='Holiday');
 const scope=today.length?'today':'week';
 const events=(today.length?today:all.filter(e=>Date.parse(e.time)>=now.getTime()&&e.country==='USD'&&e.impact==='High').slice(0,10)).sort((a,b)=>a.time.localeCompare(b.time));
 return {events,source:'Forex Factory economic calendar',url:'https://www.forexfactory.com/calendar',fetchedAt:now.toISOString(),scope};
}
/**
 * The calendar provider rate-limits aggressively, so one shared database row is the source of truth:
 * refetch at most every thirty minutes (and wait ten after a failure); otherwise serve the stored copy.
 */
export async function getCalendar(now=new Date(),db?:Db):Promise<Calendar|null>{
 const key='ff:'+businessDate(now);
 const load=async()=>{const r=await fetchSource(FF,AbortSignal.timeout(7000));return parseCalendar(r.text,now);};
 if(!db){try{return await cached('cal:'+key,30*60000,load);}catch{return null;}}
 return cached('calrow:'+key,60000,async()=>{
  const [row]=await db.asService(q=>q('select payload,fetched_at,attempted_at from live_calendar_cache where cache_key=$1',[key]));
  const age=(x:unknown)=>x?now.getTime()-new Date(String(x)).getTime():Infinity;
  if(row?.payload&&age(row.fetched_at)<30*60000)return row.payload as Calendar;
  if(row&&age(row.attempted_at)<10*60000)return (row.payload as Calendar)??null;
  await db.asService(q=>q('insert into live_calendar_cache(cache_key,attempted_at) values($1,now()) on conflict(cache_key) do update set attempted_at=now()',[key]));
  try{const c=await load();await db.asService(q=>q('update live_calendar_cache set payload=$2::jsonb,fetched_at=now() where cache_key=$1',[key,JSON.stringify(c)]));return c;}
  catch{return (row?.payload as Calendar)??null;}
 }).catch(()=>null);
}
export const OVERNIGHT=[{symbol:'ES=F',label:'S&P 500 E-mini futures'},{symbol:'NQ=F',label:'Nasdaq 100 E-mini futures'}] as const;
