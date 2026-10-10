'use client';
import { ChevronDown, Loader2, Play, Plus, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { FEEDS } from '@/lib/feeds/registry';
import { CATEGORY_LABEL, CATEGORY_ORDER } from './model';
import { Segmented } from './segmented';

export interface RunSettings {
  date: string;
  scenarios: string[];
  timelapse: boolean;
  useLlm: boolean;
  bypassCache: boolean;
  qcFlag: boolean;
  outages: Record<string, 'down' | 'delayed'>;
}
interface Ai {
  configured: boolean;
  ok: boolean;
  model: string;
}

const FIELD =
  'h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50';

function Row({
  title,
  hint,
  children,
  id,
}: {
  title: string;
  hint: React.ReactNode;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p id={id} className="text-[13px] font-medium text-ink">
          {title}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-muted">{hint}</p>
      </div>
      {children}
    </div>
  );
}

export function ControlBar({
  scenarios,
  defaults,
  canRun,
  running,
  onStarted,
}: {
  scenarios: { key: string; label: string }[];
  defaults: { date: string; scenarios: string[] };
  canRun: boolean;
  /** a run is in progress (started here or elsewhere) */
  running: boolean;
  /** a run was started, or an already running one was found: show it */
  onStarted: (runId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; runId?: string } | null>(null);
  const [ai, setAi] = React.useState<Ai | null>(null);
  const [aiErr, setAiErr] = React.useState(false);
  const [s, setS] = React.useState<RunSettings>({
    date: defaults.date,
    scenarios: defaults.scenarios,
    timelapse: true,
    useLlm: false,
    bypassCache: false,
    qcFlag: false,
    outages: {},
  });
  const [pickFeed, setPickFeed] = React.useState('');
  const [pickKind, setPickKind] = React.useState<'down' | 'delayed'>('down');
  const set = <K extends keyof RunSettings>(k: K, v: RunSettings[K]) => setS((x) => ({ ...x, [k]: v }));

  React.useEffect(() => {
    let live = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        const a: Ai = {
          configured: Boolean(j.ai?.configured),
          ok: Boolean(j.ai?.ok),
          model: String(j.ai?.model ?? ''),
        };
        setAi(a);
        setS((x) => ({ ...x, useLlm: a.configured && a.ok }));
      })
      .catch(() => {
        if (live) setAiErr(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const modelUsable = Boolean(ai?.configured && ai.ok);
  const available = FEEDS.filter((f) => !(f.key in s.outages));
  const feedName = (k: string) => FEEDS.find((f) => f.key === k)?.name ?? k;
  const problems = Object.entries(s.outages);
  const addProblem = () => {
    const key = pickFeed || available[0]?.key;
    if (!key) return;
    set('outages', { ...s.outages, [key]: pickKind });
    setPickFeed('');
  };
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        date: s.date,
        scenarios: s.scenarios,
        timelapse: s.timelapse,
        qcFlag: s.qcFlag,
        useLlm: s.useLlm && modelUsable,
        bypassCache: s.bypassCache && s.useLlm && modelUsable,
      };
      if (Object.keys(s.outages).length) body.outages = s.outages;
      const r = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 202) {
        setOpen(false);
        onStarted(String(j.runId));
      } else
        setError({
          message: String(j.error ?? 'Could not start the run'),
          runId: r.status === 409 ? String(j.runId) : undefined,
        });
    } catch {
      setError({ message: 'Could not reach the server. Check the connection and try again.' });
    } finally {
      setBusy(false);
    }
  };
  const disabled = !canRun || busy || running || !s.scenarios.length || !s.date;

  const summary = [
    s.timelapse ? 'Time-lapse' : 'Instant',
    s.useLlm ? (s.bypassCache ? 'Fresh model calls' : 'Stored model output') : 'Template writer',
    ...(problems.length ? [`${problems.length} feed problem${problems.length > 1 ? 's' : ''}`] : []),
    ...(s.qcFlag ? ['QC holds one'] : []),
  ].join(' · ');

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-ink">Run configuration</h2>
          <p className="mt-0.5 text-xs text-muted">
            {fmtDate(s.date, { month: 'short', day: 'numeric', year: 'numeric' })} · {summary}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="run-options"
          >
            Options{' '}
            <ChevronDown size={14} strokeWidth={1.5} className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={start}
            disabled={disabled}
            title={canRun ? undefined : 'Only an administrator or a desk head can run the morning'}
          >
            {busy || running ? (
              <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Play size={16} strokeWidth={1.5} />
            )}
            {busy ? 'Starting' : running ? 'Running' : 'Run the morning'}
          </Button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="mx-5 mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-down/30 bg-down-50 px-3 py-2 text-[13px] text-down"
        >
          <span>{error.message}</span>
          {error.runId ? (
            <button
              type="button"
              className="cursor-pointer font-medium underline underline-offset-2"
              onClick={() => onStarted(error.runId!)}
            >
              Watch it
            </button>
          ) : null}
        </div>
      ) : null}
      {!canRun ? (
        <p className="mx-5 mb-4 text-[12.5px] text-muted">
          You can watch and replay runs. Starting one is for administrators and desk heads.
        </p>
      ) : null}

      <div id="run-options" hidden={!open} className="border-t border-line">
        <div className="grid gap-x-10 gap-y-6 px-5 py-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            <fieldset>
              <legend className="eyebrow mb-2">Market storyline</legend>
              <div className="flex flex-wrap gap-2">
                {scenarios.map((sc) => (
                  <Chip
                    key={sc.key}
                    selected={s.scenarios.includes(sc.key)}
                    onClick={() =>
                      set(
                        'scenarios',
                        s.scenarios.includes(sc.key)
                          ? s.scenarios.filter((x) => x !== sc.key)
                          : [...s.scenarios, sc.key],
                      )
                    }
                  >
                    {sc.label}
                  </Chip>
                ))}
              </div>
              {!s.scenarios.length ? <p className="mt-2 text-[12px] text-down">Pick at least one storyline.</p> : null}
            </fieldset>

            <fieldset>
              <legend className="eyebrow mb-2">Simulate a feed problem</legend>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Feed"
                  className={cn(FIELD, 'min-w-0 flex-1 basis-56')}
                  value={pickFeed || available[0]?.key || ''}
                  onChange={(e) => setPickFeed(e.target.value)}
                  disabled={!available.length}
                >
                  {CATEGORY_ORDER.map((c) => {
                    const list = available.filter((f) => f.category === c);
                    return list.length ? (
                      <optgroup key={c} label={CATEGORY_LABEL[c]}>
                        {list.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
                <Segmented
                  size="md"
                  label="Problem type"
                  value={pickKind}
                  onChange={setPickKind}
                  options={[
                    { value: 'down', label: 'Down' },
                    { value: 'delayed', label: 'Delayed' },
                  ]}
                />
                <Button size="md" onClick={addProblem} disabled={!available.length}>
                  <Plus size={14} strokeWidth={1.5} /> Add
                </Button>
              </div>
              {problems.length ? (
                <ul className="mt-2.5 flex flex-wrap gap-2">
                  {problems.map(([k, kind]) => (
                    <li
                      key={k}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-full border pl-3 pr-1 text-[12.5px] font-medium',
                        kind === 'down'
                          ? 'border-down/30 bg-down-50 text-down'
                          : 'border-amber/30 bg-amber-50 text-amber',
                      )}
                    >
                      {feedName(k)} · {kind === 'down' ? 'Down' : 'Delayed'}
                      <button
                        type="button"
                        aria-label={`Remove ${feedName(k)}`}
                        className="grid h-5 w-5 cursor-pointer place-items-center rounded-full hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-brand"
                        onClick={() => set('outages', Object.fromEntries(problems.filter(([x]) => x !== k)))}
                      >
                        <X size={12} strokeWidth={1.5} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[12px] text-muted">
                  None. Affected sections are withheld with &ldquo;data temporarily unavailable&rdquo; instead of
                  showing stale figures.
                </p>
              )}
            </fieldset>
          </div>

          <div className="space-y-5">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <label className="block">
                <span className="eyebrow mb-2 block">Business date</span>
                <input
                  type="date"
                  className={cn(FIELD, 'num')}
                  value={s.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              </label>
              <div>
                <span className="eyebrow mb-2 block" id="mode-label">
                  Mode
                </span>
                <Segmented
                  label="Mode"
                  value={s.timelapse ? 'timelapse' : 'instant'}
                  onChange={(v) => set('timelapse', v === 'timelapse')}
                  options={[
                    { value: 'timelapse', label: 'Time-lapse ≈ 90 s' },
                    { value: 'instant', label: 'Instant' },
                  ]}
                />
              </div>
            </div>
            <div className="divide-y divide-line rounded-lg border border-line bg-bg/60 px-4 py-3 [&>div]:py-2.5">
              <Row
                id="sw-model"
                title="Use the model"
                hint={
                  aiErr ? (
                    'Could not read the model status; the template writer will be used.'
                  ) : !ai ? (
                    'Checking the model…'
                  ) : modelUsable ? (
                    <>
                      Writes the call cards and the Catalysts section with{' '}
                      <span className="font-mono text-[11.5px]">{ai.model}</span>.
                    </>
                  ) : ai.configured ? (
                    `${ai.model} is not reachable. The template writer will be used.`
                  ) : (
                    'No model is configured here. The template writer will be used.'
                  )
                }
              >
                <Switch
                  label="Use the model"
                  checked={s.useLlm && modelUsable}
                  onCheckedChange={(v) => set('useLlm', v)}
                  disabled={!modelUsable}
                />
              </Row>
              <Row
                id="sw-fresh"
                title="Fresh model calls"
                hint={
                  s.useLlm && modelUsable
                    ? s.bypassCache
                      ? 'Calls the model again for every item. Slower, and the wording can change.'
                      : 'Off: replays stored model output. Instant and the same every time.'
                    : 'Applies only when the model is used.'
                }
              >
                <Switch
                  label="Fresh model calls"
                  checked={s.bypassCache}
                  onCheckedChange={(v) => set('bypassCache', v)}
                  disabled={!(s.useLlm && modelUsable)}
                />
              </Row>
              <Row
                id="sw-qc"
                title="Spot-check holds one brief"
                hint="Hold one sampled brief to review the hold-and-release workflow."
              >
                <Switch
                  label="Spot-check holds one brief"
                  checked={s.qcFlag}
                  onCheckedChange={(v) => set('qcFlag', v)}
                />
              </Row>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
