import { z } from 'zod';
import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
import { TOPICS } from '@/lib/live/types';
import { getCoverage, getPreferences, publishReports } from '@/lib/live/reports';
export const dynamic = 'force-dynamic';
const ticker = z.string().regex(/^[A-Z0-9.\-]{1,15}$/);
const Body = z.object({
  sectors: z.array(z.enum(TOPICS)).max(TOPICS.length),
  symbols: z.array(ticker).max(20),
  // Display choices from brief setup. Each is optional so an older client that sends only interests still works.
  clients: z
    .array(z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i))
    .max(200)
    .optional(),
  focusTopics: z.array(z.enum(TOPICS)).max(TOPICS.length).optional(),
  focusSymbols: z.array(ticker).max(200).optional(),
});
const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const id = meFromRequest(request);
  if (!id || !(await loadMe(id))) return Response.json({ error: 'Sign in required' }, { status: 401 });
  const b = Body.safeParse(await request.json().catch(() => null));
  if (!b.success)
    return Response.json({ error: 'Select valid topics and up to twenty stock tickers' }, { status: 400 });
  try {
    const db = await getDb();
    const [book, before] = await Promise.all([getCoverage(db, id), getPreferences(db, id)]);
    const sectors = [...new Set(b.data.sectors)],
      symbols = [...new Set(b.data.symbols)];
    // Only clients this person covers, and stocks those clients hold, can be chosen.
    const clients = [...new Set(b.data.clients ?? [])];
    if (clients.some((c) => !book.clients.some((x) => x.id === c)))
      return Response.json({ error: 'Choose clients from your own coverage' }, { status: 400 });
    const held = new Set(
      book.holdings.filter((h) => !clients.length || clients.includes(h.clientId)).map((h) => h.symbol),
    );
    const focusSymbols = [...new Set(b.data.focusSymbols ?? [])].filter((s) => held.has(s)),
      focusTopics = [...new Set(b.data.focusTopics ?? [])];
    await db.asUser(id, (q) =>
      q(
        "insert into live_preferences(profile_id,sectors,symbols,timezone,focus_clients,focus_topics,focus_symbols) values($1,$2,$3,'America/New_York',$4::uuid[],$5,$6) on conflict(profile_id) do update set sectors=excluded.sectors,symbols=excluded.symbols,timezone=excluded.timezone,focus_clients=excluded.focus_clients,focus_topics=excluded.focus_topics,focus_symbols=excluded.focus_symbols,updated_at=now()",
        [id, sectors, symbols, clients, focusTopics, focusSymbols],
      ),
    );
    // Clients, topic and stock filters only change what is shown, so they apply at once. The brief is rebuilt only
    // when the topics or watchlist that decide which news is matched have changed.
    const rebuilt = !same(sectors, before.sectors) || !same(symbols, before.symbols);
    if (rebuilt) await publishReports(db, new Date(), { profileId: id });
    return Response.json({ ok: true, rebuilt });
  } catch {
    return Response.json({ error: 'Your brief setup could not be saved. Please try again.' }, { status: 503 });
  }
}
