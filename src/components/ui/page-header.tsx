import * as React from "react";
import { cn } from "@/lib/cn";

/** One page header for every screen: eyebrow (optional), title, one-line description, actions on the right. */
export function PageHeader({ eyebrow, title, description, actions, className }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-col justify-between gap-4 border-b border-line pb-6 sm:flex-row sm:items-start", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.025em] text-ink sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 sm:max-w-[45%] sm:justify-end sm:pt-1">{actions}</div> : null}
    </header>
  );
}
