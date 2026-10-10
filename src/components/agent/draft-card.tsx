'use client';

import { Check, Copy, ExternalLink, FileText, Mail, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { RichText } from '@/components/ui/fact';
import type { AgentDraft, FactView } from '@/lib/agent/types';
import { cn } from '@/lib/cn';

/** The draft with every {{token}} replaced by its stored display value. */
export const renderDraft = (d: AgentDraft, facts: Record<string, FactView>) =>
  d.template.replace(/\{\{([^}]+)\}\}/g, (_, k: string) => facts[k]?.display ?? '');

/**
 * Enterprise Draft Composer Card (HubSpot / CRM style).
 * Compact fonts, monochrome corporate colors, explicit sales review guardrails.
 */
export function DraftCard({
  draft,
  facts,
  compact,
}: {
  draft: AgentDraft;
  facts: Record<string, FactView>;
  compact?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const text = renderDraft(draft, facts);
  const mailto = `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(text.replace(/\n/g, '\r\n'))}`;
  const copy = () => {
    void navigator.clipboard?.writeText(`${draft.subject}\n\n${text}`).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  };

  return (
    <section aria-label="Draft email" className="mt-3 overflow-hidden rounded border border-slate-300 bg-white">
      {/* Enterprise Header Bar */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-slate-800 bg-slate-900 text-white',
          compact ? 'px-3 py-2' : 'px-4 py-2.5',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-800 text-slate-200 border border-slate-700 shrink-0">
            <Mail size={13} strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Email Draft</span>
              <span className="rounded bg-slate-800 px-1 py-0.2 text-[9.5px] font-mono text-slate-400 border border-slate-700">
                Draft Only
              </span>
            </div>
            <p className="truncate text-[12.5px] font-semibold text-white">{draft.subject}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={copy}
            aria-label="Copy draft to clipboard"
            className="h-7 px-2 bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white text-[11px]"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            asChild
            className="h-7 px-2 bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white text-[11px]"
          >
            <a href={mailto}>
              <ExternalLink size={12} />
              <span>Mail</span>
            </a>
          </Button>
        </div>
      </div>

      {/* Recipient & Subject Detail Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11.5px] text-slate-600">
        <div className="flex items-center gap-1 font-medium">
          <span className="text-slate-400">Recipient:</span>
          <span className="text-slate-900 font-semibold">{draft.to ? draft.to : 'Unassigned'}</span>
        </div>
        <div className="flex items-center gap-1 text-[10.5px] text-slate-500 font-mono">
          <FileText size={11} className="text-slate-400" />
          <span>Audited facts inserted</span>
        </div>
      </div>

      {/* Message Body Canvas */}
      <div
        className={cn(
          'whitespace-pre-line font-sans text-[12.5px] leading-relaxed text-slate-800 bg-white',
          compact ? 'px-3 py-2.5' : 'px-4 py-3',
        )}
      >
        <RichText template={draft.template} facts={facts} />
      </div>

      {/* Compliance Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 font-medium">
        <div className="flex items-center gap-1.5 text-slate-700">
          <ShieldCheck size={13} className="shrink-0 text-slate-700" aria-hidden />
          <span>
            <strong>Human Review Required:</strong> Draft requires manual sales dispatch.
          </span>
        </div>
      </div>
    </section>
  );
}
