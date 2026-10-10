import { resolvePublisherUrl, extractMainText, matchesStory } from '../src/lib/live/resolve';
import { fetchPublic } from '../src/lib/live/fetch';
/** Diagnostic: resolve and extract one article URL. Usage: tsx scripts/reader-check.ts <url> "<title>" */
async function main() {
  const [url, title = ''] = process.argv.slice(2);
  const s = AbortSignal.timeout(20000);
  const target = await resolvePublisherUrl(url, s);
  const page = await fetchPublic(target, s);
  const text = extractMainText(page.text);
  console.log({ target, chars: text.length, matches: matchesStory(page.text, text, title) });
  console.log(text.slice(0, 500));
}
main().catch((e) => {
  console.error('failed', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
