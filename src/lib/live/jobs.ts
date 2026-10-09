import { randomUUID } from 'node:crypto';
import type { Db,Q } from '../db/types';
import { businessDate } from './time';
import { collectMarket,MARKET_SOURCES,type SourceResult } from './market';
import { collectNews,type NewsResult } from './news';
import { hash,publishReports } from './reports';
import { sendMorningBrief } from './email';
export type Job={id:string;kind:'market'|'news'|'publish';payload:Record<string,unknown>;lease_token:string;attempts:number};
export async function enqueue(q:Q,kind:Job['kind'],key:string,payload:Record<string,unknown>={}){
 await q('insert into live_jobs(kind,job_key,payload) values($1,$2,$3::jsonb) on conflict(job_key) do nothing',[kind,key,JSON.stringify(payload)]);
}
export async function reconcile(db:Db,now=new Date()){
 const date=businessDate(now),slot=Math.floor(now.getTime()/300000);const configured=Number(process.env.NEWS_REFRESH_MINUTES||30);const interval=Math.max(15,Math.min(120,Number.isFinite(configured)?configured:30));const newsSlot=slot;const discoverySlot=Math.floor(now.getTime()/(interval*60000));
 await db.asService(async q=>{await q('update live_jobs set status=\'failed\',error_code=\'RETRY_EXHAUSTED\',finished_at=now() where attempts>=3 and (status=\'queued\' or (status=\'running\' and lease_until<now()))');
 for(const source of MARKET_SOURCES)await enqueue(q,'market',date+':market:'+source+':'+slot,{source,date});
 const universe=await q<{symbol:string}>('select distinct h.symbol from live_holdings h join live_accounts a on a.id=h.account_id join live_clients c on c.id=a.client_id where h.active and a.active and c.active order by h.symbol');
 if(universe.length)await enqueue(q,'news',date+':news:v4:'+newsSlot+':'+hash(universe.map(x=>x.symbol)).slice(0,16),{symbols:universe.map(x=>x.symbol),date,discovery:slot%Math.round(interval/5)===0,discoverySlot});
 // Coalesce unstarted older slots. Current slot reconciles all sources rather than replaying stale market fetches.
 await q('update live_jobs set status=\'done\',finished_at=now(),error_code=\'SUPERSEDED\' where status=\'queued\' and created_at<now()-interval \'40 minutes\' and kind in(\'market\',\'news\')');
 });
}
export async function claim(db:Db,kinds:Job['kind'][]=['market','news','publish']):Promise<Job|null>{return db.asService(async q=>{const token=randomUUID();const rows=await q<Job>('update live_jobs set status=\'running\',attempts=attempts+1,lease_token=$1,lease_until=now()+interval \'240 seconds\' where id=(select id from live_jobs where kind=any($2::text[]) and attempts<3 and ((status=\'queued\' and available_at<=now()) or (status=\'running\' and lease_until<now())) order by case kind when \'market\' then 0 when \'news\' then 1 else 2 end,created_at for update skip locked limit 1) returning id,kind,payload,lease_token,attempts',[token,kinds]);return rows[0]??null;});}
export async function commitJob(db:Db,job:Job,work:(q:Q)=>Promise<void>):Promise<boolean>{return db.asService(async q=>{const lock=await q('select 1 from live_jobs where id=$1 and status=\'running\' and lease_token=$2 and lease_until>now() for update',[job.id,job.lease_token]);if(!lock.length)return false;await work(q);await q('update live_jobs set status=\'done\',lease_until=null,lease_token=null,finished_at=now(),error_code=null where id=$1 and lease_token=$2',[job.id,job.lease_token]);return true;});}
export async function failJob(db:Db,job:Job,code:string){await db.asService(q=>q('update live_jobs set status=case when attempts>=3 then \'failed\' else \'queued\' end,available_at=now()+($3*interval \'30 seconds\'),lease_until=null,lease_token=null,error_code=$4,finished_at=case when attempts>=3 then now() else null end where id=$1 and status=\'running\' and lease_token=$2',[job.id,job.lease_token,2**job.attempts,code]));}
async function sourceCheck(q:Q,key:string,ok:boolean,accepted:number,detail:string){await q('insert into live_source_checks(source_key,checked_at,succeeded,accepted,detail) values($1,now(),$2,$3,$4) on conflict(source_key) do update set checked_at=excluded.checked_at,succeeded=excluded.succeeded,accepted=excluded.accepted,detail=excluded.detail',[key,ok,accepted,detail]);}
async function saveMarket(q:Q,result:SourceResult){for(const o of result.observations)await q('insert into live_observations(metric,value,previous,unit,observed_date,observed_at,source,source_url,cadence) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(metric,observed_date,source) do update set value=excluded.value,previous=excluded.previous,observed_at=excluded.observed_at,fetched_at=now(),source_url=excluded.source_url',[o.metric,o.value,o.previous,o.unit,o.date,o.at,o.source,o.url,o.cadence]);await sourceCheck(q,'market:'+result.key,result.ok,result.accepted,result.detail);}
async function saveNews(q:Q,result:NewsResult){for(const a of result.articles)await q('insert into live_articles(id,url,title,publisher,published_at,event_date,verified_at,symbols,topics,excerpt,summary_template,evidence_hash,verification) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict(url) do update set title=excluded.title,published_at=excluded.published_at,event_date=excluded.event_date,verified_at=excluded.verified_at,symbols=excluded.symbols,topics=excluded.topics,excerpt=excluded.excerpt,summary_template=excluded.summary_template,evidence_hash=excluded.evidence_hash,verification=excluded.verification,status=\'verified\'',[a.id,a.url,a.title,a.publisher,a.publishedAt,a.eventDate,a.verifiedAt,a.symbols,a.topics,a.excerpt,a.summaryTemplate,a.evidenceHash,a.verification]);await sourceCheck(q,'news',result.ok,result.articles.length,result.detail);}
export async function reserveModelCall(db:Db,date:string):Promise<boolean>{if(!process.env.OPENAI_API_KEY)return false;const raw=Number(process.env.NEWS_DAILY_CALL_LIMIT||48);const cap=Math.max(1,Math.min(96,Number.isFinite(raw)?raw:48));return db.asService(async q=>{const rows=await q('insert into live_model_budget(day,calls) values($1,1) on conflict(day) do update set calls=live_model_budget.calls+1 where live_model_budget.calls<$2 returning calls',[date,cap]);return rows.length>0;});}
export async function runJob(db:Db,job:Job,signal:AbortSignal,now=new Date(),discovery=true){
 if(String(job.payload.date)!==businessDate(now)){await commitJob(db,job,async()=>{});return;}
 if(job.kind==='market'){const result=await collectMarket(String(job.payload.source),signal,now);await commitJob(db,job,q=>saveMarket(q,result));}
 else if(job.kind==='news'){
 const useAI=discovery&&job.payload.discovery!==false?()=>reserveModelCall(db,businessDate(now)):false;
 try{const symbols=Array.isArray(job.payload.symbols)?job.payload.symbols.filter((s):s is string=>typeof s==='string'&&/^[A-Z0-9.\-]{1,15}$/.test(s)).slice(0,40):[];const result=await collectNews(symbols,signal,now,useAI);await commitJob(db,job,q=>saveNews(q,result));}catch{await db.asService(q=>sourceCheck(q,'news',false,0,signal.aborted?'DISCOVERY_TIMEOUT':'DISCOVERY_UNAVAILABLE'));throw new Error('DISCOVERY_UNAVAILABLE');}
 }else {await publishReports(db,now);await commitJob(db,job,async()=>{});}
}
export async function refresh(db:Db,opts:{budgetMs?:number;reconcile?:boolean;kinds?:Job['kind'][];discovery?:boolean}={}){
 const deadline=Date.now()+(opts.budgetMs??170000);if(opts.reconcile!==false)await reconcile(db);let completed=0,failed=0;
 // Market source requests run in small batches; a news discovery is shared across the entire book.
 for(let round=0;round<5&&deadline-Date.now()>15000;round++){
 const jobs:Job[]=[];for(let i=0;i<3;i++){const job=await claim(db,opts.kinds);if(!job)break;jobs.push(job);if(job.kind==='news')break;}if(!jobs.length)break;
 await Promise.all(jobs.map(async job=>{try{await runJob(db,job,AbortSignal.timeout(Math.max(1000,Math.min(job.kind==='news'?100000:12000,deadline-Date.now()-8000))),new Date(),opts.discovery!==false);completed++;}catch{await failJob(db,job,'SOURCE_OR_EXECUTION_FAILED');failed++;}}));
 }
 // Publication reads persisted verified evidence; source failures cannot replace it with invented values.
 if(deadline-Date.now()>3000)await publishReports(db);
 // Email the finished brief once it is due (default 09:30 ET on weekdays); idempotent per recipient and day.
 if(deadline-Date.now()>25000)await sendMorningBrief(db).catch(()=>console.warn('[email] brief_send_failed'));
 return {completed,failed};
}
