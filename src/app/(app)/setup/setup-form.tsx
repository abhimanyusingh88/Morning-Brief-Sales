'use client';
import { Check, Loader2 } from 'lucide-react';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { TOPICS, type Client, type Focus, type Holding, type Preferences } from '@/lib/live/types';

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const tickers = (s: string) => [
  ...new Set(
    s
      .split(/[\s,]+/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean),
  ),
];
const TextLink = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="cursor-pointer text-[12.5px] text-brand-600 hover:underline">
    {children}
  </button>
);

/** Brief setup: which clients, topics and stocks the brief shows. Display choices apply as soon as they are saved. */
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
  const [p, setP] = React.useState({
    clients: focus.clients,
    sectors: prefs.sectors,
    focusTopics: focus.topics,
    focusSymbols: focus.symbols,
    watch: prefs.symbols.join(', '),
  });
  const [state, setState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = React.useState('');
  // Stocks on offer follow the chosen clients; with none chosen, the whole book is in play.
  const inPlay = holdings.filter((h) => !p.clients.length || p.clients.includes(h.clientId)),
    stocks = [...new Set(inPlay.map((h) => h.symbol))].sort(),
    chosenStocks = p.focusSymbols.filter((s) => stocks.includes(s));
  const watch = tickers(p.watch),
    badWatch = watch.length > 20 || watch.some((s) => !/^[A-Z0-9.\-]{1,15}$/.test(s));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('saving');
    setMsg('');
    try {
      const r = await fetch('/api/live/interests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectors: p.sectors,
          symbols: watch,
          clients: p.clients,
          focusTopics: p.focusTopics,
          focusSymbols: chosenStocks,
        }),
        signal: AbortSignal.timeout(90000),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? 'Could not save');
      setMsg(
        body.rebuilt
          ? 'Saved. Today’s brief was rebuilt with your topics and watchlist.'
          : 'Saved. Your brief now shows these choices.',
      );
      setState('saved');
      router.refresh();
    } catch (err) {
      setMsg(
        err instanceof Error && err.name !== 'TimeoutError'
          ? err.message
          : 'Saving is taking longer than expected. Check your brief, then try again if needed.',
      );
      setState('error');
    }
  };

  return (
    <form onSubmit={save} className="space-y-5" aria-busy={state === 'saving'}>
      <Card>
        <CardHeader
          title="Clients"
          sub="The brief, client list and search show only the clients you choose. Choose none to show your whole book."
          right={
            <TextLink
              onClick={() =>
                setP((x) => ({ ...x, clients: x.clients.length === clients.length ? [] : clients.map((c) => c.id) }))
              }
            >
              {p.clients.length === clients.length ? 'Clear all' : 'Select all'}
            </TextLink>
          }
        />
        <CardBody>
          {clients.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {clients.map((c) => {
                const on = p.clients.includes(c.id);
                return (
                  <button
                    type="button"
                    key={c.id}
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setP((x) => ({ ...x, clients: toggle(x.clients, c.id) }))}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors ${on ? 'border-brand/50 bg-brand-50' : 'border-line-strong hover:bg-sunken'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface'}`}
                    >
                      {on ? <Check size={11} strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-ink">{c.name}</span>
                      <span className="mono mt-0.5 block truncate text-[11.5px] text-muted">
                        {c.symbols.join(' · ')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[13px] text-muted">No clients are assigned to you yet.</p>
          )}
          <p className="mt-3 text-[12px] text-muted">
            {p.clients.length
              ? `${p.clients.length} of ${clients.length} clients chosen · ${inPlay.length} positions`
              : `Showing all ${clients.length} clients · ${holdings.length} positions`}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Topics you cover"
          sub="News on your clients’ holdings is always included. These topics add wider industry news to the brief."
        />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <Chip
                key={t}
                selected={p.sectors.includes(t)}
                onClick={() => setP((x) => ({ ...x, sectors: toggle(x.sectors, t) }))}
              >
                {t}
              </Chip>
            ))}
          </div>
          <label htmlFor="watch" className="mt-5 block text-[13px] font-medium text-ink">
            Additional public stock watchlist
          </label>
          <input
            id="watch"
            value={p.watch}
            onChange={(e) => setP((x) => ({ ...x, watch: e.target.value }))}
            maxLength={300}
            placeholder="Tickers, separated by commas"
            aria-invalid={badWatch}
            className="mono mt-2 block h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] outline-none focus:border-brand focus:ring-2 focus:ring-brand-100"
          />
          <p className={`mt-1.5 text-[12px] ${badWatch ? 'text-down' : 'text-muted'}`}>
            {badWatch
              ? 'Use up to twenty tickers, letters and numbers only.'
              : 'Changing topics or the watchlist rebuilds today’s brief, which can take a little longer to save.'}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Brief filters"
          sub="Narrow the headlines on the main brief. Leave both empty to see everything."
          right={
            p.focusTopics.length || chosenStocks.length ? (
              <TextLink onClick={() => setP((x) => ({ ...x, focusTopics: [], focusSymbols: [] }))}>
                Clear filters
              </TextLink>
            ) : null
          }
        />
        <CardBody className="space-y-5">
          <div>
            <p className="eyebrow mb-2">Only these topics</p>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <Chip
                  key={t}
                  selected={p.focusTopics.includes(t)}
                  onClick={() => setP((x) => ({ ...x, focusTopics: toggle(x.focusTopics, t) }))}
                >
                  {t}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2">Only these stocks</p>
            {stocks.length ? (
              <div className="flex flex-wrap gap-2">
                {stocks.map((s) => (
                  <Chip
                    key={s}
                    selected={chosenStocks.includes(s)}
                    onClick={() => setP((x) => ({ ...x, focusSymbols: toggle(chosenStocks, s) }))}
                  >
                    <span className="mono">{s}</span>
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">The chosen clients have no holdings on record.</p>
            )}
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={state === 'saving' || badWatch}>
          {state === 'saving' ? (
            <Loader2 size={14} className="animate-spin" />
          ) : state === 'saved' ? (
            <Check size={14} />
          ) : null}{' '}
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save setup'}
        </Button>
        {msg ? (
          <p
            role={state === 'error' ? 'alert' : 'status'}
            className={`text-[13px] ${state === 'error' ? 'text-down' : 'text-ink-2'}`}
          >
            {msg}
          </p>
        ) : null}
        <p className="w-full text-[12px] text-muted">All report dates and times use US Eastern Time.</p>
      </div>
    </form>
  );
}
