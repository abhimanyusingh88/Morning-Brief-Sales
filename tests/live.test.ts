import { effectHoldings,effectsContext,renderEffects,getEffectsAnalysis,effectsCacheKey } from '../src/lib/live/effects-ai';
import { holdingEffects } from '../src/lib/live/effects';
import { extractArticleText,fullTextAuthorized,readerFacts,renderSummary,getReadingBrief } from '../src/lib/live/article-reader';
import { beforeAll,describe,expect,it } from 'vitest';
import { zipSync,strToU8 } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { NextRequest } from 'next/server';
import { createHash,createHmac } from 'node:crypto';
import { openPglite } from '../src/lib/db/pglite';
import { DB_VERSION } from '../src/lib/db';
import { uid } from '../src/lib/util/id';
import { signSession } from '../src/lib/auth/session';
import { parseWorkbook,importBook } from '../src/lib/live/import';
import { parseTreasury,parseVix,parseYahoo } from '../src/lib/live/market';
import { publicAddress,robotsAllows,sourceUrl } from '../src/lib/live/fetch';
import { parsePublisherFeed } from '../src/lib/live/feeds';
import { answerFromReport,assistantContext,renderGroundedAnswer,fallbackAnswer } from '../src/lib/live/assistant';
import { classify,verifyDocument,discoveryUrls } from '../src/lib/live/news';
import { businessDate } from '../src/lib/live/time';
import { getCoverage,getReport,makeReport,publishReports } from '../src/lib/live/reports';
import { filterStories,metricChange,parseFilters,sameNewsEvent } from '../src/lib/live/presentation';
import { enqueue,claim,commitJob,failJob } from '../src/lib/live/jobs';
import { verifyDelivery } from '../src/lib/live/delivery';
import { renderPdf } from '../src/lib/live/pdf';
import { proxy } from '../src/proxy';
import type { Db } from '../src/lib/db/types';
let db:Db;const a=uid('live:sales-1'),b=uid('live:sales-2');
const headers=['Investment Manager','Account','Client Fund','Direction','Ticker','Quantity','Current Market Value','Initial Market Value','Spread','Margin'];
const rows=[headers,['X Capital Management','XC123','X Capital 2X NVDA Fund','Long','NVDA',100000,500000,200000,2,45],['X Capital Management','XC456','X Capital 2X TSLA Fund','Short','TSLA',200000,100000000,400000,-4,45],['Y Shares','YC123','Y Shares 2X INTC Fund','Long','INTC',300000,500000,400000,5,45],['Y Shares','YC456','Y Shares 2X MRVL Fund','Long','MRVL',400000,500000,400000,6,45],['Z Investments','ZC123','Z Investments 2X AMZN Fund','Long','AMZN',100000,500000,400000,8,45]];
function book(input:(string|number)[][]=rows){return zipSync({'xl/workbook.xml':strToU8('<workbook><sheets><sheet name="Sheet1" r:id="rId1"/></sheets></workbook>'),'xl/_rels/workbook.xml.rels':strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),'xl/worksheets/sheet1.xml':strToU8('<worksheet><sheetData>'+input.map((r,i)=>'<row r="'+(i+1)+'">'+r.map((v,j)=>'<c r="'+String.fromCharCode(65+j)+(i+1)+'" t="inlineStr"><is><t>'+v+'</t></is></c>').join('')+'</row>').join('')+'</sheetData></worksheet>')});}
beforeAll(async()=>{db=(await openPglite()).db;await importBook(db,parseWorkbook(book()),'Sample Data.xlsx');await db.asService(async q=>{await q("update live_holdings set active=false where import_id=(select id from live_imports where file_hash='demo-book-v1')");await q("update live_clients set active=false where id in(select client_id from live_accounts where import_id=(select id from live_imports where file_hash='demo-book-v1'))");});Object.assign(globalThis,{__mbDb:Promise.resolve(db),__mbDbVersion:DB_VERSION});});
describe('faithful workbook and private coverage',()=>{
 it('preserves anomalous supplied values and rejects ownership conflicts',()=>{const d=parseWorkbook(book());expect(d.rows[1].currentValue).toBe('100000000');expect(d.rows[1].spread).toBe('-4');expect(d.issues.some(i=>i.row===3)).toBe(true);const bad=rows.map(r=>[...r]);bad[3][1]='XC123';expect(()=>parseWorkbook(book(bad))).toThrow('ownership');});
 it('imports idempotently with two people, three clients and scoped holdings',async()=>{await importBook(db,parseWorkbook(book()),'Sample Data.xlsx');const totals=await db.asService(q=>q<{n:number}>('select count(*)::int n from live_holdings where active'));expect(totals[0].n).toBe(5);const one=await getCoverage(db,a),two=await getCoverage(db,b);expect(one.clients.map(c=>c.name)).toEqual(['X Capital Management','Z Investments']);expect(two.holdings.map(h=>h.symbol)).toEqual(['INTC','MRVL']);expect(one.holdings.some(h=>h.symbol==='INTC')).toBe(false);});
 it('archives removed holdings and preserves reassigned coverage on reimport',async()=>{const client=uid('live:client:Z Investments');await db.asService(async q=>{await q('delete from live_coverage where client_id=$1',[client]);await q('insert into live_coverage values($1,$2)',[b,client]);});await importBook(db,parseWorkbook(book(rows.slice(0,5))),'changed.xlsx');expect((await getCoverage(db,a)).holdings).toHaveLength(2);await importBook(db,parseWorkbook(book()),'Sample Data.xlsx');expect((await getCoverage(db,b)).clients.some(c=>c.name==='Z Investments')).toBe(true);await db.asService(async q=>{await q('delete from live_coverage where client_id=$1',[client]);await q('insert into live_coverage values($1,$2)',[a,client]);});});
});
describe('source admission',()=>{
 it('uses Eastern Time across midnight and daylight-saving boundaries',()=>{expect(businessDate(new Date('2026-10-09T02:00:00Z'))).toBe('2026-10-08');expect(businessDate(new Date('2026-11-01T05:30:00Z'))).toBe('2026-11-01');});
 it('rejects unsafe URLs and private network addresses',()=>{for(const u of ['http://finance.yahoo.com/a','https://localhost/a','https://finance.yahoo.com:444/a','https://finance.yahoo.com.evil.test/a','https://user:pass@finance.yahoo.com/a'])expect(()=>sourceUrl(u)).toThrow();for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1'])expect(publicAddress(ip)).toBe(false);expect(publicAddress('8.8.8.8')).toBe(true);});
 it('respects robots paths and specific agent rules',()=>{expect(robotsAllows('User-agent: *\nDisallow: /quote/','/quote/ABC/')).toBe(false);expect(robotsAllows('User-agent: *\nDisallow: /\nAllow: /news/','/news/a')).toBe(true);expect(robotsAllows('User-agent: MorningBrief\nDisallow: /\nUser-agent: *\nAllow: /','/x')).toBe(false);});
 it('parses original official records without mistaking fetch time for observation time',()=>{const xml='<feed><entry><content><m:properties><d:NEW_DATE m:type="Edm.DateTime">2026-10-08T00:00:00</d:NEW_DATE><d:BC_2YEAR m:type="Edm.Double">3.71</d:BC_2YEAR><d:BC_10YEAR m:type="Edm.Double">4.04</d:BC_10YEAR></m:properties></content></entry></feed>';expect(parseTreasury(xml,'2026')[1].value).toBe(4.04);expect(parseVix('DATE,OPEN,HIGH,LOW,CLOSE\n10/08/2026,10,12,9,11')[0].date).toBe('2026-10-08');});
 it('isolates the exact quote record and rejects conflicting records',()=>{const quote={symbol:'^GSPC',regularMarketPrice:{raw:6000},regularMarketPreviousClose:{raw:5990},regularMarketTime:{raw:1791550800}};const html='<script type="application/json">'+JSON.stringify([{symbol:'OTHER',regularMarketPrice:999999},quote])+'</script>';expect(parseYahoo(html,'SPX','https://finance.yahoo.com/quote/%5EGSPC/')[0].value).toBe(6000);expect(parseYahoo('<script>'+JSON.stringify([{...quote,regularMarketPrice:5900,regularMarketTime:{raw:1791464400}},quote])+'</script>','SPX','https://finance.yahoo.com/quote/%5EGSPC/')[0].value).toBe(6000);expect(parseYahoo('<script>'+JSON.stringify([{...quote,regularMarketPrice:2794.128},{...quote,regularMarketPrice:2794.1282}])+'</script>','SPX','https://finance.yahoo.com/quote/%5EGSPC/')[0].value).toBeCloseTo(2794.128,3);expect(()=>parseYahoo('<script>'+JSON.stringify([quote,{...quote,regularMarketPrice:1}])+'</script>','SPX','https://finance.yahoo.com/quote/%5EGSPC/')).toThrow('CONFLICT');});
 it('rejects republication, future publication and undated events',()=>{const now=new Date('2026-10-09T18:00:00Z');const doc=(date:string,desc='NVIDIA announces a new chip today.')=>'<html><meta property="og:title" content="NVIDIA announces chip launch"><meta property="article:published_time" content="'+date+'"><meta name="description" content="'+desc+'"><h1>NVIDIA announces chip launch</h1></html>';const url='https://newsroom.nvidia.com/news/chip-launch';expect(verifyDocument(doc('2026-10-09T14:00:00Z'),url,['NVDA'],now)?.symbols).toEqual(['NVDA']);expect(verifyDocument(doc('2026-10-08T14:00:00Z'),url,['NVDA'],now)).toBeNull();expect(verifyDocument(doc('2026-10-09T20:00:00Z'),url,['NVDA'],now)).toBeNull();expect(verifyDocument(doc(''),url,['NVDA'],now)).toBeNull();expect(verifyDocument(doc('2026-10-09T14:00:00Z','NVIDIA said last year that demand was strong.'),'https://www.reuters.com/technology/report',['NVDA'],now)).toBeNull();expect(classify('Oil supply disruption and war',['NVDA']).topics).toContain('Geopolitics');});
 it('uses bp for yields and index moves without reversing price relevance',()=>{const m={value:4.1,previous:4.0,unit:'yield'};expect(metricChange(m as never)?.label).toBe('+10.0bp');expect(metricChange({...m,value:110,previous:100,unit:'index'} as never)?.label).toBe('+1000.0bp');});
});
describe('fresh publisher news and source extraction',()=>{
 const now=new Date('2026-10-09T18:00:00Z');
 const item=(date:string,url='https://www.cnbc.com/2026/10/09/nvidia-ai.html',title='NVIDIA introduces AI chips')=>'<item><title>'+title+'</title><description>NVIDIA expands AI chip availability.</description><link>'+url+'</link><pubDate>'+date+'</pubDate></item>';
 const feed=(items:string)=>'<rss><channel><title>US Top News</title><link>https://www.cnbc.com/us-top-news-and-analysis/</link><description>CNBC news</description>'+items+'</channel></rss>';
 it('uses original publisher identity rather than assuming the feed title contains its brand',()=>{const a=parsePublisherFeed(feed(item('Fri, 09 Oct 2026 12:00:00 GMT')),['NVDA'],now);expect(a).toHaveLength(1);expect(a[0].symbols).toEqual(['NVDA']);expect(a[0].publishedAt).toBe('2026-10-09T12:00:00.000Z');});
 it('excludes old stories, future dates, unrelated awards and publication dates changed on old URLs',()=>{expect(parsePublisherFeed(feed(item('Thu, 08 Oct 2026 12:00:00 GMT')+item('Fri, 09 Oct 2026 20:00:00 GMT')+item('Fri, 09 Oct 2026 12:00:00 GMT','https://www.cnbc.com/2026/10/08/old.html')+item('Fri, 09 Oct 2026 12:00:00 GMT',undefined,'Nobel prize awarded for war crimes work')),['NVDA'],now)).toHaveLength(0);});
 it('rejects external article destinations masquerading as a publisher feed',()=>{expect(parsePublisherFeed(feed(item('Fri, 09 Oct 2026 12:00:00 GMT','https://www.reuters.com/technology/other')),['NVDA'],now)).toHaveLength(0);});
 it('uses tool-provided source URLs even without a model-written JSON answer',()=>{expect(discoveryUrls([{type:'web_search_call',action:{type:'search',sources:[{url:'https://www.cnbc.com/2026/10/09/nvidia.html'},{url:'https://evil.test/fake'},{url:'https://www.cnbc.com/'}]}}])).toEqual(['https://www.cnbc.com/2026/10/09/nvidia.html']);});
});
describe('durable jobs',()=>{
 it('deduplicates scheduling and only allows the active lease owner to commit',async()=>{await db.asService(async q=>{await enqueue(q,'market','test-one',{source:'vix'});await enqueue(q,'market','test-one',{source:'vix'});});const first=await claim(db);expect(first).not.toBeNull();expect(await claim(db)).toBeNull();expect(await commitJob(db,{...first!,lease_token:uid('wrong')},async()=>{throw new Error('must never run');})).toBe(false);expect(await commitJob(db,first!,async()=>{})).toBe(true);});
 it('recovers expired leases and rejects stale commits after reclaim',async()=>{await db.asService(q=>enqueue(q,'market','test-two'));const first=(await claim(db))!;await db.asService(q=>q('update live_jobs set lease_until=now()-interval \'1 second\' where id=$1',[first.id]));const second=(await claim(db))!;expect(second.lease_token).not.toBe(first.lease_token);expect(await commitJob(db,first,async()=>{})).toBe(false);await failJob(db,second,'TEST_FAILURE');const [r]=await db.asService(q=>q('select status,available_at>now() backed_off from live_jobs where id=$1',[first.id]));expect(r.status).toBe('queued');expect(r.backed_off).toBe(true);await db.asService(q=>q('update live_jobs set status=\'done\' where id=$1',[first.id]));});
});
describe('analyst threads',()=>{
 it('keeps each conversation separate and private to its owner',async()=>{
  const {ensureThread,threadHistory,listThreads,getThreadMessages,deleteThread}=await import('../src/lib/live/threads');
  const report=await makeReport(db,a,null);const [r]=await db.asService(q=>q('insert into live_reports(profile_id,input_client_ids,business_date,cutoff,coverage_hash,fingerprint,payload) values($1,$2,$3,now(),$4,$5,$6::jsonb) returning id',[a,[],report.businessDate,report.coverageHash,'thread-test',JSON.stringify(report)]));
  const one=(await ensureThread(db,a,null,'First question about NVDA'))!,two=(await ensureThread(db,a,null,'Second question about oil'))!;
  await db.asUser(a,q=>q('insert into live_assistant_messages(profile_id,report_id,question,answer,source_ids,method,thread_id) values($1,$2,$3,$4,$5,$6,$7)',[a,r.id,'First question about NVDA','Answer one',[],'facts',one]));
  expect((await threadHistory(db,a,one)).map(m=>m.content)).toEqual(['First question about NVDA','Answer one']);
  expect(await threadHistory(db,a,two)).toEqual([]);
  expect((await listThreads(db,a)).map(t=>t.title)).toEqual(expect.arrayContaining(['First question about NVDA','Second question about oil']));
  expect(await getThreadMessages(db,b,one)).toBeNull();expect(await ensureThread(db,b,one,'x')).toBeNull();expect(await deleteThread(db,b,one)).toBe(false);
  const {GET}=await import('../src/app/api/live/threads/[id]/route');const res=await GET(new Request('http://localhost/x',{headers:{cookie:'mb_session='+signSession(b)}}),{params:Promise.resolve({id:one})});expect(res.status).toBe(404);
  expect(await deleteThread(db,a,one)).toBe(true);expect(await getThreadMessages(db,a,one)).toBeNull();
 });
});
describe('report and export security',()=>{
 it('does not label a prior-day market observation as current-day data',async()=>{await db.asService(q=>q('insert into live_observations(metric,value,unit,observed_date,source,source_url,cadence) values(\'VIX\',11,\'level\',\'2026-10-08\',\'Cboe\',\'https://cdn-api.cboe.com/vix.csv\',\'daily\')'));const r=await makeReport(db,a,null,new Date('2026-10-09T18:00:00Z'));const v=r.metrics.find(x=>x.key==='VIX');expect(v?.value).toBe(11);expect(v?.observedDate).toBe('2026-10-08');expect(v?.note).toContain('Latest daily observation');});
 it('publishes scoped versions and renders a genuine PDF without any model calls',async()=>{await publishReports(db);const r=await getReport(db,a,null);expect(r?.holdings).toHaveLength(3);expect(await getReport(db,b,null,r!.id)).toBeNull();const bytes=await renderPdf(r!,{q:'',topic:'',symbol:''});expect(Buffer.from(bytes).subarray(0,5).toString()).toBe('%PDF-');const doc=await PDFDocument.load(bytes);expect(doc.getPageCount()).toBeGreaterThan(0);expect(doc.getTitle()).toContain('All my clients');const {GET}=await import('../src/app/api/live/export/route');const res=await GET(new Request('http://localhost/api/live/export?report='+r!.id,{headers:{cookie:'mb_session='+signSession(a)}}));expect(res.status).toBe(200);expect(res.headers.get('content-type')).toBe('application/pdf');});
 it('revokes old reports after a client assignment changes',async()=>{const r=(await getReport(db,a,null))!;const client=uid('live:client:Z Investments');await db.asService(q=>q('delete from live_coverage where profile_id=$1 and client_id=$2',[a,client]));expect(await getReport(db,a,null,r.id)).toBeNull();await db.asService(q=>q('insert into live_coverage values($1,$2)',[a,client]));});
 it('applies the same stock, topic and search filters for screen and export',()=>{const r={articles:[{title:'NVIDIA launch',excerpt:'Chip launch',publisher:'issuer',topics:['Launches'],symbols:['NVDA'],matches:[]},{title:'Oil disruption',excerpt:'Current supply',publisher:'gov',topics:['Oil'],symbols:[],matches:[{symbol:'TSLA'}]}]};const f=parseFilters(new URLSearchParams('topic=Launches&symbol=NVDA&q=nvidia'));expect(filterStories(r as never,f)).toHaveLength(1);expect(filterStories(r as never,{q:'',topic:'Oil',symbol:'TSLA'})).toHaveLength(1);});
 it('rejects anonymous export and scheduled delivery before doing work',async()=>{const {GET}=await import('../src/app/api/live/export/route');expect((await GET(new Request('http://localhost/api/live/export'))).status).toBe(400);const {POST}=await import('../src/app/api/live/work/route');expect((await POST(new Request('https://demo.example/api/live/work',{method:'POST',body:'{}'}))).status).toBe(401);});
 it('retired routes cannot start old synthetic work',()=>{expect(proxy(new NextRequest('https://demo.example/api/pipeline/run')).status).toBe(410);expect(proxy(new NextRequest('https://demo.example/api/chat')).status).toBe(410);expect(proxy(new NextRequest('https://demo.example/api/live/work')).headers.get('x-middleware-next')).toBe('1');});
 it('verifies the delivery URL, body hash and signature',async()=>{const old={url:process.env.APP_URL,current:process.env.QSTASH_CURRENT_SIGNING_KEY,next:process.env.QSTASH_NEXT_SIGNING_KEY};process.env.APP_URL='https://demo.example';process.env.QSTASH_CURRENT_SIGNING_KEY='test-current-signing-key-long-enough';process.env.QSTASH_NEXT_SIGNING_KEY='test-next-signing-key-long-enough';try{const body='{}',now=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),payload=Buffer.from(JSON.stringify({iss:'Upstash',sub:'https://demo.example/api/live/work',iat:now,nbf:now-1,exp:now+60,body:createHash('sha256').update(body).digest('base64url')})).toString('base64url'),data=head+'.'+payload,sig=data+'.'+createHmac('sha256',process.env.QSTASH_CURRENT_SIGNING_KEY!).update(data).digest('base64url');const request=new Request('https://demo.example/api/live/work',{method:'POST',headers:{'Upstash-Signature':sig},body});expect(await verifyDelivery(request,body)).toBe(true);expect(await verifyDelivery(request,'{"changed":true}')).toBe(false);}finally{for(const [key,value] of Object.entries({APP_URL:old.url,QSTASH_CURRENT_SIGNING_KEY:old.current,QSTASH_NEXT_SIGNING_KEY:old.next}))if(value===undefined)delete process.env[key];else process.env[key]=value;}});
});

describe('private briefing assistant',()=>{
 it('groups similar event coverage and keeps the additional source evidence',()=>{const first={id:'a',title:'Pilot killed in Houthi attacks on Riyadh airport',category:'macro',excerpt:'Oil risk',publisher:'CNBC',topics:['Geopolitics'],symbols:[],matches:[],reason:'Market-wide'};const second={...first,id:'b',title:'Saudi nationals killed in Houthi attacks on Riyadh airport',publisher:'BBC'};expect(sameNewsEvent(first as never,second as never)).toBe(true);const grouped=filterStories({articles:[first,second]} as never,{q:'',topic:'',symbol:''});expect(grouped).toHaveLength(1);expect(grouped[0].relatedSources?.[0].id).toBe('b');expect('relatedSources' in first).toBe(false);});
 it('provides evidence-based suggestions and refuses foreign position lookups without AI',async()=>{const r=(await getReport(db,a,null))!;const f={q:'',topic:'',symbol:''};expect(fallbackAnswer(r,f,'Suggest discussion points').answer).toContain('Relevant evidence');expect(fallbackAnswer(r,f,'Suggest discussion points').answer).not.toContain('## Positions in focus');expect(fallbackAnswer(r,f,'Suggest discussion points').method).toBe('facts');const outside=answerFromReport(r,f,'Show INTC holdings');expect(outside?.answer).toContain('not held');expect(outside?.answer).not.toContain('100000000');});

 it('returns imported positions from the current report without inference or model calls',async()=>{const r=(await getReport(db,a,null))!;const answer=answerFromReport(r,{q:'',topic:'',symbol:''},'Show TSLA holdings');expect(answer?.method).toBe('facts');expect(answer?.answer).toContain('100,000,000');expect(answer?.answer).toContain('Short');expect(answer?.answer).not.toContain('Y Shares');});
 it('rejects invented numbers, unknown facts and unsupplied citations',async()=>{const r=(await getReport(db,a,null))!;const c=assistantContext(r,{q:'',topic:'',symbol:''},'Explain the book');expect(renderGroundedAnswer('The holding is {{holding.0.quantity}}.',[],c.facts,[])).not.toBeNull();expect(renderGroundedAnswer('The price will rise by 10%.',[],c.facts,[])).toBeNull();expect(renderGroundedAnswer('Value {{made.up}}',[],c.facts,[])).toBeNull();expect(renderGroundedAnswer('General discussion', ['invented'],c.facts,[])).toBeNull();});
 it('keeps client lookups inside the signed-in salesperson scope',async()=>{const {GET}=await import('../src/app/api/search/route');const req=(id:string,name:string)=>GET(new Request('http://localhost/api/search?q='+encodeURIComponent(name),{headers:{cookie:'mb_session='+signSession(id)}}));expect((await (await req(a,'X Capital')).json()).hits.some((h:{kind:string})=>h.kind==='client')).toBe(true);expect((await (await req(b,'X Capital')).json()).hits.some((h:{kind:string})=>h.kind==='client')).toBe(false);});
 it('requires authentication, rejects foreign report versions and answers scoped shortcuts',async()=>{const {POST}=await import('../src/app/api/live/chat/route');const r=(await getReport(db,a,null))!;const body={report:r.id,client:null,question:'Show client holdings',filters:{q:'',topic:'',symbol:''}};const req=(id:string|null,value:unknown)=>POST(new Request('http://localhost/api/live/chat',{method:'POST',headers:{'content-type':'application/json',...(id?{cookie:'mb_session='+signSession(id)}:{})},body:JSON.stringify(value)}));expect((await req(b,body)).status).toBe(409);const ok=await req(a,body);expect(ok.status).toBe(200);expect((await ok.json()).answer).not.toContain('Y Shares');expect((await req(a,{...body,question:'x'.repeat(1201)})).status).toBe(400);const fallback=await req(a,{...body,question:'Suggest questions to discuss with a trader'});expect(fallback.status).toBe(200);expect((await fallback.json()).answer).toContain('Confirm tradable prices');});
});

describe('in-dashboard article reading and summaries',()=>{
 const source={id:uid('reader-source'),url:'https://www.cnbc.com/2026/10/09/nvidia-reader.html',title:'NVIDIA announces chip launch',excerpt:'NVIDIA announces an updated chip platform.',publisher:'CNBC',publishedAt:'2026-10-09T12:00:00.000Z',verifiedAt:'2026-10-09T12:00:00.000Z',eventDate:'2026-10-09',symbols:['NVDA'],topics:['AI','Launches'],evidenceHash:'reader-evidence',summaryTemplate:null,verification:'Fixture publisher evidence'};
 it('does not silently truncate long article bodies or trust scripts as markup',()=>{
  const paragraphs=Array.from({length:40},(_,i)=>'Source paragraph '+i+' contains material reporting and context that must remain available to the reader.');
  const html='<script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',articleBody:paragraphs.join(' ')})+'</script>';
  expect(extractArticleText(html)).toContain(paragraphs[39]);
  expect(extractArticleText('<main><p>Brief statement.</p><p>A longer context paragraph.</p><script>steal()</script></main>')).toBe('Brief statement.\n\nA longer context paragraph.');
 });
 it('requires exact explicit redistribution hosts and safely renders fact-backed bullet points',()=>{
  expect(fullTextAuthorized(source.url,'www.cnbc.com')).toBe(true);
  expect(fullTextAuthorized('https://www.cnbc.com.evil.test/a','www.cnbc.com')).toBe(false);
  expect(fullTextAuthorized(source.url,'')).toBe(false);
  const {facts,source:text}=readerFacts(source,'Revenue was $20 billion and two products launched.');
  expect(text).not.toContain('$20');
  expect(renderSummary([{label:'Reported revenue',text_template:'Revenue was {{source.0}}.'}],facts)?.[0].text).toBe('Revenue was $20 billion.');
  expect(renderSummary([{label:'Price prediction',text_template:'Shares will rise 10%.'}],facts)).toBeNull();
  expect(renderSummary([{label:'Unknown',text_template:'Value {{made.up}}.'}],facts)).toBeNull();
 });
 it('keeps excerpts honest and caches summaries without any network or model calls',async()=>{
  await db.asService(q=>q("insert into live_articles(id,url,title,publisher,published_at,event_date,verified_at,symbols,topics,excerpt,evidence_hash,verification) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[source.id,source.url,source.title,source.publisher,source.publishedAt,source.eventDate,source.verifiedAt,source.symbols,source.topics,source.excerpt,source.evidenceHash,source.verification]));
  const old=process.env.NEWS_FULL_TEXT_HOSTS;delete process.env.NEWS_FULL_TEXT_HOSTS;
  try{
   const brief=await getReadingBrief(db,source);expect(brief?.basis).toBe('excerpt');expect(brief?.summaryPoints).toBeUndefined();
   const summary=await getReadingBrief(db,source,true);expect(summary?.summaryStatus).toBe('limited');expect(summary?.summaryPoints?.[0].text).toBe(source.excerpt);
   expect(await getReadingBrief(db,source,true)).toEqual(summary);
  }finally{if(old===undefined)delete process.env.NEWS_FULL_TEXT_HOSTS;else process.env.NEWS_FULL_TEXT_HOSTS=old;}
 });
 it('requires login and report membership before returning article content',async()=>{
  await publishReports(db,new Date('2026-10-09T18:00:00Z'));
  const r=(await getReport(db,a,null,undefined,new Date('2026-10-09T18:00:00Z')))!;
  const {POST}=await import('../src/app/api/live/news-detail/route');
  const body={report:r.id,client:null,article:source.id,summarize:true};
  const req=(id:string|null,value:unknown)=>POST(new Request('http://localhost/api/live/news-detail',{method:'POST',headers:{'content-type':'application/json',...(id?{cookie:'mb_session='+signSession(id)}:{})},body:JSON.stringify(value)}));
  // No sign-in: requests without a session act as the demo desk profile (see tests/no-login.test.ts).
  expect((await req(b,body)).status).toBe(404);
  expect((await req(a,{...body,article:uid('missing-article')})).status).toBe(404);
  expect((await req(a,{...body,summarize:'yes'})).status).toBe(400);
  const allowed=await req(a,body);expect(allowed.status).toBe(200);expect(allowed.headers.get('cache-control')).toBe('private, no-store');expect((await allowed.json()).summaryPoints).toHaveLength(1);
 });
 it('does not leak formerly authorized original text after host access is removed',async()=>{
  await db.asService(q=>q('update live_article_readers set payload=$3::jsonb where article_id=$1 and evidence_hash=$2',[source.id,source.evidenceHash,JSON.stringify({basis:'full',sections:[{heading:'Original',body:'Formerly authorized complete original text.'}],sourceUrl:source.url,fetchedAt:source.verifiedAt})]));
  const old=process.env.NEWS_FULL_TEXT_HOSTS;delete process.env.NEWS_FULL_TEXT_HOSTS;
  try{const r=await getReadingBrief(db,source);expect(r?.basis).toBe('excerpt');expect(JSON.stringify(r)).not.toContain('Formerly authorized');}finally{if(old===undefined)delete process.env.NEWS_FULL_TEXT_HOSTS;else process.env.NEWS_FULL_TEXT_HOSTS=old;}
 });
});

describe('news effects follow the filtered client book',()=>{
 it('identifies relevant holding channels without repeated price-direction boilerplate',()=>{
  const story={title:'Oil supply disruption',excerpt:'Reported supply disruption',symbols:[],topics:['Oil','Geopolitics'],matches:[{clientId:'client-x',client:'X Capital',symbol:'TSLA',direction:'Short',reason:'Possible broad market exposure'},{clientId:'client-z',client:'Z Investments',symbol:'AMZN',direction:'Long',reason:'Possible broad market exposure'}]};
  const effects=holdingEffects(story as never);
  expect(effects).toHaveLength(2);
  expect(effects[0].channels[0].possibility).toContain('electric vehicles');
  expect(effects[1].channels[0].possibility).toContain('fulfillment');
  expect(JSON.stringify(effects)).not.toContain('adverse');
  expect(JSON.stringify(effects)).not.toContain('will rise');
 });
 it('restricts effect holdings when a stock filter is selected without mutating the saved report',()=>{
  const matches=[{clientId:'x',client:'X Capital',symbol:'TSLA',direction:'Short',reason:'Macro exposure'},{clientId:'z',client:'Z Investments',symbol:'AMZN',direction:'Long',reason:'Macro exposure'}];
  const article={id:'oil-story',title:'Oil supply disruption',excerpt:'Supply disruption',publisher:'publisher',category:'macro',reason:'Energy costs',symbols:[],topics:['Oil'],matches};
  const filtered=filterStories({articles:[article]} as never,{q:'',topic:'Oil',symbol:'TSLA'});
  expect(holdingEffects(filtered[0]).map(e=>e.symbol)).toEqual(['TSLA']);
  expect(article.matches).toHaveLength(2);
 });
});

describe('grounded AI effects and private caching',()=>{
 it('renders source-backed analysis for each holding and rejects invented figures or foreign holdings',async()=>{
  const r=(await getReport(db,a,null))!,story=r.articles.find(s=>s.id===uid('reader-source'))!;
  const held=effectHoldings(r,story);
  const {facts}=effectsContext(r,story,held,'NVIDIA announced an updated chip platform.');
  const payload={overview_template:'The reported chip announcement may matter for the supplied holding.',reported_fact_templates:['The source reports an updated NVIDIA chip platform.'],holdings:held.map(h=>({holding_id:h.id,impact:'Favourable',confidence:'High',horizon:'Days to weeks',talking_point_template:'The issuer itself is in the headline, so expect questions on adoption timing.',relevance_template:'This client holds the issuer named in the report.',effects:[{heading_template:'Product adoption',explanation_template:'Customer adoption could affect demand, but no financial effect is established in the supplied evidence.'}],uncertainty_template:'Commercial terms and customer commitments are not supplied.',evidence_to_watch_templates:['Watch for issuer confirmation of availability and customer commitments.']}))};
  expect(renderEffects(payload,facts,held,'excerpt',story.url)?.holdings[0].client).toBe('X Capital Management');
  expect(renderEffects({...payload,overview_template:'The price will rise 10%.'},facts,held,'excerpt',story.url)).toBeNull();
  expect(renderEffects({...payload,holdings:[{...payload.holdings[0],holding_id:uid('foreign-holding')}]},facts,held,'excerpt',story.url)).toBeNull();
  expect(renderEffects({...payload,overview_template:'Revenue {{missing.fact}}'},facts,held,'excerpt',story.url)).toBeNull();
  expect(effectHoldings(r,story,'TSLA')).toHaveLength(0);
 });
 it('returns cached analysis without a model call and hides it from another salesperson',async()=>{
  const r=(await getReport(db,a,null))!,story=r.articles.find(s=>s.id===uid('reader-source'))!,key=effectsCacheKey(r,story);
  const analysis={overview:'Cached article-specific analysis',reportedFacts:[story.excerpt],holdings:[],method:'model',evidenceBasis:'excerpt',generatedAt:story.verifiedAt,sourceUrl:story.url};
  await db.asUser(a,q=>q('insert into live_effect_analyses(profile_id,cache_key,report_id,article_id,payload) values($1,$2,$3,$4,$5::jsonb)',[a,key,r.id,story.id,JSON.stringify(analysis)]));
  const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
  try{expect(await getEffectsAnalysis(db,r,story)).toEqual(analysis);}finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
  expect(await db.asUser(b,q=>q('select payload from live_effect_analyses where profile_id=$1 and cache_key=$2',[a,key]))).toHaveLength(0);
 });
 it('requires authenticated report ownership and stock membership before analysis',async()=>{
  const r=(await getReport(db,a,null))!,story=r.articles.find(s=>s.id===uid('reader-source'))!;
  const {POST}=await import('../src/app/api/live/effects/route');
  const body={report:r.id,client:null,article:story.id,symbol:''};
  const req=(id:string|null,value:unknown)=>POST(new Request('http://localhost/api/live/effects',{method:'POST',headers:{'content-type':'application/json',...(id?{cookie:'mb_session='+signSession(id)}:{})},body:JSON.stringify(value)}));
  // No sign-in: requests without a session act as the demo desk profile (see tests/no-login.test.ts).
  expect((await req(b,body)).status).toBe(409);
  expect((await req(a,{...body,article:uid('unknown-effects-article')})).status).toBe(404);
  expect((await req(a,{...body,symbol:'TSLA'})).status).toBe(422);
  const cached=await req(a,body);expect(cached.status).toBe(200);expect((await cached.json()).overview).toBe('Cached article-specific analysis');
 });
});
