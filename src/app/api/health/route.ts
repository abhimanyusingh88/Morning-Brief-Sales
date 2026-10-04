import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { probeModel } from "@/lib/ai/gateway";
import { getMarketProvider } from "@/lib/market";

export const dynamic = "force-dynamic";

/** Never returns secrets. Used by the pipeline monitor and for a quick "is everything wired" check. */
export async function GET() {
  const db = await getDb().catch(() => null);
  let database: { ok: boolean; detail: string } = { ok: false, detail: "not connected" };
  if (db) {
    try {
      const r = await db.asService((q) => q<{ n: number }>(`select count(*)::int n from profiles`));
      database = { ok: true, detail: `${r[0].n} profiles; ${process.env.DEV_DB === "pglite" ? "embedded database" : "postgres"}` };
    } catch (e) {
      database = { ok: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }
  const market = getMarketProvider();
  return NextResponse.json({ database, ai: await probeModel(), market: { provider: market.name, simulated: market.simulated } });
}
