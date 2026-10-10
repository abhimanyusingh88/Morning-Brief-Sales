'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { ArrowUp, Check, ChevronDown, Copy, ExternalLink, MessageSquare, Plus, Search, Trash2, Users, X } from 'lucide-react';
import type { Client, Report, Filters } from '@/lib/live/types';
import type { Answer } from '@/lib/live/assistant';
import type { ThreadMessage, ThreadSummary } from '@/lib/live/threads';
import { NewsEffects } from './news-effects';
import { Figures } from '@/components/ui/figures';

type Message = { thinking?: string; thoughtMs?: number; role: 'user' | 'assistant'; content: string; sources?: (Answer['sources'][number] & { publisher?: string })[]; notice?: string | null; at: string; method?: string };

const STARTERS = [
  'What matters for my book this morning?',
  "Which positions are most exposed to today's oil and geopolitics headlines?",
  'Give me three talking points for a call with a tech-focused PM',
  "What are today's catalysts and data releases to watch?",
];
const clock = (at: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(at));
const dayKey = (at: string) => new Date(at).toDateString();

/** Minimal, safe formatter for analyst answers: headings, bold labels and bullets. No HTML is injected. */
function Formatted({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold text-ink"><Figures text={part.slice(2, -2)} /></strong> : <Figures key={i} text={part} />));
  return (
    <div className="space-y-2 break-words text-[14px] leading-[1.7] text-ink-2">
      {text.split(/\n/).map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        if (/^#{1,3}\s/.test(t)) return <p key={i} className="pt-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted first:pt-0">{t.replace(/^#{1,3}\s/, '')}</p>;
        if (/^[•*-]\s/.test(t)) return <p key={i} className="flex gap-2.5 pl-1"><span aria-hidden="true" className="mt-[10px] h-[4px] w-[4px] shrink-0 rounded-full bg-ink-2" /><span>{inline(t.replace(/^[•*-]\s/, ''))}</span></p>;
        if (i === 0 && /^\*\*[\s\S]+\*\*$/.test(t)) return <p key={i} className="text-[15px] leading-snug text-ink">{inline(t)}</p>;
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label="Copy answer" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }} className="inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink">
      {done ? <Check size={12} /> : <Copy size={12} />}{done ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Reasoning shown to the user: market and client reasoning only, never notes about output formatting. */
const META = /\b(json|tokens?|citations?|citation_ids|schema|templates?|markdown|formatting|format|output|verifier|digits?|placeholders?)\b/i;
function reasoningSections(text: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  for (const block of text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    const m = /^\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(block);
    if (m) out.push({ title: m[1], body: m[2] });
    else if (out.length) out[out.length - 1].body += (out[out.length - 1].body ? '\n\n' : '') + block;
    else out.push({ title: '', body: block });
  }
  return out.filter((s) => !META.test(s.title + ' ' + s.body));
}
function Reasoning({ text }: { text: string }) {
  const sections = reasoningSections(text);
  if (!sections.length) return null;
  return <div className="space-y-2.5">{sections.map((s, i) => <div key={i}>{s.title ? <p className="text-[12px] font-semibold text-ink-2">{s.title}</p> : null}{s.body ? <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">{s.body}</p> : null}</div>)}</div>;
}

/** One quiet "Thinking" line with the model's live reasoning summary beneath it, like mainstream AI assistants. */
function Thinking({ live }: { live: { phase: string; text: string; started: number } | null }) {
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [live?.text]);
  const secs = live ? Math.max(0, Math.round((now - live.started) / 1000)) : 0;
  return (
    <div role="status" aria-live="polite" className="min-h-[56px]">
      <p className="flex items-center gap-2 text-[13.5px]"><span className="thinking-text font-medium">Thinking</span><span className="num text-[12px] text-muted">{secs}s</span></p>
      <p className="mt-0.5 text-[12px] text-muted">{live?.phase ?? 'Starting'}…</p>
      {live?.text && reasoningSections(live.text).length ? <div ref={box} className="thinking-fade mt-2 max-h-[150px] overflow-hidden border-l-2 border-line pl-3"><Reasoning text={live.text} /></div> : null}
    </div>
  );
}

function ScopePicker({ clients, selected, onChange }: { clients: Client[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState('');
  const label = !selected.length ? 'All clients' : selected.length === 1 ? clients.find((c) => c.id === selected[0])?.name ?? '1 client' : selected.length + ' clients';
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const list = q ? clients.filter((c) => (c.name + ' ' + c.symbols.join(' ')).toLowerCase().includes(q.toLowerCase())) : clients;
  const box = (on: boolean) => <span aria-hidden="true" className={'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border transition-colors ' + (on ? 'border-navy bg-navy text-white' : 'border-line-strong bg-surface')}>{on ? <Check size={10} strokeWidth={3.2} /> : null}</span>;
  return (
    <Popover.Root onOpenChange={(o) => { if (!o) setQ(''); }}>
      <Popover.Trigger asChild>
        <button type="button" aria-label="Choose clients for this question" className="inline-flex h-8 max-w-[60%] items-center gap-1.5 rounded-full border border-line px-3 text-[12px] text-ink-2 transition-colors hover:border-ink-2 hover:text-ink data-[state=open]:border-ink-2"><Users size={13} className="shrink-0" /><span className="truncate">{label}</span><ChevronDown size={13} className="shrink-0 text-muted" /></button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" align="start" sideOffset={8} className="z-[60] w-[340px] overflow-hidden rounded-lg border border-line bg-surface shadow-pop focus:outline-none">
          <div className="border-b border-line p-2">
            <label className="flex h-8 items-center gap-2 rounded-md bg-sunken px-2.5"><Search size={13} className="text-muted" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients or tickers" aria-label="Search clients" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted" /></label>
          </div>
          <ul role="listbox" aria-multiselectable="true" aria-label="Clients" className="max-h-[300px] overflow-y-auto py-1">
            {!q ? <li><button type="button" role="option" aria-selected={!selected.length} onClick={() => onChange([])} className="flex h-9 w-full items-center gap-3 px-3 text-left text-[12.5px] hover:bg-sunken">{box(!selected.length)}<span className="flex-1 font-semibold text-ink">All clients</span><span className="num text-[11px] text-muted">{clients.reduce((n, c) => n + c.holdings, 0)} positions</span></button></li> : null}
            {!q ? <li aria-hidden="true" className="mx-3 my-1 border-t border-line" /> : null}
            {list.map((c) => { const on = selected.includes(c.id); return (
              <li key={c.id}><button type="button" role="option" aria-selected={on} onClick={() => toggle(c.id)} className={'flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-sunken ' + (on ? 'bg-sunken/60' : '')}>
                {box(on)}
                <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-medium text-ink">{c.name}</span><span className="block truncate text-[11px] text-muted">{c.symbols.join(', ')}</span></span>
                <span className="num shrink-0 text-[11px] text-muted">{c.holdings}</span>
              </button></li>
            ); })}
            {!list.length ? <li className="px-3 py-6 text-center text-[12px] text-muted">No clients match.</li> : null}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-bg px-3 py-2">
            <span className="text-[11.5px] text-muted">{selected.length ? selected.length + ' of ' + clients.length + ' selected' : 'All ' + clients.length + ' clients'}</span>
            <div className="flex items-center gap-1.5">
              {selected.length ? <button type="button" onClick={() => onChange([])} className="h-7 rounded px-2.5 text-[12px] font-medium text-ink-2 hover:bg-sunken">Clear</button> : null}
              <Popover.Close asChild><button type="button" className="h-7 rounded bg-navy px-3 text-[12px] font-semibold text-white hover:bg-navy-2">Done</button></Popover.Close>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Composer({ value, onChange, onSend, busy, picker, inputRef, large }: { value: string; onChange: (v: string) => void; onSend: () => void; busy: boolean; picker: React.ReactNode; inputRef: React.RefObject<HTMLTextAreaElement | null>; large?: boolean }) {
  useEffect(() => { const el = inputRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 180) + 'px'; }, [value, inputRef]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSend(); }} className="rounded-2xl border border-line-strong bg-surface shadow-card transition-colors focus-within:border-ink-2">
      <label className="sr-only" htmlFor="brief-assistant-input">Ask the desk analyst</label>
      <textarea id="brief-assistant-input" ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} maxLength={1200} rows={large ? 2 : 1} placeholder="Ask about markets, news or your clients…" disabled={busy}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        className="block max-h-44 w-full resize-none bg-transparent px-4 pt-3.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted" />
      <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-2">
        {picker}
        <button type="submit" disabled={busy || !value.trim()} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-navy px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-navy-2 disabled:bg-line-strong"><ArrowUp size={14} strokeWidth={2.4} />Send</button>
      </div>
    </form>
  );
}

export function BriefAssistant({ report, filters, clients, archived = false }: { report: Report; filters: Filters; clients: Client[]; archived?: boolean }) {
  const [picked, setPicked] = useState<string[]>(report.clientId ? [report.clientId] : []);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<{ phase: string; text: string; started: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const pickedName = !picked.length ? 'All my clients' : picked.length === 1 ? clients.find((c) => c.id === picked[0])?.name ?? report.clientName : picked.length + ' clients';
  const scope = [pickedName, filters.topic, filters.symbol, filters.q && '“' + filters.q + '”'].filter(Boolean).join(' · ');

  const loadThreads = useCallback(async () => {
    // Chats are listed per brief day: each conversation belongs to the day of the brief it was asked about.
    try {
    const r = await fetch('/api/live/threads?date=' + report.businessDate); if (r.ok) setThreads((await r.json()).threads); } catch { /* history is optional */ }
  }, [report.businessDate]);
  useEffect(() => { if (open) void loadThreads(); }, [open, loadThreads]);
  useEffect(() => { conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (busy) conversation.current?.scrollTo({ top: conversation.current.scrollHeight, behavior: 'smooth' }); }, [busy]);

  const openThread = async (id: string) => {
    if (busy) return;
    setThreadId(id); setError(''); setLoading(true); setMessages([]);
    try {
      const r = await fetch('/api/live/threads/' + id); const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? 'Conversation unavailable');
      setMessages((body.messages as ThreadMessage[]).flatMap((m) => [{ role: 'user' as const, content: m.question, at: m.at }, { role: 'assistant' as const, content: m.answer, sources: m.sources, notice: m.notice, method: m.method, at: m.at }]));
    } catch (e) { setError(e instanceof Error ? e.message : 'Conversation unavailable'); } finally { setLoading(false); }
  };
  const newChat = () => { if (busy) return; setThreadId(null); setMessages([]); setError(''); setQuestion(''); requestAnimationFrame(() => input.current?.focus()); };
  const remove = async (id: string) => {
    try { const r = await fetch('/api/live/threads/' + id, { method: 'DELETE' }); if (r.ok) { setThreads((t) => t.filter((x) => x.id !== id)); if (id === threadId) newChat(); } } catch { /* keep list */ }
  };

  const send = async (text: string) => {
    if (busy || !text.trim()) return;
    setOpen(true); setBusy(true); setError('');
    const started = Date.now();
    let thinking = '';
    setLive({ phase: 'Starting', text: '', started });
    setMessages((m) => [...m, { role: 'user', content: text.trim(), at: new Date().toISOString() }]);
    setQuestion('');
    try {
      const response = await fetch('/api/live/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ report: report.id, client: report.clientId, question: text.trim(), filters, thread: threadId, clients: picked.length ? picked : undefined }), signal: AbortSignal.timeout(70000) });
      let result: { status: number; body: Record<string, unknown> } | null = null;
      if ((response.headers.get('content-type') ?? '').includes('text/event-stream') && response.body) {
        // Server-sent events: phase, thinking (reasoning summary deltas), result.
        const reader = response.body.getReader(); const dec = new TextDecoder(); let buf = '';
        for (;;) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let cut: number;
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, cut); buf = buf.slice(cut + 2);
            const event = /^event: (.+)$/m.exec(frame)?.[1]; const data = /^data: (.+)$/m.exec(frame)?.[1]; if (!event || !data) continue;
            const payload = JSON.parse(data);
            if (event === 'phase') setLive((l) => (l ? { ...l, phase: payload.label } : l));
            else if (event === 'thinking') { thinking += payload.delta; setLive((l) => (l ? { ...l, text: thinking } : l)); }
            else if (event === 'result') result = payload;
          }
        }
      } else result = { status: response.status, body: await response.json() };
      if (!result) throw new Error('The analyst is unavailable');
      const body = result.body as { error?: string; thread: string; answer: string; sources: Answer['sources']; notice?: string; method: string };
      if (result.status !== 200) throw new Error(body.error ?? 'The analyst is unavailable');
      setThreadId(body.thread);
      setMessages((m) => [...m, { role: 'assistant', content: body.answer, sources: body.sources, notice: body.notice, method: body.method, at: new Date().toISOString(), thinking: thinking.trim() || undefined, thoughtMs: Date.now() - started }]);
      void loadThreads();
    } catch (e) {
      setMessages((m) => m.slice(0, -1));
      setError(e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'The analyst took too long to respond. Please try again.');
      setQuestion(text);
    } finally { setBusy(false); setLive(null); requestAnimationFrame(() => input.current?.focus()); }
  };

  const shown = search ? threads.filter((t) => t.title.toLowerCase().includes(search.toLowerCase())) : threads;
  const today = new Date().toDateString();
  const groups = archived ? [{ label: 'Chats on this brief', items: shown }].filter((g) => g.items.length) : [{ label: 'Today', items: shown.filter((t) => dayKey(t.updatedAt) === today) }, { label: 'Earlier', items: shown.filter((t) => dayKey(t.updatedAt) !== today) }].filter((g) => g.items.length);
  const title = threads.find((t) => t.id === threadId)?.title ?? 'New conversation';

  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Trigger asChild>
        <button type="button" aria-label="Open the desk analyst" className={'fixed bottom-5 right-5 z-40 flex h-11 items-center gap-2.5 rounded-lg border border-navy-2 bg-navy pl-2 pr-4 text-[13px] font-semibold text-white shadow-[0_10px_30px_rgba(14,22,39,0.28)] transition-[opacity,background-color] duration-200 hover:bg-navy-2 sm:bottom-6 sm:right-6 ' + (open ? 'pointer-events-none opacity-0' : 'opacity-100')}>
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10"><MessageSquare size={14} /></span><span className="hidden sm:inline">Desk Analyst</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content onInteractOutside={(e) => e.preventDefault()} onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }} aria-describedby="assistant-context"
          className="drawer fixed inset-y-0 right-0 z-50 flex h-dvh w-full overflow-hidden border-l border-line bg-surface text-ink shadow-[-24px_0_60px_rgba(14,22,39,0.18)] focus:outline-none md:w-[min(1180px,82vw)]">
          <aside className="hidden w-[272px] shrink-0 flex-col border-r border-line bg-bg md:flex">
            <div className="flex items-center justify-between px-4 pb-3 pt-4"><p className="text-[14px] font-semibold text-ink">Chats</p><span className="num text-[11px] text-muted">{threads.length}</span></div>
            <div className="px-3"><button type="button" onClick={newChat} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-navy text-[13px] font-semibold text-white transition-colors hover:bg-navy-2"><Plus size={15} />New chat</button></div>
            <label className="mx-3 mt-3 flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 focus-within:border-ink-2"><Search size={13} className="text-muted" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-muted" /></label>
            <nav aria-label="Chat history" className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {groups.length ? groups.map((g) => (
                <div key={g.label} className="mb-3">
                  <p className="px-2.5 pb-1.5 pt-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">{g.label}</p>
                  <ul>{g.items.map((t) => (
                    <li key={t.id} className="group relative mb-0.5">
                      <button type="button" onClick={() => openThread(t.id)} aria-current={t.id === threadId ? "true" : undefined} className={"relative flex h-9 w-full items-center gap-2.5 rounded-md pl-3 pr-9 text-left transition-colors " + (t.id === threadId ? "bg-surface shadow-card" : "hover:bg-surface/70")}>{t.id === threadId ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-navy" /> : null}<MessageSquare size={13} className={"shrink-0 " + (t.id === threadId ? "text-ink" : "text-muted")} /><span className={"min-w-0 flex-1 truncate text-[13px] " + (t.id === threadId ? "font-semibold text-ink" : "text-ink-2")}>{t.title}</span></button>
                      <button type="button" aria-label={"Delete chat: " + t.title} title="Delete chat" onClick={() => remove(t.id)} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-down-50 hover:text-down focus-visible:opacity-100 group-hover:opacity-100"><Trash2 size={13} /></button>
                    </li>
                  ))}</ul>
                </div>
              )) : <p className="px-2 pt-4 text-[12px] leading-relaxed text-muted">{search ? 'No chats match.' : 'Your conversations appear here. Each chat keeps its own context.'}</p>}
            </nav>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-3">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-[15px] font-semibold text-ink">Desk Analyst <span className="font-normal text-muted">/ {title}</span></Dialog.Title>
                <p id="assistant-context" className="truncate text-[11.5px] text-muted">{scope}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={newChat} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[12.5px] font-medium text-ink transition-colors hover:bg-sunken md:hidden"><Plus size={14} />New</button>
                <Dialog.Close asChild><button type="button" aria-label="Close the desk analyst" className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-sunken hover:text-ink"><X size={17} /></button></Dialog.Close>
              </div>
            </header>

            {!messages.length && !loading ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-bg px-6">
                <div className="w-full max-w-[680px]">
                  <p className="text-center text-[20px] font-semibold tracking-[-0.02em] text-ink">{archived ? 'Ask about this day’s brief' : 'What do you need for today’s book?'}</p>
                  <p className="mb-6 mt-1.5 text-center text-[13px] text-muted">Answers use the brief&apos;s verified evidence, your clients&apos; positions and live prices.</p>
                  <Composer value={question} onChange={setQuestion} onSend={() => send(question)} busy={busy} picker={<ScopePicker clients={clients} selected={picked} onChange={setPicked} />} inputRef={input} large />
                  {error ? <p role="alert" className="mt-3 text-center text-[12px] text-down">{error}</p> : null}
                  <div className="mt-5 flex flex-wrap justify-center gap-2">{STARTERS.map((s) => <button key={s} type="button" onClick={() => send(s)} disabled={busy} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:border-ink-2 hover:text-ink disabled:opacity-50">{s}</button>)}</div>
                  <p className="mt-6 text-center text-[11px] text-muted">Figures are substituted from sourced data and verified. Drafts are never sent automatically.</p>
                </div>
              </div>
            ) : (
              <>
                <div ref={conversation} role="log" aria-label="Conversation" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                  <div className="mx-auto flex max-w-[860px] flex-col gap-7 px-8 py-8">
                    {loading ? <p className="text-[13px] text-muted">Loading conversation…</p> : null}
                    {messages.map((m, i) => m.role === 'user' ? (
                      <div key={i} className="flex justify-end">
                        <div className="max-w-[72%] rounded-2xl rounded-tr-md bg-sunken px-4 py-2.5 text-[14.5px] leading-relaxed text-ink">{m.content}</div>
                      </div>
                    ) : (
                      <article key={i} className="group">
                        {m.thinking ? <details className="group/t mb-3"><summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-muted hover:text-ink">Thought for {Math.max(1, Math.round((m.thoughtMs ?? 0) / 1000))}s<ChevronDown size={12} className="transition-transform group-open/t:rotate-180" /></summary><div className="mt-2 border-l-2 border-line pl-3"><Reasoning text={m.thinking} /></div></details> : null}
                        {m.notice ? <p className="mb-3 border-l-2 border-amber pl-2.5 text-[12px] text-amber">{m.notice}</p> : null}
                        <Formatted text={m.content} />
                        {m.sources?.length ? (
                          <div className="mt-5">
                            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">Sources</p>
                            <ol className="mt-1.5 divide-y divide-line border-y border-line">
                              {m.sources.map((s, n) => {
                                const story = report.articles.find((a) => a.id === s.id);
                                return (
                                  <li key={s.id} className="flex items-center gap-3 py-2">
                                    <span className="num w-4 shrink-0 text-[11px] font-semibold text-muted">{n + 1}</span>
                                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-[13px] leading-snug text-ink hover:text-brand"><span className="line-clamp-1">{s.title}</span><span className="text-[11px] text-muted">{story?.publisher ?? s.publisher ?? 'Source'} · {clock(s.publishedAt)}</span></a>
                                    <a href={s.url} target="_blank" rel="noopener noreferrer" aria-label={'Open source: ' + s.title} className="shrink-0 text-muted hover:text-brand"><ExternalLink size={13} /></a>
                                    {story ? <NewsEffects story={story} /> : null}
                                  </li>
                                );
                              })}
                            </ol>
                          </div>
                        ) : null}
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted"><CopyButton text={m.content.replace(/\*\*/g, '')} /><span>{clock(m.at)}</span><span aria-hidden="true">·</span><span>{m.method === 'model' ? 'Figures verified against sources' : 'Compiled from evidence'}</span></div>
                      </article>
                    ))}
                    {busy ? <Thinking live={live} /> : null}
                  </div>
                </div>
                <div className="shrink-0 border-t border-line bg-bg px-6 py-4">
                  <div className="mx-auto max-w-[820px]">
                    {error ? <p role="alert" className="mb-2 text-[12px] text-down">{error}</p> : null}
                    <Composer value={question} onChange={setQuestion} onSend={() => send(question)} busy={busy} picker={<ScopePicker clients={clients} selected={picked} onChange={setPicked} />} inputRef={input} />
                  </div>
                </div>
              </>
            )}
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
