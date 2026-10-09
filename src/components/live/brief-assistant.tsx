'use client';

import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { MessageSquare, Send, X, ArrowRight, LoaderCircle, ShieldCheck, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Report, Filters } from '@/lib/live/types';
import type { Answer } from '@/lib/live/assistant';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: Answer['sources'];
  notice?: string;
};

interface BriefAssistantProps {
  report: Report;
  filters: Filters;
}

const STARTERS = [
  "Summarize today's brief",
  "Which clients are affected?",
  "Show client holdings",
  "Suggest questions to discuss with a trader",
];

export function BriefAssistant({ report, filters }: BriefAssistantProps) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text: string) => {
    if (busy || !text.trim()) return;
    setOpen(true);
    setBusy(true);
    setError('');

    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 5000) }));
    setMessages((m) => [...m, { role: 'user', content: text.trim() }]);
    setQuestion('');

    try {
      const response = await fetch('/api/live/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report: report.id,
          client: report.clientId,
          question: text.trim(),
          filters,
          history,
        }),
        signal: AbortSignal.timeout(65000),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Assistant unavailable');
      setMessages((m) => [...m, { role: 'assistant', content: body.answer, sources: body.sources, notice: body.notice }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assistant is unavailable. Please try again.');
      setQuestion(text);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={open ? 'Close briefing assistant' : 'Open briefing assistant'}
          title="Open Brief Assistant"
          className="fixed bottom-5 right-5 z-40 flex h-13 w-13 cursor-pointer items-center justify-center rounded-full bg-slate-900 text-white shadow-xl transition-all hover:bg-slate-800 border border-slate-700 sm:bottom-6 sm:right-6"
        >
          <MessageSquare size={20} />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Content
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            input.current?.focus();
          }}
          className="fixed bottom-[80px] right-3 z-50 flex h-[min(610px,calc(100dvh-96px))] w-[calc(100%-24px)] max-w-[460px] flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl focus:outline-none sm:bottom-[84px] sm:right-6 text-slate-900"
          aria-describedby="assistant-context"
        >
          {/* Header Bar - Clean, No Chip Icon */}
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 text-white">
            <div>
              <Dialog.Title className="text-[14px] font-bold text-white tracking-tight">Brief Assistant</Dialog.Title>
              <p className="text-[11.5px] text-slate-400">News · Clients · Discussion points</p>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close briefing assistant"
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </header>

          {/* Active Client Subheader */}
          <div id="assistant-context" className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-[13px]">{report.clientName}</span>
            </div>
            {filters.topic || filters.symbol || filters.q ? (
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Filters: {[filters.topic, filters.symbol, filters.q].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </div>

          {/* Conversation Feed */}
          <div
            ref={conversation}
            className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4 bg-slate-50/40"
            role="log"
            aria-label="Brief conversation"
            aria-live="polite"
          >
            {!messages.length ? (
              <div className="py-1 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-[14px] font-bold text-slate-900">What would you like to understand?</h3>
                  <p className="text-[12.5px] text-slate-600 leading-relaxed">
                    Ask about today’s news, assigned clients, or portfolio exposure.
                  </p>
                </div>

                <div className="grid gap-2">
                  {STARTERS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      disabled={busy}
                      className="group flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-left text-[12.5px] font-medium text-slate-800 transition-all hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span>{q}</span>
                      <ArrowRight size={14} className="shrink-0 text-slate-400 group-hover:text-slate-800 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="ml-auto max-w-[85%] space-y-0.5">
                  <div className="rounded-lg bg-slate-900 px-3.5 py-2.5 text-[13px] leading-relaxed text-white border border-slate-800">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={i} className="mr-1 max-w-[96%] space-y-1">
                  <div className="text-[11px] font-bold text-slate-700">
                    <span>BRIEF ASSISTANT</span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-3.5 text-[13px] leading-relaxed text-slate-800 space-y-2">
                    {m.notice ? (
                      <p className="rounded bg-slate-100 border border-slate-200 px-2.5 py-1.5 text-[11.5px] text-slate-700">
                        {m.notice}
                      </p>
                    ) : null}

                    <p className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-900">
                      {m.content}
                    </p>

                    {m.sources?.length ? (
                      <details className="mt-2 border-t border-slate-100 pt-2 text-[11.5px]">
                        <summary className="cursor-pointer font-bold text-slate-700 flex items-center gap-1">
                          <FileText size={12} />
                          <span>Sources ({m.sources.length})</span>
                        </summary>
                        <div className="mt-1.5 space-y-1 pl-1">
                          {m.sources.map((s) => (
                            <a
                              key={s.id}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[11.5px] font-medium text-slate-700 hover:text-slate-900 underline"
                            >
                              <ExternalLink size={11} className="shrink-0 text-slate-400" />
                              <span className="truncate">{s.title}</span>
                            </a>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
              )
            )}

            {busy ? (
              <div role="status" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-[12px] text-slate-600 font-medium">
                <LoaderCircle size={14} className="animate-spin text-slate-800" />
                <span>Reading brief evidence and client context…</span>
              </div>
            ) : null}
          </div>

          {/* Bottom Form & Button Bar - PERFECT ALIGNMENT */}
          <div className="shrink-0 border-t border-slate-200 bg-slate-50 p-3 space-y-2">
            {error ? (
              <p role="alert" className="rounded bg-red-50 border border-red-200 p-2 text-[11.5px] text-red-700 font-medium">
                {error}
              </p>
            ) : null}

            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(question);
              }}
            >
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="brief-assistant-input">Question about this brief</label>
                <textarea
                  id="brief-assistant-input"
                  ref={input}
                  aria-label="Question about this brief"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  maxLength={1200}
                  rows={1}
                  placeholder="Ask about this brief..."
                  disabled={busy}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(question);
                    }
                  }}
                  className="h-10 min-h-[40px] max-h-24 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800"
                />
              </div>

              <Button
                type="submit"
                size="icon"
                variant="dark"
                aria-label="Send question"
                disabled={busy || !question.trim()}
                className="h-10 w-10 shrink-0 rounded-lg bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center"
              >
                <Send size={15} strokeWidth={2} />
              </Button>
            </form>

            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-0.5">
              <span className="flex items-center gap-1">
                <ShieldCheck size={12} className="text-slate-600" /> Verified evidence framework
              </span>
              <span>Read-only decision support</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
