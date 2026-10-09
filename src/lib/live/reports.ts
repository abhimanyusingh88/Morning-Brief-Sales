import { createHash } from 'node:crypto';
import type { Db,Q } from '../db/types';
import { businessDate } from './time';
import { COMPANIES } from './classify';
import { METRICS,type Article,type Client,type Holding,type Metric,type Preferences,type Report,type Story } from './types';
export const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const validId=(s:string)=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
const str=(x:unknown)=>x==null?null:String(x);
const iso=(x:unknown)=>x instanceof Date?x.toISOString():String(x);
const day=(x:unknown)=>iso(x).slice(0,10);
export async function holdings(q:Q):Promise<Holding[]> {
 const rows=await q('select h.*,a.id aid,a.external_id,a.name fund,a.currency,a.valuation_date,c.id cid,c.name client from live_holdings h join live_accounts a on a.id=h.account_id join live_clients c on c.id=a.client_id where h.active and a.active and c.active order by c.name,a.external_id,h.symbol,h.direction');
 return rows.map(r=>({id:String(r.id),clientId:String(r.cid),client:String(r.client),accountId:String(r.aid),account:String(r.external_id),fund:String(r.fund),symbol:String(r.symbol),direction:r.direction as Holding['direction'],quantity:String(r.quantity),currentValue:String(r.current_value),initialValue:String(r.initial_value),spread:String(r.spread),margin:String(r.margin),currency:str(r.currency),valuationDate:r.valuation_date?day(r.valuation_date):null}));
}
export function clientsFrom(h:Holding[]):Client[]{return [...new Set(h.map(x=>x.clientId))].map(id=>{const rows=h.filter(x=>x.clientId===id);return {id,name:rows[0].client,accounts:new Set(rows.map(x=>x.accountId)).size,holdings:rows.length,symbols:[...new Set(rows.map(x=>x.symbol))].sort()};});}
export async function getCoverage(db:Db,profileId:string){return db.asUser(profileId,async q=>{const h=await holdings(q);return {holdings:h,clients:clientsFrom(h),hash:hash(h)};});}
export function matchArticles(articles:Article[],h:Holding[],preferences:Preferences):Story[]{
 const symbols=new Set(h.map(x=>x.symbol));const interests=new Set([...preferences.sectors,...h.flatMap(x=>COMPANIES[x.symbol]?.topics??[])]);
 return articles.flatMap(a=>{if(/\b(nobel|obituary)\b/i.test(a.title))return [];const direct=a.symbols.filter(s=>symbols.has(s));const macro=a.topics.some(t=>['Markets','Credit','Trade','Oil','Geopolitics','Rates','Regulation'].includes(t));const industry=a.topics.filter(t=>interests.has(t));const watch=a.symbols.filter(s=>preferences.symbols.includes(s));if(!direct.length&&!macro&&!industry.length&&!watch.length)return [];
 const category=direct.length?'company':macro?'macro':'industry';const matched=direct.length?h.filter(x=>direct.includes(x.symbol)):macro?h:h.filter(x=>(COMPANIES[x.symbol]?.topics??[]).some(t=>industry.includes(t)));
 const channels=a.topics.flatMap(t=>({Oil:'energy costs and inflation',Geopolitics:'supply disruption and market risk',Rates:'financing costs and equity valuations',Credit:'funding conditions',Trade:'tariffs and supply chains',Markets:'broad risk sentiment',Regulation:'operating restrictions and compliance costs'} as Record<string,string>)[t]??[]);
 const reason=direct.length?'Mentions a stock held in this client scope.':macro?'Potential connection: '+channels.slice(0,2).join('; ')+'. Stock impact and direction are not established.':watch.length?'Matches your saved watchlist.':'Matches the industries covered by this book.';
 return [{...a,category,reason,matches:matched.map(x=>({clientId:x.clientId,client:x.client,symbol:x.symbol,direction:x.direction,reason:direct.length?'Direct issuer match':macro?'Possible broad market exposure':'Industry connection'})),score:direct.length?100:macro?a.topics.includes('Geopolitics')?85:a.topics.includes('Oil')?80:a.topics.includes('Rates')?75:60:50} as Story];}).sort((a,b)=>b.score-a.score||b.publishedAt.localeCompare(a.publishedAt));
}
export async function getPreferences(db:Db,profileId:string):Promise<Preferences>{return db.asUser(profileId,async q=>{const [r]=await q('select sectors,symbols,timezone from live_preferences where profile_id=$1',[profileId]);return {sectors:r?.sectors as string[]??[],symbols:r?.symbols as string[]??[],timezone:'America/New_York'};});}
function metricRows(rows:Record<string,unknown>[],date:string):Metric[]{return METRICS.map(([key,label,group,unit])=>{const r=rows.find(x=>x.metric===key);const dateOf=r?day(r.observed_date):null;const current=dateOf===date;return {key,label:key==='WTI'?'WTI crude futures':key==='GOLD'?'Gold futures':key==='SILVER'?'Silver futures':label,group,unit,value:r?Number(r.value):null,previous:r&&r.previous!=null?Number(r.previous):null,observedDate:dateOf,observedAt:r?.observed_at?iso(r.observed_at):null,fetchedAt:r?.fetched_at?iso(r.fetched_at):null,source:str(r?.source),url:str(r?.source_url),cadence:r?.cadence as Metric['cadence']??'daily',note:current?(r!.cadence==='daily'?'Today · daily observation':'Today · delayed quote'):r?(r.cadence==='daily'?'Latest daily observation · ':group==='Equities'?'Previous close · ':'Latest available quote · ')+dateOf:'No verified observation is available.'};});}
export async function makeReport(db:Db,profileId:string,clientId:string|null,now=new Date()):Promise<Omit<Report,'id'>> {
 return db.asUser(profileId,async q=>{
 const [p]=await q('select full_name from profiles where id=$1 and is_active',[profileId]);if(!p)throw new Error('PROFILE_UNAVAILABLE');const all=await holdings(q),h=clientId?all.filter(x=>x.clientId===clientId):all;if(clientId&&!h.length)throw new Error('SCOPE_UNAVAILABLE');const date=businessDate(now);
 const [prefs]=await q('select * from live_preferences where profile_id=$1',[profileId]);const preferences={sectors:prefs?.sectors as string[]??[],symbols:prefs?.symbols as string[]??[],timezone:'America/New_York'};
 const rows=await q('select distinct on(metric) * from live_observations where observed_date<=$1 order by metric,observed_date desc,fetched_at desc',[date]);
 const events=await q('select * from live_articles where status=\'verified\' and event_date=$1 and published_at<=$2 order by published_at desc limit 120',[date,now.toISOString()]);
 const articles:Article[]=events.map(r=>({id:String(r.id),url:String(r.url),title:String(r.title),publisher:String(r.publisher),publishedAt:iso(r.published_at),eventDate:day(r.event_date),verifiedAt:iso(r.verified_at),evidenceHash:String(r.evidence_hash),symbols:r.symbols as string[],topics:r.topics as string[],excerpt:String(r.excerpt),summaryTemplate:str(r.summary_template),verification:String(r.verification)}));
 const checks=await q('select * from live_source_checks order by source_key');
 return {profileId,salesperson:String(p.full_name),clientId,clientName:clientId?h[0].client:'All my clients',businessDate:date,cutoff:now.toISOString(),coverageHash:hash(all),holdings:h,metrics:metricRows(rows,date),articles:matchArticles(articles,h,preferences),sources:checks.map(r=>({key:String(r.source_key),at:iso(r.checked_at),ok:Boolean(r.succeeded),accepted:Number(r.accepted),detail:String(r.detail)})),preferences,coverage:[...new Set(h.map(x=>x.symbol))].sort()};
 });
}
export async function publishReports(db:Db,now=new Date()):Promise<number>{
 const people=await db.asService(q=>q<{id:string}>('select id from profiles where is_active and role=\'sales\' and exists(select 1 from live_coverage c join live_clients l on l.id=c.client_id where c.profile_id=profiles.id and l.active)'));let count=0;
 for(const p of people){const coverage=await getCoverage(db,p.id);for(const clientId of [null,...coverage.clients.map(x=>x.id)]){const report=await makeReport(db,p.id,clientId,now);const fingerprint=hash({...report,cutoff:undefined});await db.asService(async q=>{const [active]=await q('select 1 from profiles where id=$1 and is_active',[p.id]);if(!active)throw new Error('PROFILE_UNAVAILABLE');await q('insert into live_reports(profile_id,scope_client,input_client_ids,business_date,cutoff,coverage_hash,fingerprint,payload) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict(profile_id,fingerprint) do nothing',[p.id,clientId,[...new Set(report.holdings.map(x=>x.clientId))],report.businessDate,report.cutoff,report.coverageHash,fingerprint,JSON.stringify(report)]);});count++;}}
 return count;
}
export async function getReport(db:Db,profileId:string,clientId:string|null,reportId?:string,now=new Date()):Promise<Report|null>{
 if(clientId&&!validId(clientId)||reportId&&!validId(reportId))return null;const c=await getCoverage(db,profileId);const prefs=await getPreferences(db,profileId);
 return db.asUser(profileId,async q=>{const rows=reportId?await q('select id,payload from live_reports where id=$1 and profile_id=$2',[reportId,profileId]):await q('select id,payload from live_reports where profile_id=$1 and scope_client is not distinct from $2::uuid and business_date=$3 and coverage_hash=$4 order by created_at desc limit 1',[profileId,clientId,businessDate(now),c.hash]);const r=rows[0];if(!r)return null;const payload=r.payload as Omit<Report,'id'>;if(payload.coverageHash!==c.hash||hash(payload.preferences)!==hash(prefs)||payload.clientId!==clientId)return null;return {...payload,id:String(r.id)};});
}
export {parseFilters,filterStories,formatMetric,metricChange} from './presentation';
