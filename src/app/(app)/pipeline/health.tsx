import { CheckCircle2, CircleAlert } from 'lucide-react';
import { getDb, isEmbedded } from '@/lib/db';
import { probeModel } from '@/lib/ai/gateway';
import { getMarketProvider } from '@/lib/market';

/** Model, database and market-data wiring, as a plain list (the page puts it in a collapsed card). */
export async function Health() {
  const db = await getDb();
  const n = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from profiles`)).catch(() => null);
  const ai = await probeModel();
  const m = getMarketProvider();
  const rows = [
    {
      label: 'Database',
      ok: Boolean(n),
      detail: n ? (isEmbedded() ? 'Embedded Postgres' : 'Postgres (Supabase)') : 'Not reachable',
    },
    {
      label: 'Language model',
      ok: ai.ok,
      detail: ai.ok ? ai.model : ai.configured ? `Not available: ${ai.model}` : 'Template writer in use',
    },
    { label: 'Market data', ok: true, detail: m.simulated ? 'Simulated pre-market feed' : m.name },
  ];
  return (
    <ul className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {rows.map((r) => (
        <li key={r.label} className="flex items-start gap-3 px-5 py-3.5 text-[13px]">
          {r.ok ? (
            <CheckCircle2 size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-up" aria-label="Healthy" />
          ) : (
            <CircleAlert
              size={16}
              strokeWidth={1.5}
              className="mt-0.5 shrink-0 text-amber"
              aria-label="Needs attention"
            />
          )}
          <span className="min-w-0">
            <span className="block font-medium">{r.label}</span>
            <span className="text-muted">{r.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
