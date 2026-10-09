import { getDb } from '@/lib/db';
import { verifyDelivery } from '@/lib/live/delivery';
import { refresh } from '@/lib/live/jobs';
import { timingSafeEqual } from 'node:crypto';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=240;
export async function POST(request:Request){
 if(Number(request.headers.get('content-length')??0)>4096)return Response.json({error:'Request too large'},{status:413});
 const body=await request.text();if(body.length>4096)return Response.json({error:'Request too large'},{status:413});
 if(!await verifyDelivery(request,body))return Response.json({error:'Unauthorized'},{status:401});
 // The signed delivery body is never interpreted as client data, a URL, or a job instruction.
 try{const db=await getDb();await refresh(db,{budgetMs:180000});return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Refresh unavailable; delivery may retry'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
/** Vercel Cron fallback: authorised by CRON_SECRET, runs the same idempotent refresh-publish-email cycle. */
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET,got=Buffer.from(request.headers.get('authorization')??''),want=Buffer.from('Bearer '+(secret??''));
 if(!secret||secret.length<16||got.length!==want.length||!timingSafeEqual(got,want))return Response.json({error:'Unauthorized'},{status:401});
 try{const db=await getDb();await refresh(db,{budgetMs:180000});return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Refresh unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
