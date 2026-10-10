'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Status } from '@/components/ui/status';
import { cn } from '@/lib/cn';
import { FEED_BY_KEY, SECTION_FEEDS } from '@/lib/feeds/registry';
import { FEED_STATUS } from './feed-status';
import { etTime, feedUiStatus, fmtInt, fmtMs, type RunView } from './model';

const EXTRA_SECTIONS: Record<string, string> = {
  cards: 'Call cards (client book)',
  delivery: 'Email digest delivery',
  all: 'Every brief (information barrier)',
};

function Meta({ k, children, mono = true }: { k: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 py-1.5 text-[12.5px]">
      <dt className="text-muted">{k}</dt>
      <dd className={cn('min-w-0 break-words text-ink', mono && 'num font-mono text-[12px]')}>{children}</dd>
    </div>
  );
}

const logParts = (l: string): [string, string] => {
  const m = /^(\S+)\s{2,}(.*)$/.exec(l);
  return m ? [m[1], m[2]] : ['', l];
};

export function FeedDrawer({
  feedKey,
  view,
  ingestDone,
  onClose,
}: {
  feedKey: string | null;
  view: RunView;
  ingestDone: boolean;
  onClose: () => void;
}) {
  const def = feedKey ? FEED_BY_KEY.get(feedKey) : undefined;
  const f = feedKey ? view.feeds[feedKey] : undefined;
  const ui = feedUiStatus(f, view.status, ingestDone);
  const st = FEED_STATUS[ui];
  const bad = ui === 'down' || ui === 'delayed';
  const bads = (k: string) => {
    const s = view.feeds[k]?.status;
    return s === 'down' || s === 'delayed';
  };
  const sample = f?.sample?.length ? JSON.stringify(f.sample, null, 2) : null;
  const error = f?.detail?.error as string | undefined;
  const store = f?.detail?.store as string | undefined;

  return (
    <Dialog.Root
      open={Boolean(def)}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(540px,100vw)] flex-col border-l border-line bg-surface shadow-pop focus:outline-none">
          {def ? (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <Dialog.Title className="text-[15px] font-semibold text-ink">{def.name}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-[13px] leading-snug text-muted">
                    {def.description}
                  </Dialog.Description>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                    <Status tone={st.tone}>{st.label}</Status>
                    <Badge tone="outline">{def.transport}</Badge>
                    <span className="text-[12px] text-muted">{def.vendor}</span>
                  </div>
                </div>
                <Dialog.Close
                  className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-sunken focus-visible:outline-2 focus-visible:outline-brand"
                  aria-label="Close"
                >
                  <X size={16} strokeWidth={1.5} />
                </Dialog.Close>
              </div>

              <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
                {bad ? (
                  <div
                    role="alert"
                    className={cn(
                      'rounded-lg border px-3.5 py-3 text-[13px] leading-snug',
                      ui === 'down' ? 'border-down/30 bg-down-50 text-down' : 'border-amber/30 bg-amber-50 text-amber',
                    )}
                  >
                    <p className="font-semibold">{ui === 'down' ? 'Down' : 'Delayed'}: data temporarily unavailable</p>
                    {error ? <p className="mt-0.5 text-ink-2">{error}.</p> : null}
                    <p className="mt-0.5 text-ink-2">
                      Sections that need this feed are left out of every brief rather than showing stale figures.
                    </p>
                  </div>
                ) : null}

                <section aria-labelledby="fd-conn">
                  <h3 id="fd-conn" className="eyebrow mb-1">
                    Connection
                  </h3>
                  <dl className="divide-y divide-line">
                    <Meta k="Endpoint">{def.endpoint}</Meta>
                    <Meta k="Cadence" mono={false}>
                      {def.cadence}
                    </Meta>
                    <Meta k="SLA">{def.slaTime} ET</Meta>
                    <Meta k="As of">{f?.asOf ? `${etTime(f.asOf, true)} ET` : '—'}</Meta>
                    <Meta k="Latency">{f && ui !== 'connecting' ? fmtMs(f.latencyMs) : '—'}</Meta>
                    <Meta k="Rows">{f && ui !== 'connecting' ? fmtInt(f.rows) : '—'}</Meta>
                    {store ? <Meta k="Stored in">{store}</Meta> : null}
                  </dl>
                </section>

                <section aria-labelledby="fd-sec">
                  <h3 id="fd-sec" className="eyebrow mb-2">
                    Brief sections that depend on it
                  </h3>
                  <ul className="divide-y divide-line rounded-lg border border-line">
                    {def.sections.map((k) => {
                      const sec = SECTION_FEEDS[k];
                      const label = sec?.label ?? EXTRA_SECTIONS[k] ?? k;
                      const cause = sec ? sec.required.find(bads) : bad ? def.key : undefined;
                      const known = Boolean(sec);
                      return (
                        <li key={k} className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-[13px]">
                          <span className="min-w-0">
                            <span className="block font-medium text-ink">{label}</span>
                            {cause && cause !== def.key ? (
                              <span className="block text-[12px] text-muted">
                                Also needs {FEED_BY_KEY.get(cause)?.name}
                              </span>
                            ) : null}
                            {known && sec.required.length > 1 && !cause ? (
                              <span className="block text-[12px] text-muted">
                                Also needs{' '}
                                {sec.required
                                  .filter((r) => r !== def.key)
                                  .map((r) => FEED_BY_KEY.get(r)?.name)
                                  .join(', ')}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 pt-px">
                            {!f || ui === 'connecting' || ui === 'queued' ? (
                              <Status tone="idle">Pending</Status>
                            ) : cause ? (
                              <Status tone="bad">Withheld: data temporarily unavailable</Status>
                            ) : known ? (
                              <Status tone="ok">Published</Status>
                            ) : (
                              <Status tone="idle">Uses this feed</Status>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <section aria-labelledby="fd-log">
                  <h3 id="fd-log" className="eyebrow mb-2">
                    Connection log
                  </h3>
                  <div
                    role="log"
                    aria-label={`${def.name} connection log`}
                    tabIndex={0}
                    className="scroll-thin max-h-60 overflow-auto rounded-lg bg-sunken px-3 py-2.5 font-mono text-[12px] leading-[1.6] focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    {f?.log.length ? (
                      f.log.map((l, i) => {
                        const [k, rest] = logParts(l);
                        return (
                          <p
                            key={i}
                            className={cn(
                              'grid grid-cols-[64px_minmax(0,1fr)] gap-x-2',
                              /^(fail|retry)/.test(k) ? 'text-down' : 'text-ink-2',
                            )}
                          >
                            <span className="text-muted">{k}</span>
                            <span className="min-w-0 break-words">{rest}</span>
                          </p>
                        );
                      })
                    ) : (
                      <p className="text-muted">
                        {ui === 'queued' ? 'Waiting for the pull to start.' : 'No log recorded for this connector.'}
                      </p>
                    )}
                  </div>
                </section>

                <section aria-labelledby="fd-sample">
                  <h3 id="fd-sample" className="eyebrow mb-2">
                    Sample payload
                  </h3>
                  {sample ? (
                    <pre
                      tabIndex={0}
                      className="scroll-thin max-h-72 overflow-auto rounded-lg bg-sunken px-3 py-2.5 font-mono text-[12px] leading-[1.55] text-ink-2 focus-visible:outline-2 focus-visible:outline-brand"
                      aria-label="Sample payload, JSON"
                    >
                      {sample}
                    </pre>
                  ) : (
                    <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-[12.5px] text-muted">
                      {bad ? 'No records were accepted from this connector.' : 'No payload yet.'}
                    </p>
                  )}
                  <p className="mt-1.5 text-[12px] text-muted">Sample records returned by this connector.</p>
                </section>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
