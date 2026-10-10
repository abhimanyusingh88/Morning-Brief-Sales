import { getDb } from '@/lib/db';
import { loadMe,meFromRequest } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
import { refresh } from '@/lib/live/jobs';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=60;
// Each request does a bounded slice of work and publishes what is verified so far, so it finishes inside a 60s
// function limit. Unfinished source jobs stay queued; the screen calls again while `pending` is above zero.
const budget=()=>{const s=Number(process.env.REFRESH_BUDGET_SECONDS||45);return Math.max(20,Math.min(220,Number.isFinite(s)?s:45))*1000;};
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin'},{status:403});
 const id=meFromRequest(request);if(!id||!await loadMe(id))return Response.json({error:'Sign in required'},{status:401});
 try{const db=await getDb();const allowed=await db.asService(q=>q('insert into live_refresh_requests(profile_id,requested_at) values($1,now()) on conflict(profile_id) do update set requested_at=excluded.requested_at where live_refresh_requests.requested_at<now()-interval \'30 seconds\' returning profile_id',[id]));if(!allowed.length)return Response.json({error:'A refresh is already running. Your brief will update when it finishes.'},{status:429});
  const ms=budget(),result=await refresh(db,{budgetMs:ms,discovery:ms>=90000,profileId:id});
  const [open]=await db.asService(q=>q<{n:number}>("select count(*)::int n from live_jobs where kind in('market','news') and attempts<3 and (status='queued' or status='running')"));
  return Response.json({ok:true,...result,pending:open?.n??0},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Sources could not be refreshed. Your last verified report remains available.'},{status:503});}
}
