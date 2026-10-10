import { Receiver, Client } from '@upstash/qstash';
export function appOrigin(): string | null {
  const raw = process.env.APP_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash)
      return null;
    return u.origin;
  } catch {
    return null;
  }
}
export async function verifyDelivery(request: Request, body: string): Promise<boolean> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY,
    origin = appOrigin(),
    signature = request.headers.get('upstash-signature');
  if (!currentSigningKey || !nextSigningKey || !origin || !signature) return false;
  try {
    return await new Receiver({ currentSigningKey, nextSigningKey }).verify({
      signature,
      body,
      url: origin + '/api/live/work',
    });
  } catch {
    return false;
  }
}
export function scheduler() {
  const token = process.env.QSTASH_TOKEN;
  if (!token) throw new Error('QSTASH_NOT_CONFIGURED');
  return new Client({ token });
}
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !origin ? process.env.NODE_ENV !== 'production' : origin === new URL(request.url).origin;
}
