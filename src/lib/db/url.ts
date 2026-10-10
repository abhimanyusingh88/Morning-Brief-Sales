/**
 * Make a pasted DATABASE_URL forgiving. Typical copy/paste problems:
 *  - password containing @ : / # ? (must be percent-encoded, people forget)
 *  - the "[YOUR-PASSWORD]" placeholder left in, or the password wrapped in [brackets]
 *  - surrounding quotes or a trailing "# comment"
 * Errors never include the password.
 */
export function normalizeDatabaseUrl(raw: string): string {
  let s = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+#.*$/, '')
    .trim();
  if (!s) throw new Error('DATABASE_URL is empty.');
  const m = /^(postgres(?:ql)?):\/\/([^:/?#@]+):(.*)@([^@/?#]+)(\/[^?#]*)?(\?.*)?$/.exec(s);
  if (!m) {
    throw new Error(
      'DATABASE_URL is not a valid Postgres URL. Expected postgresql://USER:PASSWORD@HOST:PORT/postgres (copy it from Supabase → Connect → Transaction pooler).',
    );
  }
  const [, scheme, user, pwRaw, host, path = '/postgres', query = ''] = m;
  let pw = pwRaw;
  if (/^\[.*\]$/.test(pw)) pw = pw.slice(1, -1);
  if (pw === 'YOUR-PASSWORD')
    throw new Error(
      'DATABASE_URL still contains the [YOUR-PASSWORD] placeholder. Replace it with your database password.',
    );
  let decoded = pw;
  try {
    decoded = decodeURIComponent(pw);
  } catch {
    /* not percent-encoded; use as typed */
  }
  s = `${scheme}://${user}:${encodeURIComponent(decoded)}@${host}${path}${query}`;
  try {
    new URL(s);
  } catch {
    throw new Error('DATABASE_URL could not be parsed. Check the host and port.');
  }
  return s;
}
