"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Bot, Check, Copy, ExternalLink, Loader2, MessageSquareText, Send, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { RichText, type FactView } from "@/components/ui/fact";

interface Answer {
  template: string;
  facts: Record<string, FactView>;
  followups: string[];
  draft?: { subject: string; template: string; to: string | null };
}

interface Msg {
  role: "user" | "assistant";
  text: string;
  answer?: Answer;
  steps?: string[];
  pending?: boolean;
  error?: string;
}

const STARTERS = [
  "Who should I call first today, and why?",
  "What moved overnight across my client positions?",
  "Which open follow-ups or accounts am I behind on?",
  "Who is exposed to semiconductor and tech moves?",
];

const Ctx = React.createContext<{ ask: (q?: string) => void }>({ ask: () => {} });
export const useAsk = () => React.useContext(Ctx);

export function FloatingChatButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask Morning Brief Assistant"
      title="Ask Morning Brief Assistant"
      className="fixed bottom-5 right-5 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-all hover:bg-slate-800 border border-slate-700"
    >
      <MessageSquareText size={20} />
    </button>
  );
}

export function AskProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | undefined>();
  return (
    <Ctx.Provider value={{ ask: (q) => { setPending(q); setOpen(true); } }}>
      {children}
      <FloatingChatButton onClick={() => setOpen(true)} />
      <Drawer open={open} setOpen={setOpen} initial={pending} onConsumed={() => setPending(undefined)} />
    </Ctx.Provider>
  );
}

export function AskButton() {
  const { ask } = useAsk();
  return (
    <Button variant="dark" size="sm" onClick={() => ask()} aria-label="Ask Morning Brief" className="bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium gap-1.5 border border-slate-700">
      <MessageSquareText size={14} /> Ask Agent
    </Button>
  );
}

function Reveal({ text, facts, animate }: { text: string; facts: Record<string, FactView>; animate: boolean }) {
  const [n, setN] = React.useState(animate ? 0 : text.length);
  React.useEffect(() => {
    if (!animate) return;
    let i = 0;
    const t = setInterval(() => { i += 6; setN(i); if (i >= text.length) clearInterval(t); }, 14);
    return () => clearInterval(t);
  }, [text, animate]);

  let cut = Math.min(n, text.length);
  const open = text.lastIndexOf("{{", cut - 1);
  if (open > -1 && text.indexOf("}}", open) >= cut) cut = open;
  return (
    <div className="whitespace-pre-line font-sans text-[13px] leading-relaxed text-slate-900">
      <RichText template={text.slice(0, cut)} facts={facts} />
    </div>
  );
}

function DrawerDraftCard({ draft, facts }: { draft: NonNullable<Answer["draft"]>; facts: Record<string, FactView> }) {
  const [copied, setCopied] = React.useState(false);
  const rendered = draft.template.replace(/\{\{([^}]+)\}\}/g, (_, k: string) => facts[k]?.display ?? "");
  const mailto = `mailto:?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(rendered.replace(/\n/g, "\r\n"))}`;

  return (
    <div className="mt-2.5 rounded border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 text-white px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold text-white">{draft.subject}</p>
          <p className="text-[10.5px] text-slate-400">{draft.to ? `To: ${draft.to} · ` : ""}Draft Only</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-6.5 px-2 bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 text-[10.5px]"
            onClick={() => {
              void navigator.clipboard?.writeText(`${draft.subject}\n\n${rendered}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            asChild
            className="h-6.5 px-2 bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 text-[10.5px]"
          >
            <a href={mailto}>
              <ExternalLink size={11} />
              <span>Mail</span>
            </a>
          </Button>
        </div>
      </div>
      <div className="whitespace-pre-line px-3 py-2 text-[12.5px] leading-relaxed text-slate-800 font-sans">
        <RichText template={draft.template} facts={facts} />
      </div>
    </div>
  );
}

function Drawer({ open, setOpen, initial, onConsumed }: { open: boolean; setOpen: (v: boolean) => void; initial?: string; onConsumed: () => void }) {
  const router = useRouter();
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const thread = React.useRef<string | undefined>(undefined);
  const end = React.useRef<HTMLDivElement>(null);

  const send = React.useCallback(async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "", steps: [], pending: true }]);
    const patch = (f: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? f(m) : m)));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, threadId: thread.current }),
      });
      if (!res.ok || !res.body) throw new Error(res.status === 403 ? "Chat is available to salespeople and desk heads." : "The assistant is unavailable.");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const ev = /event: (\w+)/.exec(f)?.[1];
          const data = JSON.parse(/data: (.*)/.exec(f)?.[1] ?? "null");
          if (ev === "thread") thread.current = data.threadId;
          if (ev === "step") patch((m) => ({ ...m, steps: [...(m.steps ?? []), data.label] }));
          if (ev === "answer") patch((m) => ({ ...m, pending: false, text: data.template, answer: data }));
          if (ev === "error") patch((m) => ({ ...m, pending: false, error: data.message }));
        }
      }
    } catch (e) {
      patch((m) => ({ ...m, pending: false, error: e instanceof Error ? e.message : "Something went wrong" }));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  React.useEffect(() => { if (open && initial) { void send(initial); onConsumed(); } }, [open, initial, send, onConsumed]);
  React.useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-xs" />
        <Dialog.Content aria-describedby={undefined} className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(460px,100vw)] flex-col border-l border-slate-200 bg-white shadow-xl">
          {/* Header - Clean typography, no chip icon */}
          <div className="flex h-13 items-center justify-between border-b border-slate-800 bg-slate-900 px-3.5 text-white">
            <div>
              <Dialog.Title className="text-[13.5px] font-bold text-white tracking-tight">Morning Brief Assistant</Dialog.Title>
              <p className="text-[11px] text-slate-400">Sales & Client Intelligence</p>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="dark"
                size="sm"
                className="h-7.5 bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 text-[11.5px]"
                onClick={() => {
                  setOpen(false);
                  router.push(thread.current ? `/agent?t=${thread.current}` : "/agent");
                }}
              >
                <span>Full Workspace</span>
              </Button>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close" className="h-7.5 w-7.5 text-slate-400 hover:text-white hover:bg-slate-800">
                  <X size={16} />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-4 bg-slate-50/40">
            {!msgs.length ? (
              <div className="pt-2 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-[13.5px] font-bold text-slate-900">Sales & Client Intelligence</h3>
                  <p className="text-[12px] text-slate-600 leading-normal">
                    Ask about positions, overnight moves, or draft client notes.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Suggested Actions</p>
                  <div className="flex flex-col gap-1.5">
                    {STARTERS.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => void send(s)}
                        className="cursor-pointer rounded border border-slate-200 bg-white px-3 py-2.5 text-left text-[12.5px] font-medium text-slate-900 transition-colors hover:border-slate-400 hover:bg-slate-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto max-w-[85%] space-y-0.5">
                  <div className="rounded-lg bg-slate-900 px-3.5 py-2.5 text-[12.5px] text-white border border-slate-800">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="max-w-[96%] space-y-1">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                    <span>ASSISTANT</span>
                  </div>

                  {m.steps?.length ? (
                    <ul className="mb-1 space-y-0.5 rounded border border-slate-200 bg-slate-100/70 p-2 text-[11px] font-mono text-slate-600">
                      {m.steps.map((s, j) => (
                        <li key={j} className="flex items-center gap-1.5">
                          {m.pending && j === m.steps!.length - 1 ? (
                            <Loader2 size={11} className="animate-spin text-slate-800" />
                          ) : (
                            <Check size={11} className="text-emerald-600" />
                          )}
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  ) : m.pending ? (
                    <p className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" /> Querying enterprise feeds…
                    </p>
                  ) : null}

                  {m.error ? <p className="rounded bg-red-50 border border-red-200 p-2 text-[12px] text-red-700 font-medium">{m.error}</p> : null}

                  {m.answer ? (
                    <div className="rounded border border-slate-200 bg-white p-3.5 space-y-2">
                      <Reveal text={m.answer.template} facts={m.answer.facts} animate={i === msgs.length - 1} />
                      {m.answer.draft ? <DrawerDraftCard draft={m.answer.draft} facts={m.answer.facts} /> : null}

                      {i === msgs.length - 1 && !busy ? (
                        <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-1">
                          {m.answer.followups.map((f) => (
                            <button
                              key={f}
                              onClick={() => void send(f)}
                              className="cursor-pointer rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11.5px] font-medium text-slate-800 hover:border-slate-400 hover:bg-slate-100"
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            )}
            <div ref={end} />
          </div>

          {/* Input Form - PERFECT ALIGNMENT */}
          <form className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <div className="min-w-0 flex-1">
              <label htmlFor="chat-drawer-input" className="sr-only">Your question</label>
              <textarea
                id="chat-drawer-input"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder="Ask about calls, clients, or market tape…"
                className="h-10 min-h-[40px] max-h-24 w-full resize-none rounded border border-slate-300 bg-white px-3 py-2 text-[12.5px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-800"
              />
            </div>
            <Button
              type="submit"
              variant="dark"
              size="icon"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="h-10 w-10 shrink-0 rounded bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center"
            >
              <Send size={15} strokeWidth={2} />
            </Button>
          </form>

          <div className="border-t border-slate-200 bg-white px-3 py-1.5 flex items-center justify-between text-[10.5px] text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <ShieldCheck size={12} className="text-slate-700" /> Read-only audited data
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
