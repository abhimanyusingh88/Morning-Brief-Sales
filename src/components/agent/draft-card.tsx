"use client";
import { Check, Copy, Mail, ShieldCheck } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/fact";
import type { AgentDraft, FactView } from "@/lib/agent/types";
import { cn } from "@/lib/cn";

/** The draft with every {{token}} replaced by its stored display value (what you would paste into an email). */
export const renderDraft = (d: AgentDraft, facts: Record<string, FactView>) => d.template.replace(/\{\{([^}]+)\}\}/g, (_, k: string) => facts[k]?.display ?? "");

/**
 * A draft for the person to review. The only things it can do are copy the text or hand it to the person's own mail app
 * (a mailto: link with no recipient address, so nothing is addressed or sent from here). The agent never sends.
 */
export function DraftCard({ draft, facts, compact }: { draft: AgentDraft; facts: Record<string, FactView>; compact?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const text = renderDraft(draft, facts);
  const mailto = `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(text.replace(/\n/g, "\r\n"))}`;
  const copy = () => {
    void navigator.clipboard?.writeText(`${draft.subject}\n\n${text}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => undefined);
  };
  return (
    <section aria-label="Draft email" className="mt-3 overflow-hidden rounded-[12px] border border-line bg-bg">
      <div className={cn("flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line bg-surface", compact ? "px-3 py-2.5" : "px-4 py-3")}>
        <div className="flex min-w-0 items-start gap-2.5">
          <Mail size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{draft.subject}</p>
            <p className="text-[12.5px] text-muted">{draft.to ? <>To <span className="text-ink-2">{draft.to}</span></> : "Recipient not set"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="secondary" onClick={copy} aria-label="Copy draft to clipboard">
            {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="secondary" asChild>
            <a href={mailto}><Mail size={14} strokeWidth={1.5} /> Open in my mail app</a>
          </Button>
        </div>
      </div>
      <div className={cn("whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2", compact ? "px-3 py-3" : "px-4 py-3.5")}><RichText template={draft.template} facts={facts} /></div>
      <p className={cn("flex items-center gap-1.5 border-t border-line text-[12.5px] text-muted", compact ? "px-3 py-2" : "px-4 py-2.5")}>
        <ShieldCheck size={14} strokeWidth={1.5} className="shrink-0" aria-hidden /> Draft — you review and send. The agent never sends anything.
      </p>
    </section>
  );
}
