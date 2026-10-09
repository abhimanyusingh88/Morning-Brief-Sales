import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { uid } from '../util/id';
import { ALLOWED_HOSTS,fetchSource,sourceUrl } from './fetch';
import { collectPublisherFeeds } from './feeds';
import { businessDate,sameDay } from './time';
import type { Article } from './types';
import { COMPANIES,classify,plain } from './classify';
export { COMPANIES,classify,plain } from './classify';
function metadata(html:string):Record<string,string>{const out:Record<string,string>={};for(const m of html.matchAll(/<meta\b[^>]*>/gi)){const attrs=Object.fromEntries([...m[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(a=>[a[1].toLowerCase(),a[2]]));const name=attrs.property??attrs.name;if(name&&attrs.content)out[name.toLowerCase()]=plain(attrs.content);}return out;}
function jsonRecords(html:string):Record<string,unknown>[] {const out:Record<string,unknown>[]=[];const walk=(v:unknown,n:number)=>{if(n>12||out.length>1000)return;if(Array.isArray(v))v.slice(0,100).forEach(x=>walk(x,n+1));else if(v&&typeof v==='object'){out.push(v as Record<string,unknown>);Object.values(v).forEach(x=>walk(x,n+1));}};for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1]),0);}catch{}}return out;}
const ISSUER_DOMAINS=new Set(['newsroom.nvidia.com','nvidianews.nvidia.com','www.intel.com','www.marvell.com','ir.marvell.com','ir.tesla.com','www.tesla.com','www.aboutamazon.com','press.aboutamazon.com','www.microsoft.com','blogs.microsoft.com','openai.com','www.anthropic.com','blog.google']);
export function verifyDocument(html:string,url:string,universe:string[],now=new Date()):Article|null {
 const u=sourceUrl(url),meta=metadata(html);const record=jsonRecords(html).find(r=>['NewsArticle','Article','BlogPosting','PressRelease'].some(t=>String(r['@type']).includes(t)));const date=String(meta['article:published_time']??meta['date']??record?.datePublished??'');
 // A modified timestamp does not turn an older article into a present-day event.
 if(!date||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(date)||!sameDay(date,businessDate(now))||Date.parse(date)>now.getTime())return null;
 const title=plain(meta['og:title']??String(record?.headline??'')??'').slice(0,260);if(!title)return null;
 const canonical=meta['og:url'];if(canonical){try{if(sourceUrl(canonical).hostname!==u.hostname)return null;}catch{return null;}}
 const text=plain(html),description=plain(meta.description??meta['og:description']??String(record?.description??''));
 // Issuer releases are dated announcement evidence; reporting needs an explicit same-day event cue.
 const release=ISSUER_DOMAINS.has(u.hostname)&&/\b(announce[sd]?|launch(?:es|ed)?|introduces?|unveils?|releases?|reports?|earnings)\b/i.test(title+' '+description)&&/news|press|release|blog|announcement/i.test(u.pathname);
 const month=now.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'long'}),day=Number(businessDate(now).slice(-2));const eventCue=new RegExp('\\b(today|'+month+'\\s+'+day+'(?:,?\\s+'+businessDate(now).slice(0,4)+')?)\\b','i');
 const relevantText=title+' '+description;
 // Admit original reporting published today without claiming that every underlying event started today.
 if(!release&&!eventCue.test(description)&&/\b(last year|years ago|last month|last week|yesterday|tomorrow|next week|next month)\b/i.test(description))return null;
 const tags=classify(relevantText,universe);if(!tags.symbols.length&&!tags.topics.some(t=>['Markets','Credit','Trade','Oil','Geopolitics','Rates','AI','Regulation','Semiconductors'].includes(t)))return null;
 const excerpt=description.slice(0,300);if(!excerpt||!text.toLowerCase().includes(title.slice(0,30).toLowerCase())&& !html.toLowerCase().includes(title.slice(0,30).toLowerCase()))return null;
 const evidenceHash=createHash('sha256').update(title+'\n'+date+'\n'+excerpt).digest('hex');return {id:uid('live:news:'+u.href),url:u.href,title,publisher:u.hostname.replace(/^www\./,''),publishedAt:new Date(date).toISOString(),eventDate:businessDate(now),verifiedAt:now.toISOString(),evidenceHash,...tags,excerpt,summaryTemplate:null,verification:release?'Original issuer announcement; original publication timestamp checked.':eventCue.test(description)?'Original article publication timestamp and same-day event cue checked.':'Original reporting published during this US day. Underlying event timing may differ; review linked evidence.'};
}
export type NewsResult={articles:Article[];ok:boolean;detail:string};
export function discoveryUrls(output:unknown[]):string[]{
 const found=new Set<string>();
 for(const item of output){if(!item||typeof item!=='object')continue;const o=item as Record<string,unknown>;
  if(o.type==='web_search_call'){const action=o.action as Record<string,unknown>|undefined;if(Array.isArray(action?.sources))for(const raw of action.sources){if(raw&&typeof raw==='object'&&typeof raw.url==='string')found.add(raw.url);}}
  if(o.type==='message'&&Array.isArray(o.content))for(const raw of o.content){if(raw?.type==='output_text'&&Array.isArray(raw.annotations))for(const a of raw.annotations)if(a.type==='url_citation'&&typeof a.url==='string')found.add(a.url);}
 }
 return [...found].filter(raw=>{try{const u=sourceUrl(raw);return u.pathname!=='/'&&!/\/(?:tag|tags|search|topic|topics|category|categories)(?:\/|$)/i.test(u.pathname);}catch{return false;}}).slice(0,16);
}
export async function collectNews(universe:string[],signal:AbortSignal,now=new Date(),allowDiscovery:boolean|(()=>Promise<boolean>)=true):Promise<NewsResult>{
 const feeds=await collectPublisherFeeds(universe,signal,now);
 if(!allowDiscovery||!process.env.OPENAI_API_KEY||feeds.articles.length>=60)return {articles:feeds.articles,ok:feeds.successful>0,detail:feeds.successful?'Publisher feeds '+feeds.successful+'/'+feeds.total+' checked; '+feeds.articles.length+' current-day relevant articles.':'PUBLISHER_FEEDS_UNAVAILABLE'};
 const articles=[...feeds.articles];
 if(typeof allowDiscovery==='function'&&!await allowDiscovery())return {articles,ok:feeds.successful>0,detail:'Publisher feeds checked; discovery budget unavailable.'};
 try{
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:55000});
  const names=universe.map(s=>s+' '+(COMPANIES[s]?.name??'')).join(', ');
  // Public issuer symbols only; never send client names, quantities or position direction.
  // Consume the search tool's actual sources, rather than trusting model-written URLs or JSON.
  const response=await client.responses.create({model:process.env.OPENAI_MODEL||'gpt-6-luna',reasoning:{effort:'low'},tools:[{type:'web_search',external_web_access:true,search_context_size:'low',filters:{allowed_domains:[...ALLOWED_HOSTS].filter(h=>!['cdn-api.cboe.com','finance.yahoo.com'].includes(h))}}],tool_choice:'required',input:'Find original news published on '+businessDate(now)+' in America/New_York before '+now.toISOString()+'. Search '+names+'; also current oil supply/prices, wars, economic releases, major AI launches and announcements affecting markets. Prefer original newsrooms, government releases, Reuters, AP and CNBC. Exclude archive/tag pages and older stories republished today. Give a short list of direct source links. Never invent sources.',include:['web_search_call.action.sources'],max_output_tokens:1200,store:false},{signal});
  const urls=discoveryUrls(response.output);
  let fetched=0,rejected=0,unavailable=0;
  for(let i=0;i<urls.length;i+=4){const settled=await Promise.allSettled(urls.slice(i,i+4).filter(u=>!articles.some(a=>a.url===u)).map(async url=>{const r=await fetchSource(url,AbortSignal.any([signal,AbortSignal.timeout(9000)]),true);return verifyDocument(r.text,r.url,universe,now);}));for(const r of settled){if(r.status==='fulfilled'){fetched++;if(r.value)articles.push(r.value);else rejected++;}else unavailable++;}if(signal.aborted)throw new Error('JOB_TIMEOUT');}
  const unique=[...new Map(articles.map(a=>[a.url,a])).values()];
  return {articles:unique,ok:feeds.successful>0||fetched>0,detail:'Publisher feeds '+feeds.successful+'/'+feeds.total+'; search sources '+urls.length+'; documents checked '+fetched+'; date/relevance rejected '+rejected+'; unavailable '+unavailable+'.'};
 }catch{
  if(signal.aborted)throw new Error('JOB_TIMEOUT');
  return {articles,ok:feeds.successful>0,detail:articles.length?'Original publisher feed evidence retained; web discovery unavailable.':'NEWS_DISCOVERY_UNAVAILABLE'};
 }
}
