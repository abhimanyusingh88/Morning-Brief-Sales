import { NextResponse } from 'next/server';
import { COOKIE,cookieOptions } from '@/lib/auth/session';

export const dynamic='force-dynamic';

export async function GET(){
 return NextResponse.json({demo:true,signInRequired:false},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(){
 return NextResponse.json({error:'Sign-in is disabled in the public demo.'},{status:410,headers:{'Cache-Control':'no-store'}});
}
export async function DELETE(){
 const response=NextResponse.json({ok:true});
 response.cookies.set(COOKIE,'',{...cookieOptions,maxAge:0});
 return response;
}
