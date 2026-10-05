import * as React from "react";
import { cn } from "@/lib/cn";

export type Tone = "ok" | "warn" | "bad" | "idle" | "run";
const DOT: Record<Tone, string> = { ok: "bg-up", warn: "bg-amber", bad: "bg-down", idle: "bg-line-strong", run: "bg-brand live-dot" };

/** A small status marker with a label; colour is never the only signal. */
export function Status({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}
