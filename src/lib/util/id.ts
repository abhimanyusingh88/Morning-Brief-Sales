import { createHash } from 'node:crypto';

/** Deterministic uuid-shaped id from a seed (same shape as app.uid in SQL), so reruns replace rather than duplicate. */
export function uid(seed: string): string {
  const h = createHash('md5').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
