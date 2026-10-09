import { z } from 'zod';
import { getDb } from '@/lib/db';
import { loadMe,meFromRequest } from '@/lib/auth/session';
import { getReport } from '@/lib/live/reports';
import { getReadingBrief } from '@/lib/live/article-reader';
import { sameOrigin } from '@/lib/live/delivery';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
const Id=z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
const Body=z.object({report:Id,client:Id.nullable(),article:Id,summarize:z.boolean().default(false)});
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin'},{status:403});
 const id=meFromRequest(request);if(!id||!await loadMe(id))return Response.json({error:'Sign in required'},{status:401});
 const raw=await request.text();if(raw.length>4096)return Response.json({error:'Request too large'},{status:413});
 const b=Body.safeParse((()=>{try{return JSON.parse(raw);}catch{return null;}})());if(!b.success)return Response.json({error:'Invalid article request'},{status:400});
 try{const db=await getDb(),report=await getReport(db,id,b.data.client,b.data.report),article=report?.articles.find(a=>a.id===b.data.article);if(!article)return Response.json({error:'Article unavailable in this client scope'},{status:404});
 const brief=await getReadingBrief(db,article,b.data.summarize);if(!await getReport(db,id,b.data.client,b.data.report))return Response.json({error:'Reload the briefing; its evidence or client scope changed.'},{status:409});
 return Response.json(brief??{pending:true},{status:brief?200:202,headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'The detailed reading is unavailable. The source excerpt remains available.'},{status:503});}
}
