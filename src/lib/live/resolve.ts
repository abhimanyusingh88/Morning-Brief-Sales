import { fetchSource,openUrl } from './fetch';
import { plain } from './classify';
// Google News items link to news.google.com wrappers. A reader click resolves them to the publisher URL using the
// signed id Google embeds on the wrapper page (the same exchange the browser performs), then reads the publisher page.
const BATCH='https://news.google.com/_/DotsSplashUi/data/batchexecute';
const cache=new Map<string,string>();
export function googleArticleId(url:string):string|null{try{const u=new URL(url);if(u.hostname!=='news.google.com')return null;return /\/(?:rss\/)?articles\/([A-Za-z0-9_-]{20,})/.exec(u.pathname)?.[1]??null;}catch{return null;}}
export function parseBatchUrl(body:string):string|null{
 for(const m of body.matchAll(/https:\/\/[^"\\\s]+/g)){try{const u=openUrl(m[0]);if(!/(^|\.)google\.com$/.test(u.hostname))return u.href;}catch{}}
 return null;
}
export async function resolvePublisherUrl(url:string,signal:AbortSignal):Promise<string>{
 const id=googleArticleId(url);if(!id)return url;
 const hit=cache.get(id);if(hit)return hit;
 const page=await fetchSource('https://news.google.com/rss/articles/'+id+'?hl=en-US&gl=US&ceid=US:en',signal);
 const attr=(n:string)=>new RegExp('data-n-a-'+n+'="([^"]+)"').exec(page.text)?.[1];
 const ts=attr('ts'),sg=attr('sg');if(!ts||!sg||!/^\d+$/.test(ts)||!/^[A-Za-z0-9_-]+$/.test(sg))throw new Error('GOOGLE_NEWS_UNRESOLVED');
 const inner=JSON.stringify(['garturlreq',[['X','X',['X','X'],null,null,1,1,'US:en',null,1,null,null,null,null,null,0,1],'X','X',1,[1,1,1],1,1,null,0,0,null,0],id,Number(ts),sg]);
 const r=await fetch(BATCH,{method:'POST',signal,redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','User-Agent':'Mozilla/5.0'},body:'f.req='+encodeURIComponent(JSON.stringify([[['Fbv4je',inner,null,'generic']]]))});
 if(!r.ok)throw new Error('GOOGLE_NEWS_UNRESOLVED');
 const target=parseBatchUrl((await r.text()).slice(0,200000));if(!target)throw new Error('GOOGLE_NEWS_UNRESOLVED');
 cache.set(id,target);if(cache.size>2000)cache.delete(cache.keys().next().value!);
 return target;
}
const BOILER=/^(sign up|subscribe|advertisement|accept (all )?cookies|all rights reserved|read more|related:|recommended|share this|follow us|click here|copyright|newsletter|you may also like|this article was|getty images|photo:|image:)/i;
/** Embedded player and widget code that some publishers leave inside articleBody as plain text. */
const WIDGET=/^(featured video|watch:|video:|related video|up next|play video)\b/i;
const CODE=/window\.[A-Za-z_$]|document\.(?:getElementById|querySelector|createElement)|\bfunction\s*\(|=>\s*\{|\}\s*\)\s*\(\s*\)|\(\(\)\s*=>|\{"[A-Za-z_]+":|\\\/|\b(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=/;
/** True for a paragraph that is script or markup data rather than prose. */
export function isCodeLike(s:string):boolean{if(WIDGET.test(s)||CODE.test(s))return true;const sym=(s.match(/[{}[\]=<>\\|]/g)??[]).length;return s.length>=40&&sym/s.length>0.04;}
/** Main-text extraction: JSON-LD articleBody, then the densest paragraph container, with boilerplate removed. */
export function extractMainText(html:string):string{
 const ld:string[]=[];const walk=(v:unknown,d=0)=>{if(d>12)return;if(Array.isArray(v))v.forEach(x=>walk(x,d+1));else if(v&&typeof v==='object'){const o=v as Record<string,unknown>;if(typeof o.articleBody==='string'&&o.articleBody.length>300)ld.push(o.articleBody);Object.values(o).forEach(x=>walk(x,d+1));}};
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
 if(ld.length){const best=ld.sort((a,b)=>b.length-a.length)[0];return best.replace(/<\/(?:p|h[1-6]|li|blockquote)>|<br\s*\/?>/gi,'\n\n').split(/\n\s*\n|(?<=[.!?])\s{2,}/).map(plain).filter(s=>s&&!isCodeLike(s)).join('\n\n');}
 const body=html.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|figure|iframe)\b[\s\S]*?<\/\1>/gi,' ');
 const scope=/<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(body)?.[1]??/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(body)?.[1]??body;
 const paras=[...scope.matchAll(/<(p|h2|h3|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m=>({tag:m[1].toLowerCase(),t:plain(m[2])})).filter(p=>p.t&&!BOILER.test(p.t)&&!isCodeLike(p.t)&&(p.tag==='p'?p.t.length>=40:p.tag==='li'?p.t.length>=60:p.t.length>=8&&p.t.length<140));
 const seen=new Set<string>();return paras.filter(p=>{if(seen.has(p.t))return false;seen.add(p.t);return true;}).map(p=>p.t).join('\n\n');
}
/** True when the page plausibly is the story (not a consent wall, paywall stub or home page). */
export function matchesStory(html:string,text:string,title:string):boolean{
 const words=title.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>4);if(!words.length)return text.length>600;
 const hay=(html.slice(0,60000)+' '+text.slice(0,4000)).toLowerCase();const hits=words.filter(w=>hay.includes(w)).length;
 return text.length>=500&&hits/words.length>=0.5;
}
