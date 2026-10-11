'use client';
import { AlertTriangle, Check, Loader2, Minus, RotateCcw, Search, X } from 'lucide-react';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TOPICS, type Client, type Focus, type Holding, type Preferences } from '@/lib/live/types';

type Draft = { clients: string[]; sectors: string[]; focusTopics: string[]; focusSymbols: string[]; watch: string[] };
const MAX_WATCH = 20;
const TICKER = /^[A-Z0-9.\-]{1,15}$/;
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const sorted = (d: Draft) => JSON.stringify(Object.values(d).map((v) => [...v].sort()));
const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);
const money = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const TOPIC_GROUPS: { label: string; topics: string[] }[] = [
  { label: 'Macro & markets', topics: ['Markets', 'Rates', 'Credit', 'Geopolitics', 'Trade', 'Regulation'] },
  { label: 'Energy & commodities', topics: ['Oil', 'Energy', 'Commodities', 'Crypto'] },
  { label: 'Technology', topics: ['AI', 'Semiconductors', 'Cloud', 'Telecom', 'Media'] },
  { label: 'Sectors', topics: ['Banks', 'Defense', 'Healthcare', 'Consumer', 'Retail', 'Automotive'] },
  { label: 'Corporate events', topics: ['Earnings', 'Deals', 'Launches'] },
];
// Any topic added to the product later still appears, under "Other", without a change here.
const GROUPS = [
  ...TOPIC_GROUPS,
  { label: 'Other', topics: TOPICS.filter((t) => !TOPIC_GROUPS.some((g) => g.topics.includes(t))) },
].filter((g) => g.topics.length);

const TextLink = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className="cursor-pointer rounded text-[12px] font-medium text-brand-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
  >
    {children}
  </button>
);
function Box({ on, some }: { on: boolean; some?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${on || some ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface'}`}
    >
      {on ? <Check size={11} strokeWidth={3} /> : some ? <Minus size={11} strokeWidth={3} /> : null}
    </span>
  );
}
/** A compact on/off tag: square-cornered and dense, for a settings grid. */
function Tag({
  on,
  onClick,
  disabled,
  mono,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 cursor-pointer items-center rounded-md border px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${mono ? 'mono ' : ''}${on ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface text-ink-2 hover:border-brand hover:text-brand'}`}
    >
      {children}
    </button>
  );
}
function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="num mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-1.5 truncate text-[12px] text-muted">{hint}</p>
    </div>
  );
}
function Panel({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-sunken/40 px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">{title}</h2>
          <p className="mt-0.5 text-[12px] text-muted">{sub}</p>
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}
/** Topics laid out as labelled rows, so two dozen choices read as a form. */
function TopicGrid({
  chosen,
  onToggle,
  onGroup,
  disabled,
}: {
  chosen: string[];
  onToggle: (t: string) => void;
  onGroup: (topics: string[], on: boolean) => void;
  disabled: boolean;
}) {
  return (
    <dl className="divide-y divide-line">
      {GROUPS.map((g) => {
        const n = g.topics.filter((t) => chosen.includes(t)).length,
          all = n === g.topics.length;
        return (
          <div
            key={g.label}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3 sm:min-h-[54px] sm:grid-cols-[150px_minmax(0,1fr)_64px]"
          >
            <dt className="text-[12.5px] font-medium text-ink">
              {g.label}
              <span className="num ml-1.5 font-normal text-muted">
                {n}/{g.topics.length}
              </span>
            </dt>
            <dd className="col-span-2 row-start-2 flex flex-wrap gap-1.5 sm:col-span-1 sm:row-start-auto">
              {g.topics.map((t) => (
                <Tag key={t} on={chosen.includes(t)} disabled={disabled} onClick={() => onToggle(t)}>
                  {t}
                </Tag>
              ))}
            </dd>
            <button
              type="button"
              disabled={disabled}
              aria-label={(all ? 'Clear ' : 'Select all ') + g.label}
              onClick={() => onGroup(g.topics, !all)}
              className="cursor-pointer justify-self-end rounded text-[12px] font-medium text-brand-600 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed"
            >
              {all ? 'Clear' : 'Select all'}
            </button>
          </div>
        );
      })}
    </dl>
  );
}

/** Brief setup: which clients, topics and stocks the brief shows. Nothing changes until Save is pressed. */
export function SetupForm({
  prefs,
  focus,
  clients,
  holdings,
}: {
  prefs: Preferences;
  focus: Focus;
  clients: Client[];
  holdings: Holding[];
}) {
  const router = useRouter();
  const initial: Draft = {
    clients: focus.clients,
    sectors: prefs.sectors,
    focusTopics: focus.topics,
    focusSymbols: focus.symbols,
    watch: prefs.symbols,
  };
  // `saved` is what the server holds; `p` is the draft on screen. The bar below appears only when they differ.
  const [saved, setSaved] = React.useState(initial);
  const [p, setP] = React.useState(initial);
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = React.useState('');
  const [find, setFind] = React.useState('');
  const [entry, setEntry] = React.useState('');
  const [entryError, setEntryError] = React.useState('');
  const busy = React.useRef(false);

  // Stocks on offer follow the chosen clients; with none chosen, the whole book is in play.
  const inPlay = holdings.filter((h) => !p.clients.length || p.clients.includes(h.clientId)),
    stocks = [...new Set(inPlay.map((h) => h.symbol))].sort(),
    chosenStocks = p.focusSymbols.filter((s) => stocks.includes(s));
  const draft: Draft = { ...p, focusSymbols: chosenStocks },
    dirty = sorted(draft) !== sorted(saved),
    saving = state === 'saving';
  const shown = clients.filter((c) =>
    (c.name + ' ' + c.symbols.join(' ')).toLowerCase().includes(find.trim().toLowerCase()),
  );
  const allOn = clients.length > 0 && p.clients.length === clients.length;
  const filters = [
    p.focusTopics.length ? plural(p.focusTopics.length, 'topic') : '',
    chosenStocks.length ? plural(chosenStocks.length, 'stock') : '',
  ].filter(Boolean);
  const edit = (change: (d: Draft) => Draft) => {
    setP(change);
    if (state !== 'saving') {
      setState('idle');
      setMsg('');
    }
  };
  const pick = (id: string) => edit((x) => ({ ...x, clients: toggle(x.clients, id) }));
  const groupSet = (key: 'sectors' | 'focusTopics') => (topics: string[], on: boolean) =>
    edit((x) => ({
      ...x,
      [key]: on ? [...new Set([...x[key], ...topics])] : x[key].filter((t) => !topics.includes(t)),
    }));

  // Leaving with unsaved choices would silently drop them, so the browser asks first.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const addWatch = (raw: string) => {
    const parts = raw
      .split(/[\s,]+/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
    if (!parts.length) return;
    const bad = parts.filter((x) => !TICKER.test(x)),
      next = [...new Set([...p.watch, ...parts.filter((x) => TICKER.test(x))])];
    if (next.length > MAX_WATCH) {
      setEntryError('The watchlist holds up to ' + MAX_WATCH + ' tickers. Remove one to add another.');
      return;
    }
    edit((x) => ({ ...x, watch: next }));
    setEntry(bad.join(' '));
    setEntryError(
      bad.length ? 'Not a valid ticker: ' + bad.join(', ') + '. Use letters, numbers, dots or dashes.' : '',
    );
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy.current || !dirty) return;
    busy.current = true;
    setState('saving');
    setMsg('');
    try {
      const r = await fetch('/api/live/interests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectors: draft.sectors,
          symbols: draft.watch,
          clients: draft.clients,
          focusTopics: draft.focusTopics,
          focusSymbols: draft.focusSymbols,
        }),
        signal: AbortSignal.timeout(90000),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? 'Could not save your setup.');
      setSaved(draft);
      setP(draft);
      setMsg(
        body.rebuilt
          ? 'Saved. Today’s brief was rebuilt with your topics and watchlist.'
          : 'Saved. Your brief now shows these choices.',
      );
      setState('saved');
      router.refresh();
    } catch (err) {
      setMsg(
        err instanceof TypeError
          ? 'You appear to be offline. Your choices are still here; try saving again.'
          : err instanceof Error && err.name !== 'TimeoutError'
            ? err.message
            : 'Saving is taking longer than expected. Your choices are still here; try again in a moment.',
      );
      setState('error');
    } finally {
      busy.current = false;
    }
  };

  return (
    <form onSubmit={save} className="space-y-5 pb-4" aria-busy={saving}>
      <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Clients in brief"
          value={
            <>
              {p.clients.length || clients.length}
              <span className="text-[14px] font-medium text-muted"> / {clients.length}</span>
            </>
          }
          hint={p.clients.length ? 'Selected clients only' : 'Whole book'}
        />
        <Stat label="Positions" value={inPlay.length} hint={plural(stocks.length, 'stock') + ' held'} />
        <Stat
          label="News topics"
          value={p.sectors.length}
          hint={p.watch.length ? 'Plus ' + plural(p.watch.length, 'watchlist stock') : 'Plus all holdings news'}
        />
        <Stat
          label="Headline filters"
          value={filters.length ? p.focusTopics.length + chosenStocks.length : 'Off'}
          hint={filters.length ? filters.join(' · ') : 'Showing every headline'}
        />
      </div>

      <Panel
        title="Client coverage"
        sub="The brief, client list and search show only the clients you select. Select none to show your whole book."
        right={
          clients.length > 8 ? (
            <label className="flex h-8 w-full items-center rounded-md border border-line-strong bg-surface focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-100 sm:w-64">
              <Search size={13} aria-hidden="true" className="ml-2.5 shrink-0 text-muted" />
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                aria-label="Find a client or stock"
                placeholder="Find a client or stock…"
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-[12.5px] outline-none placeholder:text-muted"
              />
            </label>
          ) : null
        }
      >
        {!clients.length ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">No clients are assigned to you yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th scope="col" className="w-12 py-2 pl-5 text-left">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={allOn ? true : p.clients.length ? 'mixed' : false}
                      aria-label={allOn ? 'Clear all clients' : 'Select all clients'}
                      disabled={saving}
                      onClick={() => edit((x) => ({ ...x, clients: allOn ? [] : clients.map((c) => c.id) }))}
                      className="flex cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <Box on={allOn} some={p.clients.length > 0} />
                    </button>
                  </th>
                  <th scope="col" className="w-[30%] px-3 py-2 text-left font-semibold">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">
                    Holdings
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 text-right font-semibold">
                    Accounts
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 text-right font-semibold">
                    Positions
                  </th>
                  <th scope="col" className="w-40 py-2 pl-3 pr-5 text-right font-semibold">
                    Current value
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((c) => {
                  const on = p.clients.includes(c.id),
                    held = holdings.filter((h) => h.clientId === c.id),
                    value = held.reduce((n, h) => n + (Number(h.currentValue) || 0), 0);
                  return (
                    <tr
                      key={c.id}
                      role="checkbox"
                      aria-checked={on}
                      aria-label={c.name}
                      tabIndex={saving ? -1 : 0}
                      onClick={() => !saving && pick(c.id)}
                      onKeyDown={(e) => {
                        if ((e.key === ' ' || e.key === 'Enter') && !saving) {
                          e.preventDefault();
                          pick(c.id);
                        }
                      }}
                      className={`cursor-pointer transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${on ? 'bg-brand-50/70 hover:bg-brand-50' : 'hover:bg-sunken/50'}`}
                    >
                      <td className="py-2.5 pl-5">
                        <Box on={on} />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-ink">{c.name}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {held.map((h) => (
                            <span
                              key={h.id}
                              title={h.fund + ' · ' + h.direction}
                              className="mono inline-flex h-5 items-center gap-1 rounded border border-line-strong bg-surface px-1.5 text-[11px] font-semibold text-ink"
                            >
                              {h.symbol}
                              <span className={h.direction === 'Long' ? 'text-up' : 'text-down'}>
                                {h.direction === 'Long' ? 'L' : 'S'}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="num px-3 py-2.5 text-right text-ink-2">{c.accounts}</td>
                      <td className="num px-3 py-2.5 text-right text-ink-2">{c.holdings}</td>
                      <td className="num py-2.5 pl-3 pr-5 text-right text-ink">{money(value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!shown.length ? (
              <p className="px-5 py-6 text-center text-[13px] text-muted">No client matches “{find.trim()}”.</p>
            ) : null}
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-sunken/40 px-5 py-2 text-[12px] text-muted">
          <span>
            {p.clients.length
              ? plural(p.clients.length, 'client') + ' selected · ' + plural(inPlay.length, 'position')
              : 'No selection: all ' + clients.length + ' clients are shown'}
          </span>
          <span>L long · S short · values as recorded in the client database</span>
        </footer>
      </Panel>

      <div className="grid items-stretch gap-5 xl:grid-cols-2">
        <Panel
          title="News coverage"
          sub="What goes into your brief. News on your clients’ holdings is always included."
          right={
            p.sectors.length ? (
              <TextLink onClick={() => edit((x) => ({ ...x, sectors: [] }))}>Clear all ({p.sectors.length})</TextLink>
            ) : null
          }
        >
          <p className="border-b border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Add these topics
          </p>
          <TopicGrid
            chosen={p.sectors}
            disabled={saving}
            onToggle={(t) => edit((x) => ({ ...x, sectors: toggle(x.sectors, t) }))}
            onGroup={groupSet('sectors')}
          />
          <label
            htmlFor="watch"
            className="flex items-baseline justify-between border-y border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
          >
            Add these stocks (watchlist)
            <span className="num font-normal normal-case tracking-normal">
              {p.watch.length} / {MAX_WATCH}
            </span>
          </label>
          <div className="px-5 py-3">
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-100">
              {p.watch.map((s) => (
                <span
                  key={s}
                  className="mono inline-flex h-6 items-center gap-1 rounded border border-line-strong bg-sunken pl-2 pr-1 text-[12px] font-semibold text-ink"
                >
                  {s}
                  <button
                    type="button"
                    aria-label={'Remove ' + s}
                    disabled={saving}
                    onClick={() => edit((x) => ({ ...x, watch: x.watch.filter((w) => w !== s) }))}
                    className="rounded p-0.5 text-muted hover:bg-line hover:text-ink"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                id="watch"
                value={entry}
                disabled={saving}
                maxLength={80}
                aria-invalid={Boolean(entryError)}
                aria-describedby="watch-help"
                placeholder={p.watch.length ? 'Add another…' : 'Type a ticker and press Enter'}
                onChange={(e) => {
                  setEntryError('');
                  if (/[\s,]$/.test(e.target.value)) addWatch(e.target.value);
                  else setEntry(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addWatch(entry);
                  } else if (e.key === 'Backspace' && !entry && p.watch.length)
                    edit((x) => ({ ...x, watch: x.watch.slice(0, -1) }));
                }}
                onBlur={() => addWatch(entry)}
                className="mono h-6 min-w-[160px] flex-1 bg-transparent px-1 text-[13px] uppercase outline-none placeholder:font-sans placeholder:normal-case placeholder:text-muted"
              />
            </div>
            <p id="watch-help" className={`mt-1.5 text-[12px] ${entryError ? 'text-down' : 'text-muted'}`}>
              {entryError ||
                'Extra public stocks to follow. Changing topics or the watchlist rebuilds today’s brief, so saving takes a little longer.'}
            </p>
          </div>
        </Panel>

        <Panel
          title="Headline filters"
          sub="What you see on the main brief. Optional: leave empty to see every headline."
          right={
            filters.length ? (
              <TextLink onClick={() => edit((x) => ({ ...x, focusTopics: [], focusSymbols: [] }))}>
                Clear filters
              </TextLink>
            ) : (
              <span className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] font-medium text-muted">
                Off
              </span>
            )
          }
        >
          <p className="border-b border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Only these topics
          </p>
          <TopicGrid
            chosen={p.focusTopics}
            disabled={saving}
            onToggle={(t) => edit((x) => ({ ...x, focusTopics: toggle(x.focusTopics, t) }))}
            onGroup={groupSet('focusTopics')}
          />
          <p className="border-y border-line px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Only these stocks
          </p>
          <div className="px-5 py-3">
            {stocks.length ? (
              <div className="flex flex-wrap gap-1.5">
                {stocks.map((s) => (
                  <Tag
                    key={s}
                    mono
                    on={chosenStocks.includes(s)}
                    disabled={saving}
                    onClick={() => edit((x) => ({ ...x, focusSymbols: toggle(chosenStocks, s) }))}
                  >
                    {s}
                  </Tag>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">The selected clients have no holdings on record.</p>
            )}
            {p.focusSymbols.length > chosenStocks.length ? (
              <p className="mt-2 text-[12px] text-muted">
                Stocks held only by clients you deselected were removed from this filter.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>

      <p className="text-[12px] text-muted">All report dates and times use US Eastern Time.</p>

      {dirty || state !== 'idle' ? (
        <div
          className={`sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-surface px-4 py-3 shadow-pop ${state === 'error' ? 'border-down/40' : 'border-line-strong'}`}
        >
          <p
            role={state === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={`flex min-w-0 flex-1 items-center gap-2 text-[13px] ${state === 'error' ? 'text-down' : 'text-ink-2'}`}
          >
            {saving ? (
              <Loader2 size={14} className="shrink-0 animate-spin text-brand" />
            ) : state === 'error' ? (
              <AlertTriangle size={14} className="shrink-0" />
            ) : state === 'saved' && !dirty ? (
              <Check size={14} className="shrink-0 text-up" />
            ) : (
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-amber" />
            )}
            <span>{saving ? 'Saving your setup…' : msg || 'You have unsaved changes.'}</span>
          </p>
          {state === 'saved' && !dirty ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/brief">Open brief</Link>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={saving || !dirty}
                onClick={() => {
                  setP(saved);
                  setEntry('');
                  setEntryError('');
                  setState('idle');
                  setMsg('');
                }}
              >
                <RotateCcw size={13} />
                Discard
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={saving || !dirty}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {saving ? 'Saving…' : state === 'error' ? 'Try again' : 'Save setup'}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </form>
  );
}
