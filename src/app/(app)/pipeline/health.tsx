import { CheckCircle2, CircleAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { getDb, isEmbedded } from "@/lib/db";
import { probeModel } from "@/lib/ai/gateway";
import { getMarketProvider } from "@/lib/market";

export async function Health() {
  const db = await getDb();
  const n = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from profiles`)).catch(() => null);
  const ai = await probeModel();
  const m = getMarketProvider();
  const rows = [
    { label: "Database", ok: Boolean(n), detail: n ? (isEmbedded() ? "Embedded Postgres" : "Postgres (Supabase)") : "Not reachable" },
    { label: "Language model", ok: ai.ok, detail: ai.ok ? ai.model : ai.configured ? `Not available: ${ai.model}` : "Template writer in use" },
    { label: "Market data", ok: true, detail: m.simulated ? "Simulated pre-market feed" : m.name },
  ];
  return (
    <Card>
      <CardHeader title="System" />
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-3 px-5 py-3 text-[13px]">
            {r.ok ? <CheckCircle2 size={16} className="mt-0.5 text-up" /> : <CircleAlert size={16} className="mt-0.5 text-amber" />}
            <span><span className="block font-medium">{r.label}</span><span className="text-muted">{r.detail}</span></span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
