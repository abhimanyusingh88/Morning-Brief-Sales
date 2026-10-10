/** Screenshots of the running app for visual QA: tsx scripts/screens.ts <persona-slug> <path>... */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const uid = (seed: string) => {
  const h = createHash('md5').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

async function main() {
  const [slug, ...paths] = process.argv.slice(2);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  if (slug && slug !== '-') {
    const r = await ctx.request.post(`${BASE}/api/session`, { data: { profileId: uid(`p:${slug}`) } });
    if (!r.ok()) throw new Error(`login failed ${r.status()}`);
  }
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  for (const p of paths) {
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(500);
    const name = `.shots/${slug || 'anon'}${p.replace(/[^a-z0-9]+/gi, '_')}.png`;
    await page.screenshot({ path: name, fullPage: true });
    console.log('saved', name);
  }
  if (errors.length) console.log('console errors:\n' + errors.slice(0, 8).join('\n'));
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
