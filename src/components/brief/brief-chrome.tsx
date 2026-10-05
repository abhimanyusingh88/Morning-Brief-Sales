"use client";
import { Mail, Printer } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

/**
 * Toolbar and audit mode for the brief. Audit view outlines every figure (each is a lineage fact) and reveals the
 * "Sources and timestamps" table. Content stays server-rendered; this only owns the toggle.
 */
export function BriefChrome({ initialAudit, audit, children }: { initialAudit: boolean; audit: React.ReactNode; children: React.ReactNode }) {
  const [on, setOn] = React.useState(initialAudit);
  const toggle = (v: boolean) => {
    setOn(v);
    try {
      const u = new URL(window.location.href);
      if (v) u.searchParams.set("audit", "1"); else u.searchParams.delete("audit");
      window.history.replaceState(null, "", u);
    } catch { /* the URL is a convenience only */ }
  };
  return (
    <div data-audit={on} className="group mx-auto w-full max-w-[860px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 print:hidden">
        <Link href="/brief/email" className="inline-flex h-8 items-center gap-1.5 rounded-lg text-[13px] font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <Mail size={14} strokeWidth={1.5} /> View my email digest
        </Link>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-ink-2">
            <Switch checked={on} onCheckedChange={toggle} label="Audit view" />
            Audit view
          </label>
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={14} strokeWidth={1.5} /> Print</Button>
        </div>
      </div>
      <p role="status" className={cn("-mt-2 text-[12.5px] text-muted print:hidden", !on && "hidden")}>Audit view is on. Every figure is outlined: hover or focus it for its source, feed and time, and see the full list below the brief.</p>
      <div className={cn("space-y-6", "[&_.fact]:rounded-[3px] group-data-[audit=true]:[&_.fact]:outline group-data-[audit=true]:[&_.fact]:outline-1 group-data-[audit=true]:[&_.fact]:outline-offset-[1px] group-data-[audit=true]:[&_.fact]:outline-brand/55")}>
        {children}
      </div>
      <div className="hidden group-data-[audit=true]:block">{audit}</div>
    </div>
  );
}
