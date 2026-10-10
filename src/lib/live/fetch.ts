import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
export const ALLOWED_HOSTS = new Set([
  'home.treasury.gov',
  'cdn-api.cboe.com',
  'www.eia.gov',
  'finance.yahoo.com',
  'newsroom.nvidia.com',
  'nvidianews.nvidia.com',
  'www.intel.com',
  'www.marvell.com',
  'ir.marvell.com',
  'ir.tesla.com',
  'www.tesla.com',
  'www.aboutamazon.com',
  'press.aboutamazon.com',
  'www.federalreserve.gov',
  'www.bls.gov',
  'www.bea.gov',
  'www.whitehouse.gov',
  'www.sec.gov',
  'www.reuters.com',
  'apnews.com',
  'www.cnbc.com',
  'www.energy.gov',
  'www.defense.gov',
  'www.state.gov',
  'www.microsoft.com',
  'blogs.microsoft.com',
  'openai.com',
  'www.anthropic.com',
  'blog.google',
  'feeds.bbci.co.uk',
  'www.bbc.co.uk',
  'www.bbc.com',
  'news.google.com',
  'feeds.content.dowjones.io',
  'feeds.a.dj.com',
  'www.marketwatch.com',
  'www.wsj.com',
  'oilprice.com',
  'www.coindesk.com',
  'feeds.finance.yahoo.com',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'nfs.faireconomy.media',
]);
export function sourceUrl(raw: string): URL {
  const u = new URL(raw);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    (u.port && u.port !== '443') ||
    !ALLOWED_HOSTS.has(u.hostname) ||
    isIP(u.hostname)
  )
    throw new Error('SOURCE_NOT_ALLOWED');
  u.hash = '';
  return u;
}
export function publicAddress(a: string): boolean {
  if (isIP(a) === 4) {
    const [x, y] = a.split('.').map(Number);
    return !(
      x === 0 ||
      x === 10 ||
      x === 127 ||
      x >= 224 ||
      (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && (y === 168 || y === 0)) ||
      (x === 100 && y >= 64 && y <= 127) ||
      (x === 198 && (y === 18 || y === 19))
    );
  }
  if (isIP(a) === 6) return /^(2|3)/i.test(a) && !/^2001:(db8|0:)/i.test(a);
  return false;
}
const AGENT = 'MorningBrief/1.0 (public-source verification)';
async function download(
  u: URL,
  signal: AbortSignal,
  max: number,
  check: (raw: string) => URL = sourceUrl,
  agent = AGENT,
): Promise<{ text: string; url: string }> {
  for (let n = 0; n < 4; n++) {
    const addresses = await lookup(u.hostname, { all: true });
    if (!addresses.length || addresses.some((x) => !publicAddress(x.address)))
      throw new Error('SOURCE_ADDRESS_REJECTED');
    const r = await fetch(u, {
      redirect: 'manual',
      signal,
      headers: {
        'User-Agent': agent,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xml,text/csv,application/json;q=0.8',
      },
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const next = r.headers.get('location');
      await r.body?.cancel();
      if (!next) throw new Error('SOURCE_REDIRECT');
      u = check(new URL(next, u).href);
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error('SOURCE_HTTP_' + r.status);
    }
    if (Number(r.headers.get('content-length') ?? 0) > max) {
      await r.body?.cancel();
      throw new Error('SOURCE_TOO_LARGE');
    }
    const reader = r.body?.getReader();
    if (!reader) throw new Error('SOURCE_EMPTY');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) throw new Error('SOURCE_TOO_LARGE');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return { text: Buffer.concat(chunks).toString('utf8'), url: u.href };
  }
  throw new Error('SOURCE_REDIRECT_LIMIT');
}
export function robotsAllows(text: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let g = { agents: [] as string[], rules: [] as { allow: boolean; path: string }[] };
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(user-agent|allow|disallow)\s*:\s*(.*?)\s*(?:#.*)?$/i.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(),
      v = m[2].trim();
    if (k === 'user-agent') {
      if (g.rules.length) {
        groups.push(g);
        g = { agents: [], rules: [] };
      }
      g.agents.push(v.toLowerCase());
    } else if (v) g.rules.push({ allow: k === 'allow', path: v });
  }
  groups.push(g);
  const exact = groups.filter((x) => x.agents.some((a) => a !== '*' && 'morningbrief'.includes(a)));
  const selected = exact.length ? exact : groups.filter((x) => x.agents.includes('*'));
  let winner: { length: number; allow: boolean } | null = null;
  for (const rule of selected.flatMap((x) => x.rules)) {
    const regex =
      '^' +
      rule.path
        .split('*')
        .map((x) => x.replace(/[.+?^{}()|[\]\\]/g, '\\$&'))
        .join('.*')
        .replace(/\\\$$/, '$');
    if (new RegExp(regex).test(path)) {
      const length = rule.path.replace(/\*/g, '').length;
      if (!winner || length > winner.length || (length === winner.length && rule.allow))
        winner = { length, allow: rule.allow };
    }
  }
  return winner?.allow ?? true;
}
const robotsCache = new Map<string, { at: number; text: string }>();
export async function fetchSource(
  raw: string,
  signal: AbortSignal,
  document = false,
): Promise<{ text: string; url: string }> {
  const u = sourceUrl(raw);
  if (document) {
    let cached = robotsCache.get(u.hostname);
    if (!cached || Date.now() - cached.at > 3600000) {
      try {
        const r = await download(new URL('/robots.txt', u), signal, 200000);
        cached = { at: Date.now(), text: r.text };
        robotsCache.set(u.hostname, cached);
      } catch (e) {
        if (e instanceof Error && e.message === 'SOURCE_HTTP_404') cached = { at: Date.now(), text: '' };
        else throw new Error('SOURCE_ROBOTS_UNAVAILABLE');
      }
    }
    if (!robotsAllows(cached.text, u.pathname + u.search)) throw new Error('SOURCE_ROBOTS_DISALLOW');
  }
  const result = await download(u, signal, document ? 2500000 : 5000000);
  if (document && new URL(result.url).hostname !== u.hostname) {
    return fetchSource(result.url, signal, true);
  }
  return result;
}

/** Any public HTTPS publisher page (article reading only). Same SSRF guards: public DNS answers only, no
 * credentials, default port, no IP literals; robots.txt is honoured and size is capped. */
export function openUrl(raw: string): URL {
  const u = new URL(raw);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    (u.port && u.port !== '443') ||
    isIP(u.hostname) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) ||
    /(^|\.)(localhost|local|internal)$/i.test(u.hostname)
  )
    throw new Error('SOURCE_NOT_ALLOWED');
  u.hash = '';
  return u;
}
const READER_AGENT = 'Mozilla/5.0 (compatible; MorningBrief/1.0; +article-reader)';
export async function fetchPublic(raw: string, signal: AbortSignal): Promise<{ text: string; url: string }> {
  const u = openUrl(raw);
  let cached = robotsCache.get(u.hostname);
  if (!cached || Date.now() - cached.at > 3600000) {
    try {
      const r = await download(new URL('/robots.txt', u), signal, 200000, openUrl, READER_AGENT);
      cached = { at: Date.now(), text: r.text };
    } catch {
      cached = { at: Date.now(), text: '' };
    }
    robotsCache.set(u.hostname, cached);
  }
  if (!robotsAllows(cached.text, u.pathname + u.search)) throw new Error('SOURCE_ROBOTS_DISALLOW');
  return download(u, signal, 3000000, openUrl, READER_AGENT);
}
