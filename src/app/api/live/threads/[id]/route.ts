import { getDb } from '@/lib/db';
import { loadMe,meFromRequest } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
import { validId } from '@/lib/live/reports';
import { deleteThread,getThreadMessages } from '@/lib/live/threads';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};
/** One conversation's messages. Another person's thread, or an unknown id, is a 404. */
export async function GET(request:Request,{params}:Ctx){
 const me=meFromRequest(request);if(!me||!await loadMe(me))return Response.json({error:'Profile unavailable'},{status:401});
 const {id}=await params;if(!validId(id))return Response.json({error:'Not found'},{status:404});
 try{const messages=await getThreadMessages(await getDb(),me,id);return messages?Response.json({messages},{headers:{'Cache-Control':'private, no-store'}}):Response.json({error:'Not found'},{status:404});}catch{return Response.json({error:'Conversation unavailable'},{status:503});}
}
export async function DELETE(request:Request,{params}:Ctx){
 if(!sameOrigin(request))return Response.json({error:'Invalid origin'},{status:403});
 const me=meFromRequest(request);if(!me||!await loadMe(me))return Response.json({error:'Profile unavailable'},{status:401});
 const {id}=await params;if(!validId(id))return Response.json({error:'Not found'},{status:404});
 try{return await deleteThread(await getDb(),me,id)?Response.json({ok:true}):Response.json({error:'Not found'},{status:404});}catch{return Response.json({error:'Could not delete'},{status:503});}
}
