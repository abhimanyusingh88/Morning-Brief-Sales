import Link from "next/link";
import { cn } from "@/lib/cn";
import type { RunRef } from "@/lib/data/ops";

/** Pick which morning run an operations screen reads; plain links so it works without client JS. */
export function RunPicker({ runs, current, base }: { runs: RunRef[]; current: string | null; base: string }) {
  if (runs.length < 2) return null;
  return (
    <nav aria-label="Morning run" className="flex flex-wrap items-center gap-1.5">
      <span className="eyebrow mr-1">Run</span>
      {runs.slice(0, 6).map((r) => (
        <Link key={r.id} href={`${base}?run=${r.id}`} aria-current={r.id === current ? "page" : undefined}
          className={cn("num rounded-full border px-2.5 py-1 text-[12px] font-medium", r.id === current ? "border-brand/40 bg-brand-50 text-brand-600" : "border-line-strong text-ink-2 hover:bg-sunken")}>
          {r.businessDate.slice(5)} · {new Date(r.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}
        </Link>
      ))}
    </nav>
  );
}
