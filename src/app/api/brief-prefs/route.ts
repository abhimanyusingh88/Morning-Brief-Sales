import { NextResponse } from 'next/server';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { getPrefsView, PrefsInput, savePrefs } from '@/lib/brief/prefs';

export const dynamic = 'force-dynamic';

async function who(req: Request) {
  const id = meFromRequest(req);
  return id ? loadMe(id) : null;
}

export async function GET(req: Request) {
  const me = await who(req);
  if (!me) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  return NextResponse.json(await getPrefsView(await getDb(), me.id));
}

/** Saved setups take effect the next business day; nothing regenerates today's brief. */
export async function PUT(req: Request) {
  const me = await who(req);
  if (!me) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  const parsed = PrefsInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid' }, { status: 400 });
  const out = await savePrefs(await getDb(), me.id, parsed.data);
  return NextResponse.json({ ok: true, ...out });
}
