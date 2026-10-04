import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "../db";

/**
 * Demo sign-in: pick a persona, get a signed cookie. Identity maps 1:1 to profiles.id, which is what
 * row-level security evaluates. Swapping this for the firm's SSO changes this file only.
 */
export const COOKIE = "mb_session";
const MAX_AGE = 60 * 60 * 12;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (16+ characters)");
  return "dev-only-session-secret-not-for-production";
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (payload: string) => createHmac("sha256", secret()).update(payload).digest();

export function signSession(profileId: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ p: profileId, exp: Math.floor(now / 1000) + MAX_AGE }));
  return `${payload}.${b64(mac(payload))}`;
}

export function verifySession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const want = mac(payload);
  let got: Buffer;
  try { got = Buffer.from(sig, "base64url"); } catch { return null; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const { p, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { p: string; exp: number };
    return exp * 1000 > now && typeof p === "string" ? p : null;
  } catch { return null; }
}

export const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE };

export type Role = "sales" | "desk_head" | "compliance" | "admin";
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
  const rows = await db.asUser(profileId, (q) => q(
    `select p.id, p.full_name, p.initials, p.title, p.role, p.desk_id, d.name desk_name, p.email, p.avatar_hue
       from profiles p left join desks d on d.id = p.desk_id where p.id = $1`, [profileId]));
  const r = rows[0];
  return r ? { id: String(r.id), fullName: String(r.full_name), initials: String(r.initials), title: String(r.title), role: r.role as Role, deskId: (r.desk_id as string) ?? null, deskName: (r.desk_name as string) ?? null, email: String(r.email), hue: Number(r.avatar_hue) } : null;
}

/** The signed-in person, or null. Server components and route handlers call this. */
export async function getMe(): Promise<Me | null> {
  const id = verifySession((await cookies()).get(COOKIE)?.value);
  return id ? loadMe(id) : null;
}

export function meFromRequest(req: Request): string | null {
  const m = /(?:^|;\s*)mb_session=([^;]+)/.exec(req.headers.get("cookie") ?? "");
  return verifySession(m?.[1]);
}
