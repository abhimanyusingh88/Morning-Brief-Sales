import { NextResponse,type NextRequest } from 'next/server';
const retired=['/api/agent','/api/brief-prefs','/api/cards','/api/chat','/api/demo','/api/pipeline','/api/preferences','/api/qc'];
export function proxy(request:NextRequest){const p=request.nextUrl.pathname;if(retired.some(x=>p===x||p.startsWith(x+'/')))return NextResponse.json({error:'This workflow has been retired. Use the market brief.'},{status:410,headers:{'Cache-Control':'no-store'}});return NextResponse.next();}
export const config={matcher:['/api/:path*']};
