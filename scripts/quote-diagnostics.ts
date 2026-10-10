import { fetchSource } from '../src/lib/live/fetch';
async function main() {
  const r = await fetchSource('https://finance.yahoo.com/quote/%5ERUT/', AbortSignal.timeout(12000), true);
  const candidates: unknown[] = [];
  function walk(v: unknown, path: string, depth = 0) {
    if (depth > 30) return;
    if (typeof v === 'string' && /^[\s]*[\[{]/.test(v)) {
      try {
        walk(JSON.parse(v), path + '.json', depth + 1);
      } catch {}
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '.' + i, depth + 1));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (o.symbol === '^RUT' && o.regularMarketPrice != null && o.regularMarketTime != null)
        candidates.push({ path, keys: Object.keys(o), quote: o });
      else Object.entries(o).forEach(([k, x]) => walk(x, path + '.' + k, depth + 1));
    }
  }
  for (const [i, m] of [...r.text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
    try {
      walk(JSON.parse(m[1]), 'script' + i);
    } catch {}
  }
  console.log(JSON.stringify(candidates, null, 2));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'unavailable');
  process.exitCode = 1;
});
