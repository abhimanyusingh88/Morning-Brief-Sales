import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import { uid } from '../util/id';
import { fetchSource,sourceUrl } from './fetch';
import { businessDate,sameDay } from './time';
import { classify,plain } from './classify';
import type { Article } from './types';
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
 'https://feeds.bbci.co.uk/news/technology/rss.xml',
 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml',
 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
 'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
 'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
 'https://feeds.bbci.co.uk/news/business/rss.xml',
 'https://feeds.bbci.co.uk/news/world/rss.xml',
 'https://www.federalreserve.gov/feeds/press_all.xml',
] as const;
const field=(value:unknown):string=>typeof value==='string'?value:value&&typeof value==='object'?String((value as Record<string,unknown>)['#text']??''):'';
export function parsePublisherFeed(xml:string,universe:string[],now=new Date()):Article[]{
 const document=new XMLParser({ignoreAttributes:false,parseTagValue:false}).parse(xml);
 const channel=document.rss?.channel;
 let host:string;try{host=sourceUrl(field(channel?.link)).hostname;}catch{throw new Error('FEED_PUBLISHER_REJECTED');}
 const publisher=host==='www.cnbc.com'&&String(channel.description??'').includes('CNBC')?'CNBC':['www.bbc.com','www.bbc.co.uk'].includes(host)&&/BBC/i.test(field(channel.title))?'BBC':host==='www.federalreserve.gov'?'Federal Reserve':null;
 if(!publisher)throw new Error('FEED_PUBLISHER_REJECTED');
 const items=Array.isArray(channel.item)?channel.item:channel.item?[channel.item]:[];
 return items.slice(0,100).flatMap((item:Record<string,unknown>)=>{
  if(String(item['metadata:sponsored']??'false')==='true')return [];
  const date=field(item.pubDate),title=plain(field(item.title)).slice(0,260),excerpt=plain(field(item.description)).slice(0,300);
  // RFC 822 publication dates must carry an explicit timezone. Never substitute retrieval time.
  if(!/(?:GMT|UTC|[+-]\d{4})$/.test(date.trim())||!sameDay(date,businessDate(now))||Date.parse(date)>now.getTime()||!title||!excerpt)return [];
  let url:URL;try{url=sourceUrl(field(item.link));if(url.hostname!==host)return [];for(const key of [...url.searchParams.keys()])if(key.startsWith('utm_')||['at_medium','at_campaign'].includes(key))url.searchParams.delete(key);if(publisher==='CNBC'&&url.pathname.slice(1,11)!==businessDate(new Date(date)).replaceAll('-','/'))return [];}catch{return [];}
  const tags=classify(title+' '+excerpt,universe);
  if(!tags.symbols.length&&!tags.topics.some(t=>['Markets','Credit','Trade','Oil','Geopolitics','Rates','AI','Regulation','Semiconductors'].includes(t)))return [];
  const publishedAt=new Date(date).toISOString();
  return [{id:uid('live:news:'+url.href),url:url.href,title,excerpt,publisher,publishedAt,eventDate:businessDate(now),verifiedAt:now.toISOString(),evidenceHash:createHash('sha256').update(title+'\n'+publishedAt+'\n'+excerpt).digest('hex'),...tags,summaryTemplate:null,verification:'Headline and excerpt from the original publisher RSS feed; original publication time checked for this US day. Reported today; underlying event timing may differ.'}];
 });
}
export async function collectPublisherFeeds(universe:string[],signal:AbortSignal,now=new Date()){
 const results:PromiseSettledResult<Article[]>[]=[];
 for(let i=0;i<NEWS_FEEDS.length;i+=6)results.push(...await Promise.allSettled(NEWS_FEEDS.slice(i,i+6).map(async url=>{const r=await fetchSource(url,AbortSignal.any([signal,AbortSignal.timeout(8000)]),true);return parsePublisherFeed(r.text,universe,now);})));
 const articles=[...new Map(results.flatMap(r=>r.status==='fulfilled'?r.value:[]).map(a=>[a.url,a])).values()];
 return {articles,successful:results.filter(r=>r.status==='fulfilled').length,total:results.length};
}
