import * as React from "react";
import { Fact, type FactView } from "@/components/ui/fact";
import { TOKEN } from "./lib";

export type Facts = Record<string, FactView>;

/** "+" and "−" in a figure carry direction; anything else is flat. Colour is never the only signal because the sign is printed. */
export const toneOfDisplay = (display: string | undefined): "up" | "down" | "flat" => (display?.startsWith("+") ? "up" : display?.startsWith("−") || display?.startsWith("-") ? "down" : "flat");
export const TONE_TEXT = { up: "text-up", down: "text-down", flat: "text-muted", none: "text-muted" } as const;

/** One fact by key: a hoverable figure for numbers and times, plain text for names. Missing facts show a dash, never a guess. */
export function F({ k, facts }: { k: string | null | undefined; facts: Facts }) {
  const f = k ? facts[k] : undefined;
  if (!f) return <span aria-label="not available">—</span>;
  return f.unit === "text" ? <>{f.display}</> : <Fact f={f} />;
}

/**
 * A stored template rendered on the server: words as words, {{tokens}} as facts. Same rule as RichText, but only the
 * facts the template uses are sent to the browser.
 */
export function Tpl({ t, facts }: { t: string; facts: Facts }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of t.matchAll(TOKEN)) {
    if (m.index! > last) parts.push(t.slice(last, m.index));
    parts.push(<F key={`f${m.index}`} k={m[1]} facts={facts} />);
    last = m.index! + m[0].length;
  }
  if (last < t.length) parts.push(t.slice(last));
  return <>{parts.map((p, i) => (typeof p === "string" ? <React.Fragment key={`t${i}`}>{p}</React.Fragment> : p))}</>;
}
