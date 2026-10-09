import { getDb } from '@/lib/db';
import { loadMe,meFromRequest } from '@/lib/auth/session';
import { listThreads } from '@/lib/live/threads';
export const dynamic='force-dynamic';
/** The current person's analyst conversations, newest first. */
export async function GET(request:Request){
 const id=meFromRequest(request);if(!id||!await loadMe(id))return Response.json({error:'Profile unavailable'},{status:401});
 try{return Response.json({threads:await listThreads(await getDb(),id)},{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'History unavailable'},{status:503});}
}
