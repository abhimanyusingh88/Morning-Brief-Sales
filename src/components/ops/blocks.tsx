import * as React from "react";
import { cn } from "@/lib/cn";

/** Monospace, scrollable text for logs and payloads. */
export function CodeBlock({ children, label, className, maxHeight = 224 }: { children: string; label: string; className?: string; maxHeight?: number }) {
  return (
    <pre tabIndex={0} aria-label={label} style={{ maxHeight }} className={cn("scroll-thin overflow-auto rounded-lg border border-line bg-sunken px-3 py-2.5 font-mono text-[11.5px] leading-[1.65] text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand", className)}>{children}</pre>
  );
}

/** A table that scrolls inside its card instead of the page. */
export function TableScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("scroll-thin overflow-x-auto", className)}>{children}</div>;
}

export const TH = "eyebrow whitespace-nowrap px-3 py-2.5 text-left font-semibold first:pl-5 last:pr-5";
export const TD = "px-3 first:pl-5 last:pr-5";
