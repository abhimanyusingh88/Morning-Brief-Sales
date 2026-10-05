import * as React from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 rounded-[12px] border border-line bg-surface shadow-card", className)} {...p} />;
}
export function CardHeader({ title, sub, right, className }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {sub ? <p className="mt-1 text-xs leading-relaxed text-muted">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}
export const CardBody = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("p-5", className)} {...p} />;
