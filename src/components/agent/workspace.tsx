"use client";

import {
  AlertCircle,
  Bot,
  Check,
  ChevronRight,
  Database,
  Download,
  FileText,
  Layers,
  Loader2,
  Lock,
  Mail,
  MessageSquarePlus,
  PhoneCall,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  TrendingUp,
} from "lucide-react";
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

interface StarterItem {
  icon: React.ReactNode;
  category: string;
  prompt: string;
  tag: string;
}

const CATEGORIZED_STARTERS: StarterItem[] = [
  {
    icon: <PhoneCall size={14} className="text-slate-700" />,
    category: "Outreach Priority",
    prompt: "Who should I call first this morning, and why?",
    tag: "Priority",
  },
  {
    icon: <TrendingUp size={14} className="text-slate-700" />,
    category: "Market Movement",
    prompt: "What changed overnight for my clients?",
    tag: "Tape Intel",
  },
  {
    icon: <AlertCircle size={14} className="text-slate-700" />,
    category: "Account Risk",
    prompt: "Which of my clients have gone quiet?",
    tag: "Retention",
  },
  {
    icon: <Mail size={14} className="text-slate-700" />,
    category: "Draft Communication",
    prompt: "Draft a note to my top call regarding recent market moves",
    tag: "Outreach",
  },
];

interface SourceFeed {
  name: string;
  description: string;
  badge: string;
}

const ENTERPRISE_SOURCES: SourceFeed[] = [
  { name: "Client Book & Coverage Roster", description: "Assigned accounts and contacts", badge: "Synced" },
  { name: "Positions & Executed Trades", description: "Real-time holdings and history", badge: "Real-Time" },
  { name: "CRM & Interaction Logs", description: "Notes, calls, and email history", badge: "Synced" },
  { name: "Pre-Market Tape & Sector Feeds", description: "Live macro moves and earnings", badge: "Streaming" },
  { name: "Corporate Events & Radar", description: "Earnings and dividend calendar", badge: "Calendar" },
  { name: "Compliance & Restricted List", description: "Restricted securities list", badge: "Fails-Closed" },
];

interface Props {
  firstName: string;
  initialThreads: ThreadSummary[];
  initialActive: { thread: ThreadSummary; messages: AgentMessage[] } | null;
  clientId?: string;
  prefill?: string;
}

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
  const [searchQuery, setSearchQuery] = React.useState("");
  const [copiedThread, setCopiedThread] = React.useState(false);

  const endRef = React.useRef<HTMLDivElement>(null);
  const client = clientId ?? initialActive?.thread.clientId ?? undefined;

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, steps]);

  const open = async (id: string) => {
    setError(null);
    setLoadingThread(true);
    try {
      const r = await fetch(`/api/agent/threads/${id}`);
      if (!r.ok) throw new Error();
      const b = await r.json();
      setActiveId(id);
      setMessages(b.messages);
      window.history.replaceState(null, "", `/agent?t=${id}`);
    } catch {
      setError("Could not open that conversation.");
    } finally {
      setLoadingThread(false);
    }
  };

  const fresh = () => {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setInput("");
    window.history.replaceState(null, "", "/agent");
  };

  const remove = async (id: string) => {
    const r = await fetch(`/api/agent/threads/${id}`, { method: "DELETE" });
    if (!r.ok) return;
    setThreads((t) => t.filter((x) => x.id !== id));
    if (id === activeId) fresh();
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setSteps([]);
    setInput("");
    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: message,
        facts: {},
        meta: {},
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      await streamChat(
        "/api/agent/chat",
        { message, threadId: activeId ?? undefined, clientId: activeId ? undefined : client },
        (e) => {
          if (e.type === "thread") {
            setActiveId(e.data.threadId);
            window.history.replaceState(null, "", `/agent?t=${e.data.threadId}`);
            setThreads((t) => [
              {
                id: e.data.threadId,
                title: e.data.title,
                createdAt: e.data.updatedAt,
                updatedAt: e.data.updatedAt,
                clientId: e.data.clientId,
                clientName: e.data.clientName,
                preview: message,
              },
              ...t.filter((x) => x.id !== e.data.threadId),
            ]);
          } else if (e.type === "step") setSteps((s) => [...s, e.label]);
          else if (e.type === "answer") setMessages((m) => [...m, answerToMessage(e.data)]);
        }
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof SendError ? err.message : "Something went wrong. Please retry.");
    } finally {
      setBusy(false);
      setSteps([]);
    }
  };

  const exportConversation = () => {
    if (!messages.length) return;
    const formatted = messages
      .map((m) => `${m.role === "user" ? "USER" : "AGENT"} (${new Date(m.createdAt).toLocaleTimeString()}):\n${m.content}\n`)
      .join("\n---\n\n");
    void navigator.clipboard?.writeText(formatted).then(() => {
      setCopiedThread(true);
      setTimeout(() => setCopiedThread(false), 2000);
    });
  };

  const filteredThreads = searchQuery.trim()
    ? threads.filter(
        (t) =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (t.clientName && t.clientName.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (t.preview && t.preview.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : threads;

  const grouped = GROUPS.map((g) => ({
    g,
    items: filteredThreads.filter((t) => groupOf(t.updatedAt) === g),
  })).filter((x) => x.items.length);

  const activeThread = threads.find((t) => t.id === activeId);

  return (
    <div className="grid h-[calc(100dvh-88px)] min-h-[500px] gap-3.5 lg:grid-cols-[250px_minmax(0,1fr)] 2xl:grid-cols-[250px_minmax(0,1fr)_270px] text-slate-900">
      {/* LEFT SIDEBAR */}
      <aside aria-label="Conversations Manager" className="flex min-h-0 flex-col rounded-md border border-slate-200 bg-white max-lg:hidden">
        <div className="border-b border-slate-200 p-3 space-y-2.5 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-slate-900">Conversations</h2>
            <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-mono text-slate-700">
              {threads.length}
            </span>
          </div>

          <Button
            variant="dark"
            className="w-full h-8 justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium rounded"
            onClick={fresh}
          >
            <MessageSquarePlus size={14} /> New Conversation
          </Button>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter threads..."
              className="w-full h-7.5 rounded border border-slate-200 bg-white pl-7 pr-2.5 text-[12px] text-slate-800 placeholder:text-slate-400 outline-none focus:border-slate-800"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2.5">
          {filteredThreads.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12px] text-slate-500">
              No matching conversations
            </div>
          ) : (
            grouped.map(({ g, items }) => (
              <div key={g} className="space-y-0.5">
                <p className="px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">{g}</p>
                {items.map((t) => {
                  const isActive = t.id === activeId;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "group relative flex items-start justify-between rounded transition-colors border",
                        isActive
                          ? "border-slate-800 bg-slate-100 text-slate-900 font-medium border-l-2 border-l-slate-900"
                          : "border-transparent text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => open(t.id)}
                        className="min-w-0 flex-1 cursor-pointer p-2 text-left"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-[12.5px] font-semibold text-slate-900">{t.title}</p>
                          <span className="shrink-0 text-[10px] text-slate-400 font-mono">{whenShort(t.updatedAt)}</span>
                        </div>
                        {t.clientName ? (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] text-slate-600 font-mono">
                            <span className="truncate">{t.clientName}</span>
                          </div>
                        ) : null}
                      </button>

                      <button
                        type="button"
                        onClick={() => remove(t.id)}
                        aria-label={`Delete ${t.title}`}
                        className="hidden group-hover:flex cursor-pointer p-1.5 text-slate-400 hover:text-slate-900 self-center"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-200 p-2.5 bg-slate-50 text-[11px] text-slate-500 flex items-center gap-1.5 font-mono">
          <Lock size={12} className="text-slate-400" />
          <span>SOC 2 Read-Only Mode</span>
        </div>
      </aside>

      {/* CENTER MAIN CANVAS */}
      <section aria-label="Conversation Viewport" className="flex min-h-0 flex-col rounded-md border border-slate-200 bg-white overflow-hidden">
        {/* Top Header - No Chip Icon */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 text-white px-4 py-2.5 shrink-0">
          <div>
            <h1 className="text-[13.5px] font-bold text-white tracking-tight">Agent Workspace</h1>
            <p className="text-[11px] text-slate-400">
              {activeThread
                ? `Active Thread: ${activeThread.title}`
                : `Audited sales & client intelligence model`}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {messages.length > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={exportConversation}
                className="h-7.5 bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 text-[11.5px] font-medium"
              >
                {copiedThread ? <Check size={13} className="text-emerald-400" /> : <Download size={13} />}
                <span>{copiedThread ? "Copied" : "Export"}</span>
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="secondary"
              onClick={fresh}
              className="h-7.5 bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 text-[11.5px] font-medium"
            >
              <RefreshCw size={13} />
              <span>New</span>
            </Button>
          </div>
        </div>

        {/* Mobile Dropdown Thread Selector */}
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 p-2.5 lg:hidden">
          <select
            value={activeId ?? ""}
            disabled={busy || loadingThread}
            onChange={(e) => (e.target.value ? void open(e.target.value) : fresh())}
            className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 text-[12.5px] text-slate-800 outline-none"
          >
            <option value="">+ New Conversation</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        {/* Messages Feed Container */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 bg-slate-50/40">
          {loadingThread ? (
            <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
              <Loader2 size={16} className="animate-spin text-slate-800" />
              <span className="text-[13px] font-medium">Opening conversation record…</span>
            </div>
          ) : messages.length === 0 ? (
            /* Welcome State */
            <div className="mx-auto max-w-2xl pt-4 pb-6 space-y-5">
              <div className="rounded border border-slate-200 bg-white p-4 space-y-2">
                <h2 className="text-[15px] font-bold text-slate-900">Good morning, {firstName}.</h2>
                <p className="text-[12.5px] text-slate-600 leading-relaxed">
                  Query your coverage book, overnight tape moves, or quiet clients. Every numerical figure is dynamically populated from verified enterprise feeds.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                  Select Workflow
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  {CATEGORIZED_STARTERS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => send(s.prompt)}
                      className="group cursor-pointer rounded border border-slate-200 bg-white p-3 text-left transition-all hover:border-slate-400 hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {s.icon}
                          <span className="text-[11.5px] font-semibold text-slate-700">{s.category}</span>
                        </div>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 border border-slate-200">
                          {s.tag}
                        </span>
                      </div>
                      <p className="text-[12.5px] font-semibold text-slate-900 line-clamp-2">
                        {s.prompt}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Render Messages List */
            messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[75%] space-y-0.5">
                    <div className="rounded-lg bg-slate-900 px-4 py-2.5 text-[13px] leading-relaxed text-white border border-slate-800">
                      {m.content}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="max-w-[95%] sm:max-w-[90%] space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                    <span>AGENT</span>
                    <span className="text-[10px] text-slate-400 font-mono ml-auto">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  <div className="rounded border border-slate-200 bg-white p-4 space-y-3">
                    {/* Execution Steps */}
                    {m.meta.steps?.length ? (
                      <details className="group rounded border border-slate-200 bg-slate-50 p-2 text-[11.5px] text-slate-700">
                        <summary className="cursor-pointer font-bold select-none flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-800">
                            <Layers size={13} /> Reasoning steps ({m.meta.steps.length})
                          </span>
                        </summary>
                        <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-slate-600 border-t border-slate-200 pt-1.5 font-mono text-[11px]">
                          {m.meta.steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </details>
                    ) : null}

                    {/* Main Body */}
                    <div className="whitespace-pre-line font-sans text-[13px] leading-relaxed text-slate-800">
                      <RichText template={m.content} facts={m.facts} />
                    </div>

                    {/* Embedded Draft Card */}
                    {m.meta.draft ? <DraftCard draft={m.meta.draft} facts={m.facts} compact /> : null}

                    {/* Follow-up Prompts */}
                    {m.meta.followups?.length ? (
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                        {m.meta.followups.map((f) => (
                          <button
                            key={f}
                            type="button"
                            disabled={busy}
                            onClick={() => send(f)}
                            className="cursor-pointer rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11.5px] font-medium text-slate-800 hover:border-slate-400 hover:bg-slate-100 disabled:opacity-50"
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            )
          )}

          {busy ? (
            <div className="flex items-center gap-2 rounded border border-slate-200 bg-white p-3 text-[12px] text-slate-700 font-medium" aria-live="polite">
              <Loader2 size={15} className="animate-spin text-slate-900 shrink-0" />
              <span>Querying enterprise feeds…</span>
            </div>
          ) : null}

          {error ? <ErrorState title="Execution Interrupted" body={error} /> : null}
          <div ref={endRef} />
        </div>

        {/* Enterprise Composer - PERFECT ALIGNMENT */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="border-t border-slate-200 bg-slate-50 p-3 space-y-2 shrink-0"
        >
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="agent-input-field" className="sr-only">Ask the agent</label>
              <textarea
                id="agent-input-field"
                rows={1}
                value={input}
                maxLength={500}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={client ? "Ask about this client..." : "Ask about your client book, overnight moves, or draft outreach..."}
                className="h-10 min-h-[40px] max-h-24 w-full resize-none rounded border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-800"
              />
            </div>

            <Button
              type="submit"
              variant="dark"
              size="sm"
              disabled={busy || !input.trim()}
              aria-label="Send question"
              className="h-10 w-10 shrink-0 bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center justify-center rounded"
            >
              <Send size={15} strokeWidth={2} />
            </Button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-0.5">
            <span className="flex items-center gap-1">
              <ShieldCheck size={12} className="text-slate-700" /> Read-only book access
            </span>
            <span className="font-mono">{input.length}/500</span>
          </div>
        </form>
      </section>

      {/* RIGHT SIDEBAR */}
      <aside aria-label="Enterprise Feeds" className="flex min-h-0 flex-col rounded-md border border-slate-200 bg-white p-3 max-2xl:hidden space-y-3">
        <div className="border-b border-slate-200 pb-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[12.5px] font-bold text-slate-900 flex items-center gap-1.5">
              <Database size={14} className="text-slate-800" /> Enterprise Feeds
            </h2>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 border border-slate-200">
              6 Feeds
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
          {ENTERPRISE_SOURCES.map((src, i) => (
            <div key={i} className="rounded border border-slate-200 bg-slate-50/60 p-2 text-left space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-slate-900">{src.name}</span>
                <span className="text-[10px] font-mono text-slate-500">{src.badge}</span>
              </div>
              <p className="text-[11px] text-slate-500">{src.description}</p>
            </div>
          ))}
        </div>

        <div className="rounded border border-slate-200 bg-slate-900 text-slate-100 p-2.5 space-y-1 text-[11px]">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <ShieldCheck size={14} />
            <span>Compliance System</span>
          </div>
          <p className="text-slate-300 leading-normal">
            Read-only access to authorized user book. Zero external message dispatch without explicit approval.
          </p>
        </div>
      </aside>
    </div>
  );
}
