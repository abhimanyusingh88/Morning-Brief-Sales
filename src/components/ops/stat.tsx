import * as React from "react";
import { Card } from "@/components/ui/card";

/** One summary figure: eyebrow, value, one line of context. */
export function Stat({ label, value, sub, title }: { label: string; value: React.ReactNode; sub?: React.ReactNode; title?: string }) {
  return (
    <Card className="px-4 py-3.5" title={title}>
      <p className="eyebrow">{label}</p>
      <p className="num mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
      {sub ? <p className="mt-1.5 truncate text-[12px] text-muted">{sub}</p> : <p className="mt-1.5 text-[12px]">&nbsp;</p>}
    </Card>
  );
}
