import { createHmac, timingSafeEqual } from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getDb } from '../db';
import { uid } from '../util/id';

/** The public demo always uses this single anonymized salesperson profile. */
const DEMO_PROFILE_ID = uid('live:sales-1');
export const COOKIE = 'mb_session';
const MAX_AGE = 60 * 60 * 12;
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set (16+ characters)');
  return 'dev-only-session-secret-not-for-production';
}
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (payload: string) => createHmac('sha256', secret()).update(payload).digest();
export function signSession(profileId: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ p: profileId, exp: Math.floor(now / 1000) + MAX_AGE }));
  return payload + '.' + b64(mac(payload));
}
export function verifySession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  const want = mac(payload);
  let got: Buffer;
  try {
    got = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const { p, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { p: string; exp: number };
    return exp * 1000 > now &&
      typeof p === 'string' &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(p) &&
      Number.isFinite(exp)
      ? p
      : null;
  } catch {
    return null;
  }
}
export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
};
export type Role = 'sales' | 'desk_head' | 'compliance' | 'admin';
export interface Me {
  id: string;
  fullName: string;
  initials: string;
  title: string;
  role: Role;
  deskId: string | null;
  deskName: string | null;
  email: string;
  hue: number;
}
export async function loadMe(profileId: string): Promise<Me | null> {
  const db = await getDb();
  const rows = await db.asUser(profileId, (q) =>
    q(
      'select p.id, p.full_name, p.initials, p.title, p.role, p.desk_id, d.name desk_name, p.email, p.avatar_hue ' +
        'from profiles p left join desks d on d.id = p.desk_id where p.id = $1 and p.is_active',
      [profileId],
    ),
  );
  const r = rows[0];
  return r
    ? {
        id: String(r.id),
        fullName: String(r.full_name),
        initials: String(r.initials),
        title: String(r.title),
        role: r.role as Role,
        deskId: (r.desk_id as string) ?? null,
        deskName: (r.desk_name as string) ?? null,
        email: String(r.email),
        hue: Number(r.avatar_hue),
      }
    : null;
}
/**
 * No sign-in screen: requests without a session use the demo desk profile. A signed session (for example a
 * future SSO hand-off) still selects its own profile. Every query stays scoped by database RLS either way.
 * Shared within one render, so the layout and the page read the profile once.
 */
export const getMe = cache(async (): Promise<Me | null> => {
  let id: string | null = null;
  try {
    id = verifySession((await cookies()).get(COOKIE)?.value);
  } catch {
    id = null;
  }
  return (id ? await loadMe(id) : null) ?? loadMe(DEMO_PROFILE_ID);
});
export function meFromRequest(req: Request): string | null {
  const m = /(?:^|;\s*)mb_session=([^;]+)/.exec(req.headers.get('cookie') ?? '');
  return verifySession(m?.[1]) ?? DEMO_PROFILE_ID;
}
