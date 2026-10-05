"use client";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { fmtDate } from "@/lib/format";

export interface RunOption { id: string; businessDate: string; status: string; trigger: string }

/** Choose which morning run the page shows. The choice lives in the URL (?run=), so a view can be shared. */
export function RunPicker({ runs, current }: { runs: RunOption[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  const id = React.useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="eyebrow">Run</label>
      <select
        id={id}
        value={current}
        onChange={(e) => router.push(`${path}?run=${e.target.value}`)}
        className="h-8 max-w-[300px] cursor-pointer rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {runs.map((r) => (
          <option key={r.id} value={r.id}>{fmtDate(r.businessDate, { weekday: "short", month: "short", day: "numeric" })} · {r.trigger} · {r.id.slice(0, 8)} · {r.status}</option>
        ))}
      </select>
    </div>
  );
}
