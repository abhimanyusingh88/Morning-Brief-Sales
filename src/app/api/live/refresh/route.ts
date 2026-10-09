import { getDb } from '@/lib/db';
import { loadMe,meFromRequest } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
import { refresh } from '@/lib/live/jobs';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=240;
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin'},{status:403});
 const id=meFromRequest(request);if(!id||!await loadMe(id))return Response.json({error:'Sign in required'},{status:401});
 try{const db=await getDb();const allowed=await db.asService(q=>q('insert into live_refresh_requests(profile_id,requested_at) values($1,now()) on conflict(profile_id) do update set requested_at=excluded.requested_at where live_refresh_requests.requested_at<now()-interval \'5 minutes\' returning profile_id',[id]));if(!allowed.length)return Response.json({error:'A refresh was requested recently. Your saved report remains available.'},{status:429});await refresh(db,{budgetMs:180000});return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Sources could not be refreshed. Your last verified report remains available.'},{status:503});}
}
