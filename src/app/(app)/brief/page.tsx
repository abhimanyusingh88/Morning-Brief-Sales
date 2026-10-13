import { redirect, notFound } from 'next/navigation';
import { after } from 'next/server';
import { getMe } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import {
  focusCoverage,
  getCoverage,
  getDayReport,
  getFocus,
  getReport,
  listHistory,
  parseFilters,
  validDay,
  validId,
} from '@/lib/live/reports';
import { businessDate } from '@/lib/live/time';
import { livePanels, pastPanels } from '@/lib/live/snapshots';
import { BriefView } from '@/components/live/brief-view';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Market brief' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await getMe();
  if (!me) redirect('/login');
  const raw = await searchParams;
  const p = new URLSearchParams(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'));
  const client = p.get('client') || null;
  const db = await getDb();
  // The brief shows the clients chosen in brief setup; the published brief itself still covers the whole book.
  const coverage = focusCoverage(await getCoverage(db, me.id), await getFocus(db, me.id));
  if (client && (!validId(client) || !coverage.clients.some((c) => c.id === client))) notFound();
  const today = businessDate(),
    day = p.get('date') || today;
  if (!validDay(day) || day > today) notFound();
  // History is independent of the brief itself, so it loads alongside it rather than before it.
  const historyLoad = listHistory(db, me.id, client);
  // A past day shows its published brief and the charts and calendar saved that day, never today's quotes.
  if (day < today) {
    const [report, history] = await Promise.all([getDayReport(db, me.id, client, day), historyLoad]),
      held = report?.holdings ?? coverage.holdings.filter((h) => !client || h.clientId === client);
    const market = await pastPanels(
      db,
      me.id,
      held.map((h) => h.symbol),
      day,
    ).catch(() => undefined);
    return (
      <BriefView
        market={market}
        report={report}
        clients={coverage.clients}
        holdings={held}
        clientId={client}
        filters={parseFilters(p)}
        date={day}
        today={today}
        history={history}
      />
    );
  }
  const symbols = [...new Set(coverage.holdings.filter((h) => !client || h.clientId === client).map((h) => h.symbol))];
  // Public market data only: symbols are sent to the quote provider, never client names or positions.
  // Live panels are saved as fetched; a failed source falls back to today's last saved copy.
  const [report, market, history] = await Promise.all([
    getReport(db, me.id, client),
    // Charts saved in the last few minutes are shown at once and renewed after the response, so filters stay quick.
    livePanels(db, me.id, symbols, new Date(), after),
    historyLoad,
  ]);
  return (
    <BriefView
      report={report}
      clients={coverage.clients}
      holdings={coverage.holdings}
      clientId={client}
      filters={parseFilters(p)}
      date={today}
      today={today}
      history={history}
      market={market}
    />
  );
}
