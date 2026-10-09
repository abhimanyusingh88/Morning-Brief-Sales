import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { uid } from '../util/id';
import { fetchSource,sourceUrl } from './fetch';
import { businessDate,sinceClose } from './time';
import { classify,plain,COMPANIES } from './classify';
import type { Article } from './types';
// Direct publisher feeds. The channel link identifies the publisher; item links must stay on that host.
export const NEWS_FEEDS=[
 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
 'https://www.cnbc.com/id/100727362/device/rss/rss.html',
 'https://www.cnbc.com/id/19854910/device/rss/rss.html',
 'https://www.cnbc.com/id/10000664/device/rss/rss.html',
 'https://www.cnbc.com/id/19836768/device/rss/rss.html',
 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
 'https://www.cnbc.com/id/10000101/device/rss/rss.html',
 'https://www.cnbc.com/id/10000116/device/rss/rss.html',
 'https://www.cnbc.com/id/10000113/device/rss/rss.html',
 'https://www.cnbc.com/id/100151493/device/rss/rss.html',
 'https://www.cnbc.com/id/15839135/device/rss/rss.html',
 'https://www.cnbc.com/id/10001147/device/rss/rss.html',
 'https://www.cnbc.com/id/10000108/device/rss/rss.html',
 'https://www.cnbc.com/id/15839069/device/rss/rss.html',
 'https://feeds.bbci.co.uk/news/technology/rss.xml',
 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
 'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
 'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
 'https://feeds.bbci.co.uk/news/business/rss.xml',
 'https://feeds.bbci.co.uk/news/world/rss.xml',
 'https://www.federalreserve.gov/feeds/press_all.xml',
 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse',
 'https://feeds.content.dowjones.io/public/rss/mw_bulletins',
 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
 'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
 'https://feeds.a.dj.com/rss/RSSWSJD.xml',
 'https://oilprice.com/rss/main',
 'https://www.coindesk.com/arc/outboundfeeds/rss/',
] as const;
// Aggregated wire coverage. Each item names its original publisher in <source>; that publisher is attributed.
const GOOGLE_TOPICS=['stock market today','stock futures','federal reserve interest rates','treasury yields','oil prices OPEC','iran israel war','russia ukraine war','china tariffs trade','artificial intelligence OpenAI','semiconductor chips export','earnings results guidance','merger acquisition deal','bitcoin crypto market','ECB Europe stocks','Asia markets Nikkei Hang Seng','IPO filing','jobs report inflation CPI','gold prices'];
export function googleNewsFeeds(universe:string[]):string[]{
 const names=universe.filter(s=>COMPANIES[s]).map(s=>'"'+COMPANIES[s].name+'"');
 const groups:string[]=[];for(let i=0;i<names.length;i+=4)groups.push(names.slice(i,i+4).join(' OR '));
 return [...GOOGLE_TOPICS,...groups].map(q=>'https://news.google.com/rss/search?q='+encodeURIComponent(q+' when:1d')+'&hl=en-US&gl=US&ceid=US:en');
}
export function yahooTickerFeeds(universe:string[]):string[]{
 const s=universe.filter(x=>/^[A-Z.]{1,6}$/.test(x));const out:string[]=[];for(let i=0;i<s.length;i+=8)out.push('https://feeds.finance.yahoo.com/rss/2.0/headline?s='+s.slice(i,i+8).join(',')+'&region=US&lang=en-US');return out;
}
const PUBLISHERS:Record<string,string>={'www.cnbc.com':'CNBC','www.bbc.com':'BBC','www.bbc.co.uk':'BBC','www.federalreserve.gov':'Federal Reserve','www.marketwatch.com':'MarketWatch','www.wsj.com':'The Wall Street Journal','oilprice.com':'OilPrice.com','www.coindesk.com':'CoinDesk','finance.yahoo.com':'Yahoo Finance'};
const field=(value:unknown):string=>typeof value==='string'?value:value&&typeof value==='object'?String((value as Record<string,unknown>)['#text']??''):'';
const RELEVANT=['Markets','Credit','Trade','Oil','Energy','Geopolitics','Rates','AI','Regulation','Semiconductors','Earnings','Deals','Crypto','Banks','Defense','Healthcare','Commodities','Telecom'];
function admit(o:{title:string;excerpt:string;date:string;url:URL;publisher:string;universe:string[];now:Date;verification:string}):Article[]{
 const {title,excerpt,date,url,publisher,universe,now}=o;
 // RFC 822 publication dates must carry an explicit timezone. Never substitute retrieval time.
 if(!/(?:GMT|UTC|Z|[+-]\d{4}|[+-]\d{2}:\d{2})$/.test(date.trim()))return [];
 const at=Date.parse(date);if(!Number.isFinite(at)||at>now.getTime()||at<sinceClose(now))return [];
 if(!title)return [];
 const tags=classify(title+' '+excerpt,universe);
 if(!tags.symbols.length&&!tags.topics.some(t=>RELEVANT.includes(t)))return [];
 const publishedAt=new Date(at).toISOString(),body=excerpt||title;
 return [{id:uid('live:news:'+url.href),url:url.href,title,excerpt:body,publisher,publishedAt,eventDate:businessDate(now),verifiedAt:now.toISOString(),evidenceHash:createHash('sha256').update(title+'\n'+publishedAt+'\n'+body).digest('hex'),...tags,summaryTemplate:null,verification:o.verification}];
}
export function parsePublisherFeed(xml:string,universe:string[],now=new Date()):Article[]{
 const document=new XMLParser({ignoreAttributes:false,parseTagValue:false,attributeNamePrefix:'@_'}).parse(xml);
 const channel=document.rss?.channel;
 let host:string;try{host=sourceUrl(field(channel?.link)).hostname;}catch{throw new Error('FEED_PUBLISHER_REJECTED');}
 const items:Record<string,unknown>[]=Array.isArray(channel.item)?channel.item:channel.item?[channel.item]:[];
 if(host==='news.google.com')return items.slice(0,60).flatMap(item=>{
  const source=item.source as Record<string,unknown>|string|undefined;const publisher=plain(field(source)).slice(0,80);
  const raw=plain(field(item.title));const title=(publisher&&raw.endsWith(' - '+publisher)?raw.slice(0,-(publisher.length+3)):raw).slice(0,260);
  if(!publisher||!title)return [];let url:URL;try{url=sourceUrl(field(item.link));if(url.hostname!=='news.google.com')return [];}catch{return [];}
  return admit({title,excerpt:'',date:field(item.pubDate),url,publisher,universe,now,verification:'Headline as published by '+publisher+', via the Google News index; original publication time checked against the prior US close.'});
 });
 const publisher=PUBLISHERS[host]??(host==='www.cnbc.com'?'CNBC':null);
 const yahoo=host==='finance.yahoo.com';
 if(!publisher||(publisher==='BBC'&&!/BBC/i.test(field(channel.title)))||(publisher==='CNBC'&&!String(channel.description??'').includes('CNBC')))throw new Error('FEED_PUBLISHER_REJECTED');
 return items.slice(0,100).flatMap(item=>{
  if(String(item['metadata:sponsored']??'false')==='true')return [];
  const date=field(item.pubDate),title=plain(field(item.title)).slice(0,260),excerpt=plain(field(item.description)).slice(0,320);
  let url:URL;try{url=sourceUrl(field(item.link));
   // Yahoo ticker feeds syndicate other publishers; everyone else must link back to themselves.
   if(!yahoo&&url.hostname!==host&&!(host==='www.marketwatch.com'&&url.hostname==='www.wsj.com'))return [];
   for(const key of [...url.searchParams.keys()])if(key.startsWith('utm_')||['at_medium','at_campaign','mod','reflink'].includes(key))url.searchParams.delete(key);
   if(publisher==='CNBC'&&url.pathname.slice(1,11)!==businessDate(new Date(date)).replaceAll('-','/'))return [];
  }catch{return [];}
  if(publisher==='CNBC'&&!excerpt)return [];
  return admit({title,excerpt,date,url,publisher:yahoo?PUBLISHERS[url.hostname]??url.hostname.replace(/^www\./,''):publisher,universe,now,verification:'Headline and excerpt from the original publisher feed; publication time checked against the prior US close.'});
 });
}
export async function collectPublisherFeeds(universe:string[],signal:AbortSignal,now=new Date()){
 const urls=[...NEWS_FEEDS,...googleNewsFeeds(universe),...yahooTickerFeeds(universe)];
 const results:PromiseSettledResult<Article[]>[]=[];
 for(let i=0;i<urls.length;i+=8){if(signal.aborted)break;results.push(...await Promise.allSettled(urls.slice(i,i+8).map(async url=>{const r=await fetchSource(url,AbortSignal.any([signal,AbortSignal.timeout(8000)]),false);return parsePublisherFeed(r.text,universe,now);})));}
 const seen=new Set<string>();const articles:Article[]=[];
 // One event syndicated under the same headline is kept once, preferring the earliest publication.
 for(const a of results.flatMap(r=>r.status==='fulfilled'?r.value:[]).sort((x,y)=>x.publishedAt.localeCompare(y.publishedAt))){const key=a.title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();if(seen.has(a.url)||seen.has(key))continue;seen.add(a.url);seen.add(key);articles.push(a);}
 return {articles,successful:results.filter(r=>r.status==='fulfilled').length,total:urls.length};
}
