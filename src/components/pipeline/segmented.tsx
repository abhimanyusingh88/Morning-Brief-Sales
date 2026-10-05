"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

/** A small segmented control (a radio group): one option is always selected. */
export function Segmented<T extends string>({ value, onChange, options, label, size = "md", className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; label: string; size?: "sm" | "md"; className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => { const j = (i + options.length) % options.length; onChange(options[j].value); refs.current[j]?.focus(); };
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg border border-line-strong bg-sunken p-0.5", className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(i + 1); }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(i - 1); }
            }}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-8 px-3 text-[13px]",
              on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
