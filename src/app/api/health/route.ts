import { getDb } from '@/lib/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  let ok = false;
  try {
    const db = await getDb();
    await db.asService((q) => q('select 1'));
    ok = true;
  } catch {}
  return Response.json(
    {
      database: { ok },
      ai: { configured: Boolean(process.env.OPENAI_API_KEY) },
      market: { provider: 'verified-public-sources', simulated: false },
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
