"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Loader2, SendHorizontal, Sparkles, X } from "lucide-react";
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
interface Msg { role: "user" | "assistant"; text: string; answer?: Answer; steps?: string[]; pending?: boolean; error?: string }

const STARTERS = ["Who should I call today?", "What moved overnight?", "Which open follow-ups am I behind on?", "Who is exposed to semiconductors?"];
const Ctx = React.createContext<{ ask: (q?: string) => void }>({ ask: () => {} });
export const useAsk = () => React.useContext(Ctx);

export function AskProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState<string | undefined>();
  return (
    <Ctx.Provider value={{ ask: (q) => { setPending(q); setOpen(true); } }}>
      {children}
      <Drawer open={open} setOpen={setOpen} initial={pending} onConsumed={() => setPending(undefined)} />
    </Ctx.Provider>
  );
}

export function AskButton() {
  const { ask } = useAsk();
  return (
    <Button variant="dark" size="sm" onClick={() => ask()} aria-label="Ask Morning Brief">
      <Sparkles size={14} className="text-cyan" /> Ask
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
  // Reveal by whole tokens so a figure never appears half-typed.
  let cut = Math.min(n, text.length);
  const open = text.lastIndexOf("{{", cut - 1);
  if (open > -1 && text.indexOf("}}", open) >= cut) cut = open;
  return <div className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink"><RichText template={text.slice(0, cut)} facts={facts} /></div>;
}

function DraftCard({ draft, facts }: { draft: NonNullable<Answer["draft"]>; facts: Record<string, FactView> }) {
  const [copied, setCopied] = React.useState(false);
  const rendered = draft.template.replace(/\{\{([^}]+)\}\}/g, (_, k: string) => facts[k]?.display ?? "");
  return (
    <div className="mt-3 rounded-lg border border-line bg-bg">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="min-w-0"><p className="truncate text-[12px] font-semibold text-ink">{draft.subject}</p><p className="text-[11px] text-muted">{draft.to ? `To: ${draft.to} · ` : ""}Draft only. You send it.</p></div>
        <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(`${draft.subject}\n\n${rendered}`); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="whitespace-pre-line px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2"><RichText template={draft.template} facts={facts} /></div>
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
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, threadId: thread.current }) });
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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/20" />
        <Dialog.Content aria-describedby={undefined} className="fixed bottom-0 right-0 top-0 z-50 flex w-[min(460px,100vw)] flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="flex h-14 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="flex items-center gap-2 text-[14px] font-semibold"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-navy text-cyan"><Sparkles size={13} /></span> Ask Morning Brief</Dialog.Title>
            <div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => { setOpen(false); router.push(thread.current ? `/agent?t=${thread.current}` : "/agent"); }}>Open in Agent</Button><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X size={16} /></Button></Dialog.Close></div>
          </div>
          <div className="scroll-thin flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {!msgs.length ? (
              <div className="pt-6">
                <p className="text-[15px] font-semibold text-ink">What do you want to know?</p>
                <p className="mt-1 text-[13px] text-muted">I only see your own clients and book. Every figure I show links back to its source.</p>
                <div className="mt-4 flex flex-col gap-2">
                  {STARTERS.map((s) => <button key={s} onClick={() => void send(s)} className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-2.5 text-left text-[13.5px] text-ink-2 hover:border-brand hover:bg-brand-50">{s}</button>)}
                </div>
              </div>
            ) : null}
            {msgs.map((m, i) => m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-navy px-3.5 py-2 text-[13.5px] text-white">{m.text}</div>
            ) : (
              <div key={i} className="rise max-w-[96%]">
                {m.steps?.length ? (
                  <ul className="mb-2 space-y-1">
                    {m.steps.map((s, j) => (
                      <li key={j} className="flex items-center gap-1.5 text-[12px] text-muted">
                        {m.pending && j === m.steps!.length - 1 ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-up" />} {s}
                      </li>
                    ))}
                  </ul>
                ) : m.pending ? <p className="text-[12px] text-muted">Thinking…</p> : null}
                {m.error ? <p className="rounded-lg bg-down-50 px-3 py-2 text-[13px] text-down">{m.error}</p> : null}
                {m.answer ? (
                  <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-3 shadow-card">
                    <Reveal text={m.answer.template} facts={m.answer.facts} animate={i === msgs.length - 1} />
                    {m.answer.draft ? <DraftCard draft={m.answer.draft} facts={m.answer.facts} /> : null}
                    {i === msgs.length - 1 && !busy ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {m.answer.followups.map((f) => <button key={f} onClick={() => void send(f)} className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-2 hover:border-brand hover:text-brand-600">{f}</button>)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            <div ref={end} />
          </div>
          <form className="flex items-center gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} placeholder="Ask about your calls, clients or the tape…" className="h-10 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[14px] outline-none placeholder:text-subtle focus:border-brand focus:ring-2 focus:ring-brand-100" aria-label="Your question" />
            <Button type="submit" variant="primary" size="icon" disabled={busy || !input.trim()} aria-label="Send" className="h-10 w-10"><SendHorizontal size={16} /></Button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
