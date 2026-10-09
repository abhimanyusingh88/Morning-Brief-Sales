import { z } from 'zod';
import { getDb } from '@/lib/db';
import { loadMe,meFromRequest } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
import { getReport } from '@/lib/live/reports';
import { parseFilters } from '@/lib/live/presentation';
import { businessDate } from '@/lib/live/time';
import { answerFromReport,answerWithModel,fallbackAnswer } from '@/lib/live/assistant';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
const Id=z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
const Body=z.object({report:Id,client:Id.nullable(),question:z.string().trim().min(1).max(1200),filters:z.object({q:z.string().max(160),topic:z.string().max(40),symbol:z.string().max(15)}),history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(5000)})).max(6).default([])});
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin'},{status:403});
 const id=meFromRequest(request);if(!id||!await loadMe(id))return Response.json({error:'Sign in required'},{status:401});
 if(Number(request.headers.get('content-length')??0)>40000)return Response.json({error:'Question is too large'},{status:413});
 const raw=await request.text();if(raw.length>40000)return Response.json({error:'Question is too large'},{status:413});
 let input:unknown;try{input=JSON.parse(raw);}catch{return Response.json({error:'Invalid question'},{status:400});}
 const parsed=Body.safeParse(input);if(!parsed.success)return Response.json({error:'Enter a question and a valid report'},{status:400});
 try{
  const db=await getDb(),b=parsed.data;const report=await getReport(db,id,b.client,b.report);
  if(!report||report.businessDate!==businessDate())return Response.json({error:'Refresh the brief before asking about this report.'},{status:409});
  const filters=parseFilters(new URLSearchParams(b.filters));
  let answer=answerFromReport(report,filters,b.question);
  if(!answer){
   if(process.env.OPENAI_API_KEY){
    const reserved=await db.asService(q=>q('insert into live_assistant_usage(profile_id,day,calls) values($1,$2,1) on conflict(profile_id,day) do update set calls=live_assistant_usage.calls+1,last_call=now() where live_assistant_usage.calls<60 and live_assistant_usage.last_call<now()-interval \'3 seconds\' returning calls',[id,businessDate()]));
    if(reserved.length)try{answer=await answerWithModel(report,filters,b.question,b.history);}catch(e){const error=e as {name?:string;status?:number;code?:string};console.warn('[live-assistant] analysis_unavailable',error.name??'Error',error.status??'',error.code??'');}
   }
   if(!answer)answer=fallbackAnswer(report,filters,b.question);
  }
  if(!answer)return Response.json({error:'The answer could not be grounded in this report. Try a more specific question; no unsupported answer was shown.'},{status:422});
  // Recheck assignment, report evidence and preference changes after any model request.
  if(!await getReport(db,id,b.client,b.report))return Response.json({error:'Your client scope changed. Reload the brief.'},{status:409});
  await db.asUser(id,q=>q('insert into live_assistant_messages(profile_id,report_id,question,answer,source_ids,method) values($1,$2,$3,$4,$5,$6)',[id,b.report,b.question,answer!.answer,answer!.sources.map(s=>s.id),answer!.method]));
  return Response.json({...answer,reportId:report.id,clientName:report.clientName,cutoff:report.cutoff},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'The assistant could not respond. Your brief remains available.'},{status:503});}
}
