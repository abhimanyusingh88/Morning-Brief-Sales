import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { COOKIE,cookieOptions,signSession } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
export const dynamic='force-dynamic';
export async function GET(){if(process.env.NODE_ENV==='production')return NextResponse.json({personas:[]});const db=await getDb();const rows=await db.asService(q=>q('select id,full_name,initials,title,role,avatar_hue from profiles where is_active order by full_name'));return NextResponse.json({personas:rows.map(r=>({id:r.id,name:r.full_name,initials:r.initials,title:r.title,role:r.role,hue:r.avatar_hue}))});}
const Body=z.object({profileId:z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i).optional(),accessCode:z.string().max(200).optional(),email:z.string().email().optional(),password:z.string().max(300).optional()});
function codeOk(code:string):boolean{const expected=process.env.DEMO_ACCESS_CODE;if(!expected||expected.length<16)return false;const a=Buffer.from(code),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
export async function POST(request:Request){if(!sameOrigin(request))return NextResponse.json({error:'Invalid origin'},{status:403});const parsed=Body.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Valid sign-in details required'},{status:400});const b=parsed.data,db=await getDb();let id:string|undefined;
 if(process.env.NODE_ENV!=='production'&&b.profileId)id=b.profileId;
 else if(codeOk(b.accessCode??'')){if(b.profileId)id=b.profileId;else if(b.email){const [p]=await db.asService(q=>q<{id:string}>('select id from profiles where email=$1 and is_active',[b.email]));id=p?.id;}}
 else if(b.email&&b.password){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)return NextResponse.json({error:'Account sign-in is not configured'},{status:503});const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await client.auth.signInWithPassword({email:b.email,password:b.password});if(error||!data.user)return NextResponse.json({error:'Sign-in details could not be verified'},{status:401});const [p]=await db.asService(q=>q<{id:string}>('select id from profiles where auth_user_id=$1 and is_active',[data.user.id]));id=p?.id;}
 if(!id)return NextResponse.json({error:'Access could not be verified'},{status:401});const rows=await db.asService(q=>q('select 1 from profiles where id=$1 and is_active',[id]));if(!rows.length)return NextResponse.json({error:'Account unavailable'},{status:404});const res=NextResponse.json({ok:true});res.cookies.set(COOKIE,signSession(id),cookieOptions);return res;
}
export async function DELETE(){const res=NextResponse.json({ok:true});res.cookies.set(COOKIE,'',{...cookieOptions,maxAge:0});return res;}
