'use client';
import { AlertTriangle, Check, Loader2, RotateCcw, Search, X } from 'lucide-react';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { TOPICS, type Client, type Focus, type Holding, type Preferences } from '@/lib/live/types';

type Draft = { clients: string[]; sectors: string[]; focusTopics: string[]; focusSymbols: string[]; watch: string[] };
const MAX_WATCH = 20;
const TICKER = /^[A-Z0-9.\-]{1,15}$/;
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const sorted = (d: Draft) => JSON.stringify(Object.values(d).map((v) => [...v].sort()));
const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);

const TextLink = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="cursor-pointer text-[12.5px] text-brand-600 hover:underline">
    {children}
  </button>
);
const Step = ({ n }: { n: number }) => (
  <span
    aria-hidden="true"
    className="num mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white"
  >
    {n}
  </span>
);

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
  const edit = (change: (d: Draft) => Draft) => {
    setP(change);
    if (state !== 'saving') {
      setState('idle');
      setMsg('');
    }
  };

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

  const summary = [
    p.clients.length
      ? plural(p.clients.length, 'client') + ' of ' + clients.length
      : 'All ' + clients.length + ' clients',
    plural(inPlay.length, 'position'),
    p.focusTopics.length ? plural(p.focusTopics.length, 'topic') + ' only' : 'all topics',
    chosenStocks.length ? plural(chosenStocks.length, 'stock') + ' only' : 'all stocks',
  ].join(' · ');

  return (
    <form onSubmit={save} className="space-y-5" aria-busy={saving}>
      <div className="rounded-lg border border-line bg-sunken/50 px-4 py-3">
        <p className="eyebrow">Your brief will show</p>
        <p className="mt-1 text-[13.5px] font-medium text-ink">{summary}</p>
      </div>

      <Card>
        <CardHeader
          title={
            <>
              <Step n={1} />
              Clients
            </>
          }
          sub="The brief, client list and search show only the clients you tick. Tick none to show your whole book."
          right={
            clients.length ? (
              <TextLink
                onClick={() =>
                  edit((x) => ({ ...x, clients: x.clients.length === clients.length ? [] : clients.map((c) => c.id) }))
                }
              >
                {p.clients.length === clients.length ? 'Clear all' : 'Select all'}
              </TextLink>
            ) : null
          }
        />
        <CardBody>
          {!clients.length ? (
            <p className="text-[13px] text-muted">No clients are assigned to you yet.</p>
          ) : (
            <>
              {clients.length > 8 ? (
                <label className="mb-3 flex h-9 items-center rounded-lg border border-line-strong bg-surface focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-100">
                  <Search size={14} aria-hidden="true" className="ml-3 shrink-0 text-muted" />
                  <input
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                    aria-label="Find a client or stock"
                    placeholder="Find a client or stock…"
                    className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] outline-none placeholder:text-muted"
                  />
                </label>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {shown.map((c) => {
                  const on = p.clients.includes(c.id);
                  return (
                    <button
                      type="button"
                      key={c.id}
                      role="checkbox"
                      aria-checked={on}
                      disabled={saving}
                      onClick={() => edit((x) => ({ ...x, clients: toggle(x.clients, c.id) }))}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 ${on ? 'border-brand/50 bg-brand-50' : 'border-line-strong hover:bg-sunken'}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface'}`}
                      >
                        {on ? <Check size={11} strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13.5px] font-medium text-ink">{c.name}</span>
                          <span className="num shrink-0 text-[11px] text-muted">{plural(c.holdings, 'position')}</span>
                        </span>
                        <span className="mono mt-0.5 block truncate text-[11.5px] text-muted">
                          {c.symbols.join(' · ')}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {!shown.length ? <p className="text-[13px] text-muted">No client matches “{find.trim()}”.</p> : null}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <>
              <Step n={2} />
              Topics you cover
            </>
          }
          sub="News on your clients’ holdings is always included. These topics add wider industry news to the brief."
          right={
            p.sectors.length ? (
              <TextLink onClick={() => edit((x) => ({ ...x, sectors: [] }))}>Clear ({p.sectors.length})</TextLink>
            ) : null
          }
        />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <Chip
                key={t}
                disabled={saving}
                selected={p.sectors.includes(t)}
                onClick={() => edit((x) => ({ ...x, sectors: toggle(x.sectors, t) }))}
              >
                {t}
              </Chip>
            ))}
          </div>
          <label htmlFor="watch" className="mt-5 block text-[13px] font-medium text-ink">
            Extra stocks to watch{' '}
            <span className="num font-normal text-muted">
              ({p.watch.length}/{MAX_WATCH})
            </span>
          </label>
          <div className="mt-2 flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-100">
            {p.watch.map((s) => (
              <span
                key={s}
                className="mono inline-flex h-6 items-center gap-1 rounded-md border border-line-strong bg-sunken pl-2 pr-1 text-[12px] font-semibold text-ink"
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
              className="mono h-6 min-w-[160px] flex-1 bg-transparent px-1 text-[13px] uppercase outline-none placeholder:normal-case placeholder:text-muted"
            />
          </div>
          <p id="watch-help" className={`mt-1.5 text-[12px] ${entryError ? 'text-down' : 'text-muted'}`}>
            {entryError ||
              'Press Enter or comma to add. Changing topics or this list rebuilds today’s brief, so saving takes a little longer.'}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={
            <>
              <Step n={3} />
              Brief filters
              <span className="ml-2 text-[12px] font-normal text-muted">optional</span>
            </>
          }
          sub="Narrow the headlines on the main brief. Leave both empty to see everything."
          right={
            p.focusTopics.length || chosenStocks.length ? (
              <TextLink onClick={() => edit((x) => ({ ...x, focusTopics: [], focusSymbols: [] }))}>
                Clear filters
              </TextLink>
            ) : null
          }
        />
        <CardBody className="space-y-5">
          <div>
            <p className="eyebrow mb-2">
              Only these topics · {p.focusTopics.length ? p.focusTopics.length + ' chosen' : 'showing all'}
            </p>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <Chip
                  key={t}
                  disabled={saving}
                  selected={p.focusTopics.includes(t)}
                  onClick={() => edit((x) => ({ ...x, focusTopics: toggle(x.focusTopics, t) }))}
                >
                  {t}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2">
              Only these stocks · {chosenStocks.length ? chosenStocks.length + ' chosen' : 'showing all'}
            </p>
            {stocks.length ? (
              <div className="flex flex-wrap gap-2">
                {stocks.map((s) => (
                  <Chip
                    key={s}
                    disabled={saving}
                    selected={chosenStocks.includes(s)}
                    onClick={() => edit((x) => ({ ...x, focusSymbols: toggle(chosenStocks, s) }))}
                  >
                    <span className="mono">{s}</span>
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">The chosen clients have no holdings on record.</p>
            )}
            {p.focusSymbols.length > chosenStocks.length ? (
              <p className="mt-2 text-[12px] text-muted">
                Stocks held only by clients you unticked were removed from this filter.
              </p>
            ) : null}
          </div>
        </CardBody>
      </Card>

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
            ) : null}
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
