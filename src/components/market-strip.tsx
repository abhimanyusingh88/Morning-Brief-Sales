import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Tile } from "@/lib/data/brief";
import { fmtLevel, fmtMove } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";

const LABEL: Record<string, string> = { SPX: "Large cap index", NDX: "Tech growth index", UST10Y: "UST 10Y yield", UST2Y: "UST 2Y yield", VIX: "Volatility", DXY: "Dollar index", WTI: "Crude (WTI)", CDXIG: "IG credit index" };

/** Equity index moves are shown in basis points everywhere (Build Specification 3.1); the instrument master stores them as percent. */
const INDEX_SYMBOLS = new Set(["SPX", "NDX"]);

export function MarketStrip({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      {tiles.map((t) => {
        // For yields and spreads, "up" is worse for holders; colour follows the move direction, not a judgement.
        const dir = Math.abs(t.chg) < 0.005 ? 0 : t.chg > 0 ? 1 : -1;
        const hot = t.z >= 1.5;
        return (
          <Card key={t.symbol} className={cn("px-3.5 py-3", hot && "border-amber/40")}>
            <p className="truncate text-[11px] font-medium text-muted" title={`${t.name} · ${t.source}`}>{LABEL[t.symbol] ?? t.name}</p>
            <p className="num mt-1 text-[17px] font-semibold tracking-[-0.01em] text-ink">{fmtLevel(t.assetClass, t.last, t.decimals)}</p>
            <p className={cn("num mt-0.5 flex items-center gap-0.5 text-[12px] font-semibold", dir > 0 ? "text-up" : dir < 0 ? "text-down" : "text-muted")}>
              {dir > 0 ? <ArrowUpRight size={13} /> : dir < 0 ? <ArrowDownRight size={13} /> : <Minus size={13} />}
              {INDEX_SYMBOLS.has(t.symbol) && t.unit === "pct" ? fmtMove("bp", t.chg * 100) : fmtMove(t.unit, t.chg)}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
