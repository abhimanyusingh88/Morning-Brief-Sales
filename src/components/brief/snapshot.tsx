import { cn } from "@/lib/cn";
import { F, TONE_TEXT, type Facts } from "./tpl";

export interface Tile { symbol: string; label: string; labelKey?: string; level: string; sub: string; tone: "up" | "down" | "flat" | "none" }

const nameOf = (t: Tile, facts: Facts) => (t.labelKey && facts[t.labelKey]?.display) || t.label;

/** The eleven benchmark tiles as one ruled grid (spec 3.1). `paper` is the brief; `card` is for white surfaces such as setup. */
export function SnapshotGrid({ tiles, facts, surface = "paper" }: { tiles: Tile[]; facts: Facts; surface?: "paper" | "card" }) {
  const paper = surface === "paper";
  // Eleven tiles leave one cell free in a 2, 3, 4 or 6 column grid; fill it so the ruled grid stays rectangular.
  const filler = tiles.length === 11;
  return (
    <ul className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border sm:grid-cols-3 lg:grid-cols-6", paper ? "border-paper-line bg-paper-line" : "border-line bg-line")}>
      {tiles.map((t) => (
        <li key={t.symbol} className={cn("min-w-0 px-3.5 py-3", paper ? "bg-paper" : "bg-surface")}>
          <p className="mono truncate text-[10.5px] text-muted">{nameOf(t, facts)}</p>
          <p className="num mt-1 text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink"><F k={t.level} facts={facts} /></p>
          <p className={cn("mono mt-1 text-[11.5px]", TONE_TEXT[t.tone])}><F k={t.sub} facts={facts} /></p>
        </li>
      ))}
      {filler ? <li aria-hidden className={paper ? "bg-paper-2" : "bg-sunken"} /> : null}
    </ul>
  );
}

/** The same tiles as a compact three-column list, for the Today page. */
export function SnapshotList({ tiles, facts }: { tiles: Tile[]; facts: Facts }) {
  return (
    <ul className="divide-y divide-line text-[12.5px]">
      {tiles.map((t) => (
        <li key={t.symbol} className="grid grid-cols-[minmax(0,1fr)_auto_92px] items-baseline gap-3 py-2">
          <span className="truncate text-ink-2">{nameOf(t, facts)}</span>
          <span className="num text-right font-semibold text-ink"><F k={t.level} facts={facts} /></span>
          <span className={cn("num text-right", TONE_TEXT[t.tone])}><F k={t.sub} facts={facts} /></span>
        </li>
      ))}
    </ul>
  );
}
