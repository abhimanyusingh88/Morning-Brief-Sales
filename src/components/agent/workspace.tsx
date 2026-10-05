"use client";
import { Database, Loader2, MessageSquarePlus, Send, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/ui/fact";
import { ErrorState } from "@/components/ui/states";
import type { AgentMessage, ThreadSummary } from "@/lib/agent/types";
import { cn } from "@/lib/cn";
import { DraftCard } from "./draft-card";
import { GROUPS, groupOf, whenShort } from "./format";
import { answerToMessage, SendError, streamChat } from "./stream";

const STARTERS = ["Who should I call first this morning, and why?", "What changed overnight for my clients?", "Which of my clients have gone quiet?", "Draft a note to my top call"];
const SOURCES = ["Your coverage and client list", "Positions and recent trades", "Interaction history", "Pre-market snapshot and sector moves", "Events: earnings, dividends, news", "Restricted list (fails closed)"];

interface Props { firstName: string; initialThreads: ThreadSummary[]; initialActive: { thread: ThreadSummary; messages: AgentMessage[] } | null; clientId?: string; prefill?: string }

export function AgentWorkspace({ firstName, initialThreads, initialActive, clientId, prefill }: Props) {
  const router = useRouter();
  const [threads, setThreads] = React.useState(initialThreads);
  const [activeId, setActiveId] = React.useState<string | null>(initialActive?.thread.id ?? null);
  const [messages, setMessages] = React.useState<AgentMessage[]>(initialActive?.messages ?? []);
  const [input, setInput] = React.useState(prefill ?? "");
  const [steps, setSteps] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loadingThread, setLoadingThread] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  const client = clientId ?? initialActive?.thread.clientId ?? undefined;

  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, steps]);

  const open = async (id: string) => {
    setError(null); setLoadingThread(true);
    try {
      const r = await fetch(`/api/agent/threads/${id}`);
      if (!r.ok) throw new Error();
      const b = await r.json();
      setActiveId(id); setMessages(b.messages);
      window.history.replaceState(null, "", `/agent?t=${id}`);
    } catch { setError("Could not open that conversation."); }
    finally { setLoadingThread(false); }
  };
  const fresh = () => { setActiveId(null); setMessages([]); setError(null); setInput(""); window.history.replaceState(null, "", "/agent"); };
  const remove = async (id: string) => {
    const r = await fetch(`/api/agent/threads/${id}`, { method: "DELETE" });
    if (!r.ok) return;
    setThreads((t) => t.filter((x) => x.id !== id));
    if (id === activeId) fresh();
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true); setError(null); setSteps([]); setInput("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: message, facts: {}, meta: {}, createdAt: new Date().toISOString() }]);
    try {
      await streamChat("/api/agent/chat", { message, threadId: activeId ?? undefined, clientId: activeId ? undefined : client }, (e) => {
        if (e.type === "thread") {
          setActiveId(e.data.threadId);
          window.history.replaceState(null, "", `/agent?t=${e.data.threadId}`);
          setThreads((t) => [{ id: e.data.threadId, title: e.data.title, createdAt: e.data.updatedAt, updatedAt: e.data.updatedAt, clientId: e.data.clientId, clientName: e.data.clientName, preview: message }, ...t.filter((x) => x.id !== e.data.threadId)]);
        } else if (e.type === "step") setSteps((s) => [...s, e.label]);
        else if (e.type === "answer") setMessages((m) => [...m, answerToMessage(e.data)]);
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof SendError ? err.message : "Something went wrong. Please retry.");
    } finally { setBusy(false); setSteps([]); }
  };

  const grouped = GROUPS.map((g) => ({ g, items: threads.filter((t) => groupOf(t.updatedAt) === g) })).filter((x) => x.items.length);

  return (
    <div className="grid h-[calc(100dvh-128px)] min-h-[440px] gap-5 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)_240px]">
      <aside aria-label="Conversations" className="flex min-h-0 flex-col rounded-[12px] border border-line bg-surface max-lg:hidden">
        <div className="border-b border-line p-3"><Button variant="secondary" className="w-full" onClick={fresh}><MessageSquarePlus size={15} strokeWidth={1.5} /> New chat</Button></div>
        <div className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 ? <p className="px-3 py-6 text-center text-[12.5px] text-muted">No conversations yet. Ask the agent something to start one.</p> : grouped.map(({ g, items }) => (
            <div key={g} className="mb-3">
              <p className="eyebrow px-2 py-1">{g}</p>
              {items.map((t) => (
                <div key={t.id} className={cn("group flex items-start gap-1 rounded-lg", t.id === activeId ? "bg-brand-50" : "hover:bg-sunken")}>
                  <button type="button" onClick={() => open(t.id)} className="min-w-0 flex-1 cursor-pointer px-2.5 py-2 text-left">
                    <p className="truncate text-[13px] font-medium text-ink">{t.title}</p>
                    <p className="truncate text-[12px] text-muted">{t.clientName ? `${t.clientName} · ` : ""}{t.preview || "No messages"}</p>
                  </button>
                  <span className="num pt-2.5 text-[11px] text-muted group-hover:hidden">{whenShort(t.updatedAt)}</span>
                  <button type="button" onClick={() => remove(t.id)} aria-label={`Delete ${t.title}`} className="hidden cursor-pointer p-2 text-muted hover:text-down group-hover:block"><Trash2 size={14} strokeWidth={1.5} /></button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <section aria-label="Conversation" className="flex min-h-0 flex-col rounded-[12px] border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line p-3 lg:hidden">
          <label htmlFor="conversation-picker" className="sr-only">Open conversation</label>
          <select id="conversation-picker" value={activeId ?? ""} disabled={busy || loadingThread} onChange={e => e.target.value ? void open(e.target.value) : fresh()} className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-[13px]">
            <option value="">New conversation</option>
            {threads.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <Button size="icon" variant="secondary" onClick={fresh} disabled={busy} aria-label="New conversation"><MessageSquarePlus size={16} /></Button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {loadingThread ? <p className="text-[13px] text-muted" aria-busy>Opening conversation…</p> : messages.length === 0 ? (
            <div className="mx-auto max-w-lg pt-10 text-center">
              <h1 className="serif text-[28px] text-ink">Good morning, {firstName}.</h1>
              <p className="mt-1.5 text-[13.5px] text-muted">Ask about your book. Every figure comes from your own data with its source and time; the agent drafts, you send.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">{STARTERS.map((s) => <button key={s} type="button" onClick={() => send(s)} className="cursor-pointer rounded-lg border border-line-strong px-3 py-2.5 text-left text-[13px] text-ink-2 hover:bg-sunken">{s}</button>)}</div>
            </div>
          ) : messages.map((m) => m.role === "user" ? (
            <div key={m.id} className="flex justify-end"><p className="max-w-[80%] rounded-2xl rounded-br-md bg-navy px-3.5 py-2 text-[13.5px] text-white">{m.content}</p></div>
          ) : (
            <div key={m.id} className="max-w-[92%]">
              {m.meta.steps?.length ? <details className="mb-2 text-[12px] text-muted"><summary className="cursor-pointer select-none">How I got this · {m.meta.steps.length} steps</summary><ol className="mt-1 list-decimal space-y-0.5 pl-5">{m.meta.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></details> : null}
              <div className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2"><RichText template={m.content} facts={m.facts} /></div>
              {m.meta.draft ? <DraftCard draft={m.meta.draft} facts={m.facts} compact /> : null}
              {m.meta.followups?.length ? <div className="mt-2.5 flex flex-wrap gap-1.5">{m.meta.followups.map((f) => <button key={f} type="button" disabled={busy} onClick={() => send(f)} className="cursor-pointer rounded-full border border-line-strong px-2.5 py-1 text-[12px] text-ink-2 hover:bg-sunken disabled:opacity-50">{f}</button>)}</div> : null}
            </div>
          ))}
          {busy ? <div className="flex items-start gap-2 text-[12.5px] text-muted" aria-live="polite"><Loader2 size={14} className="mt-0.5 animate-spin" /><ul>{steps.length ? steps.map((s, i) => <li key={i}>{s}</li>) : <li>Thinking…</li>}</ul></div> : null}
          {error ? <ErrorState title="That didn't go through" body={error} /> : null}
          <div ref={endRef} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex items-end gap-2 border-t border-line p-3">
          <label htmlFor="agent-input" className="sr-only">Ask the agent</label>
          <textarea id="agent-input" rows={1} value={input} maxLength={500} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            placeholder={client ? "Ask about this client…" : "Ask about your book…"} className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-brand focus:ring-2 focus:ring-brand-100" />
          <Button type="submit" variant="primary" disabled={busy || !input.trim()} aria-label="Send question"><Send size={14} strokeWidth={1.5} /></Button>
        </form>
      </section>

      <aside aria-label="Connected sources" className="self-start rounded-[12px] border border-line bg-surface p-4 max-2xl:hidden">
        <p className="eyebrow flex items-center gap-1.5"><Database size={13} strokeWidth={1.5} /> Connected sources</p>
        <ul className="mt-2.5 space-y-1.5 text-[12.5px] text-ink-2">{SOURCES.map((s) => <li key={s} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-up" />{s}</li>)}</ul>
        <p className="mt-3 flex gap-1.5 border-t border-line pt-3 text-[12px] text-muted"><ShieldCheck size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" />Read-only and limited to your own book. The agent never sends anything to a client.</p>
      </aside>
    </div>
  );
}
