'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, History, Info, Mail, RefreshCw, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { ReportContext } from './report-context';
import { BriefAssistant } from './brief-assistant';
import { ClientsDialog } from './clients-dialog';
import { ReportContent, HoldingsTable, type MarketPanel } from './report-content';
import { displayDay, stamp } from '@/lib/live/time';
import { filterStories } from '@/lib/live/presentation';
import type { Client, Filters, Holding, Report } from '@/lib/live/types';
import type { HistoryEntry } from '@/lib/live/reports';
const SECTIONS = [
  ['today-news', 'Key events'],
  ['market-snapshot', 'Markets'],
  ['market-detail', 'Data & sources'],
  ['market-wrap', 'Wrap'],
  ['client-book', 'My book'],
  ['coverage-news', 'Headlines'],
] as const;
export function BriefView({
  report,
  clients,
  clientId,
  holdings,
  filters,
  date,
  today,
  history = [],
  market,
}: {
  report: Report | null;
  clients: Client[];
  clientId: string | null;
  holdings: Holding[];
  filters: Filters;
  date: string;
  today?: string;
  history?: HistoryEntry[];
  market?: MarketPanel;
}) {
  const archived = Boolean(today && date < today),
    latest = history[0];
  const router = useRouter(),
    [pending, start] = useTransition(),
    [refreshing, setRefreshing] = useState(false),
    [exporting, setExporting] = useState(false),
    [mailing, setMailing] = useState(false),
    [message, setMessage] = useState(''),
    [section, setSection] = useState('today-news');
  const readerContext = useMemo(
    () => ({ reportId: report?.id ?? '', clientId, symbol: filters.symbol }),
    [report?.id, clientId, filters.symbol],
  );
  const update = (field: string, value: string) => {
    const p = new URLSearchParams(window.location.search);
    p.delete('report');
    if (field === 'client') {
      p.delete('symbol');
      p.delete('q');
      p.delete('topic');
    }
    if (value) p.set(field, value);
    else p.delete(field);
    start(() => router.push('/brief' + (p.size ? '?' + p.toString() : ''), { scroll: false }));
  };
  // Each call does a bounded slice of source work and publishes; keep going while sources are still queued.
  const refresh = async () => {
    setRefreshing(true);
    setMessage('Checking market data, news, charts and the calendar…');
    try {
      for (let step = 0; step < 12; step++) {
        const r = await fetch('/api/live/refresh', { method: 'POST', signal: AbortSignal.timeout(75000) });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? 'Refresh unavailable');
        router.refresh();
        if (!b.pending) break;
        setMessage(
          'Still collecting: ' +
            b.pending +
            ' source ' +
            (b.pending === 1 ? 'check' : 'checks') +
            ' left. The brief updates as each step finishes.',
        );
        // Continue at once while work is getting done; a source that is backing off after a failure gets a short pause.
        await new Promise((res) => setTimeout(res, b.completed ? 2000 : 10000));
      }
      setMessage('Brief updated from available sources.');
    } catch (e) {
      setMessage(
        e instanceof Error && e.name !== 'TimeoutError'
          ? e.message
          : 'Refresh is taking longer than expected. Your saved report remains available.',
      );
    } finally {
      setRefreshing(false);
    }
  };
  const email = async () => {
    setMailing(true);
    setMessage('');
    try {
      const r = await fetch('/api/live/email', { method: 'POST', signal: AbortSignal.timeout(65000) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? 'Email unavailable');
      setMessage('Morning brief emailed to the desk distribution list, with the PDF attached.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Email unavailable. Try again shortly.');
    } finally {
      setMailing(false);
    }
  };
  const download = async () => {
    if (!report) return;
    setExporting(true);
    setMessage('');
    try {
      const p = new URLSearchParams({ report: report.id, q: filters.q, topic: filters.topic, symbol: filters.symbol });
      if (clientId) p.set('client', clientId);
      const r = await fetch('/api/live/export?' + p.toString());
      if (!r.ok) {
        const b = await r.json();
        throw new Error(b.error ?? 'Could not export this report');
      }
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement('a');
      a.href = url;
      a.download = 'market-brief-' + report.businessDate + '-' + report.id.slice(0, 8) + '.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not export this report. Try again.');
    } finally {
      setExporting(false);
    }
  };
  const current = clientId ? holdings.filter((h) => h.clientId === clientId) : holdings,
    active = Boolean(filters.q || filters.topic || filters.symbol);
  const count = report ? filterStories(report, filters).length : 0;
  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-line bg-surface px-5 py-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Sales intelligence</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-[24px] font-semibold leading-none tracking-[-0.03em]">Morning brief</h1>
              {archived ? (
                <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-2">
                  Archived
                </span>
              ) : null}
              {report ? (
                <span className="text-[12px] font-medium text-muted">
                  {archived ? 'Published' : 'Updated'} {stamp(report.cutoff)}
                </span>
              ) : archived ? null : (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber">
                  Not published yet
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">
              {displayDay(date)} · US Eastern Time{archived ? ' · read-only snapshot' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ClientsDialog
              clients={clients}
              holdings={holdings}
              selected={clientId}
              onSelect={(id) => update('client', id)}
            >
              <Button size="md" variant="secondary">
                <Users size={14} />
                Clients
                <span className="num rounded-md bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">
                  {clients.length}
                </span>
              </Button>
            </ClientsDialog>
            <Select
              label="Brief date"
              value={archived ? date : ''}
              onChange={(v) => update('date', v)}
              disabled={pending}
              icon={<History size={14} />}
              className="w-48"
              align="end"
              options={[
                { value: '', label: 'Today' },
                ...history.map((h) => ({
                  value: h.businessDate,
                  label: displayDay(h.businessDate),
                  hint: String(h.stories),
                })),
              ]}
            />
            {archived ? (
              <Button size="md" variant="secondary" onClick={() => update('date', '')} disabled={pending}>
                <ArrowLeft size={14} />
                Today
              </Button>
            ) : null}
            <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-line sm:block" />
            <div className="inline-flex overflow-hidden rounded-lg border border-line-strong shadow-[0_1px_0_rgba(14,22,39,0.03)]">
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing || archived}
                title={archived ? 'Past briefs are fixed snapshots' : undefined}
                className="inline-flex h-9 items-center gap-1.5 bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-60"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Updating…' : 'Refresh'}
              </button>
              <button
                type="button"
                onClick={download}
                disabled={!report || pending || exporting}
                className="inline-flex h-9 items-center gap-1.5 border-l border-line-strong bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-sunken disabled:opacity-60"
              >
                <Download size={14} />
                {exporting ? 'Preparing…' : 'PDF'}
              </button>
            </div>
            <Button
              size="md"
              variant="dark"
              onClick={email}
              disabled={!report || mailing || archived}
              title={archived ? 'Email sends today’s brief' : undefined}
            >
              <Mail size={14} />
              {mailing ? 'Sending…' : 'Email brief'}
            </Button>
          </div>
        </div>
      </header>
      <div className="sticky top-0 z-20 rounded-xl border border-line bg-surface/95 shadow-card backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <Select
            label="Client"
            value={clientId ?? ''}
            onChange={(v) => update('client', v)}
            disabled={pending}
            searchable
            icon={<Users size={14} />}
            className="w-full sm:w-64"
            options={[
              { value: '', label: 'All my clients', hint: String(holdings.length) },
              ...clients.map((c) => ({ value: c.id, label: c.name, hint: String(c.holdings) })),
            ]}
          />
          <form
            className="min-w-[220px] flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              update('q', String(new FormData(e.currentTarget).get('q') ?? ''));
            }}
          >
            <label className="flex h-9 items-center rounded-lg border border-line-strong bg-surface transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-100 hover:border-brand">
              <Search size={14} aria-hidden="true" className="ml-3 shrink-0 text-muted" />
              <input
                name="q"
                aria-label="Search news"
                defaultValue={filters.q}
                key={filters.q}
                maxLength={160}
                placeholder="Search headlines, companies, events…"
                disabled={pending}
                className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] outline-none placeholder:text-muted"
              />
              <kbd className="mr-2.5 hidden rounded border border-line bg-sunken px-1.5 text-[10px] text-muted sm:inline">
                ↵
              </kbd>
            </label>
          </form>
          <Link
            href="/setup"
            title="Choose clients, topics and stocks in Brief setup"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors hover:border-brand hover:text-brand"
          >
            <SlidersHorizontal size={14} />
            Brief setup
          </Link>
          {active ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const p = new URLSearchParams();
                if (clientId) p.set('client', clientId);
                if (archived) p.set('date', date);
                start(() => router.push('/brief' + (p.size ? '?' + p.toString() : ''), { scroll: false }));
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-medium text-brand hover:bg-brand-50"
            >
              <X size={13} />
              Clear
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3">
          <nav aria-label="Brief sections" className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
            {SECTIONS.map(([id, l]) => (
              <a
                key={id}
                href={'#' + id}
                onClick={() => setSection(id)}
                className={
                  'whitespace-nowrap border-b-2 px-2.5 py-2 text-[12px] font-semibold transition-colors ' +
                  (section === id ? 'border-brand text-brand' : 'border-transparent text-ink-2 hover:text-ink')
                }
              >
                {l}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-4 py-2 text-[11.5px] text-muted lg:flex">
            <span>
              <span className="num font-semibold text-ink">{clientId ? 1 : clients.length}</span>{' '}
              {clientId || clients.length === 1 ? 'client' : 'clients'}
            </span>
            <span>
              <span className="num font-semibold text-ink">{current.length}</span> positions
            </span>
            <span>
              <span className="num font-semibold text-ink">{report ? count : 0}</span> developments
            </span>
          </div>
        </div>
      </div>
      {pending || refreshing ? (
        <div
          role="status"
          aria-live="polite"
          className="overflow-hidden rounded-lg border border-line bg-surface shadow-card"
        >
          <div className="loading-bar" />
          <p className="px-3.5 py-2 text-[12.5px] font-medium text-ink-2">
            {refreshing ? 'Updating your brief from live sources…' : 'Loading…'}
          </p>
        </div>
      ) : null}
      {message ? (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink-2 shadow-card"
        >
          <Info size={14} className="shrink-0 text-brand" />
          <span className="flex-1">{message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setMessage('')}
            className="rounded p-1 text-muted hover:bg-sunken hover:text-ink"
          >
            <X size={13} />
          </button>
        </div>
      ) : null}
      <div aria-busy={pending} className={pending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        {report ? (
          <ReportContext.Provider value={readerContext}>
            <ReportContent report={report} filters={filters} market={market} />
          </ReportContext.Provider>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardBody>
                {archived ? (
                  <>
                    <h2 className="text-sm font-semibold">
                      No brief was published for this view on {displayDay(date)}
                    </h2>
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      Pick another date from the history, or switch the client filter.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-sm font-semibold">Today’s brief isn’t published yet</h2>
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      Refresh to prepare it from available sources. The scheduled run also publishes it through the day.
                    </p>
                    {latest ? (
                      <button
                        type="button"
                        onClick={() => update('date', latest.businessDate)}
                        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline"
                      >
                        <History size={13} />
                        View the latest brief ({displayDay(latest.businessDate)})
                      </button>
                    ) : null}
                  </>
                )}
              </CardBody>
            </Card>
            <Card>
              <HoldingsTable holdings={current} />
            </Card>
          </div>
        )}
      </div>
      {report ? (
        <ReportContext.Provider value={readerContext}>
          <BriefAssistant
            key={report.id + JSON.stringify(filters)}
            report={report}
            filters={filters}
            clients={clients}
            archived={archived}
            days={history.map((h) => h.businessDate)}
            today={today}
          />
        </ReportContext.Provider>
      ) : null}
    </div>
  );
}
