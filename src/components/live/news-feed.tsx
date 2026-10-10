'use client';
import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ArrowUpRight, Check, Filter } from 'lucide-react';
import { NewsReader } from './news-reader';
import { NewsEffects } from './news-effects';
import { THEMES, themeOf } from '@/lib/live/classify';
import type { Story } from '@/lib/live/types';
const time = (at: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(
    new Date(at),
  );
const KIND = {
  company: { label: 'Direct', bar: 'bg-brand', text: 'text-brand' },
  industry: { label: 'Read-across', bar: 'bg-amber', text: 'text-amber' },
  macro: { label: 'Market', bar: 'bg-line-strong', text: 'text-muted' },
} as const;
function Tickers({ story, max = 6 }: { story: Story; max?: number }) {
  const t = [...new Set(story.matches.map((m) => m.symbol + ' ' + m.direction))];
  return (
    <>
      {t.slice(0, max).map((x) => {
        const [sym, dir] = x.split(' ');
        return (
          <span
            key={x}
            title={sym + ' ' + dir}
            className="inline-flex h-6 items-center overflow-hidden rounded-md border border-line-strong bg-surface text-[11px] font-semibold"
          >
            <span className="mono px-1.5 text-ink">{sym}</span>
            <span
              className={
                'flex h-full items-center border-l border-line-strong px-1.5 text-[10px] font-bold ' +
                (dir === 'Long' ? 'bg-up-50 text-up' : 'bg-down-50 text-down')
              }
            >
              {dir === 'Long' ? 'LONG' : 'SHORT'}
            </span>
          </span>
        );
      })}
      {t.length > max ? <span className="text-[10px] text-muted">+{t.length - max}</span> : null}
    </>
  );
}
function Meta({ story }: { story: Story }) {
  const k = KIND[story.category];
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]">
      <span className="text-ink-2">{story.publisher}</span>
      <span aria-hidden="true" className="text-line-strong">
        /
      </span>
      <time dateTime={story.publishedAt} className="num normal-case tracking-normal text-muted">
        {time(story.publishedAt)} ET
      </time>
      <span aria-hidden="true" className="text-line-strong">
        /
      </span>
      <span className={k.text}>{k.label}</span>
      {story.relatedSources?.length ? (
        <span className="font-medium normal-case tracking-normal text-muted">
          · {story.relatedSources.length + 1} sources
        </span>
      ) : null}
    </p>
  );
}
function Lead({ story }: { story: Story }) {
  return (
    <article
      id={'story-' + story.id}
      className="group relative scroll-mt-28 overflow-hidden rounded-xl border border-line bg-surface shadow-card"
    >
      <span aria-hidden="true" className={'absolute inset-y-0 left-0 w-1 ' + KIND[story.category].bar} />
      <div className="grid gap-5 p-6 pl-7 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
            Lead story · {themeOf(story.topics).label}
          </p>
          <Meta story={story} />
          <NewsReader story={story}>
            <button
              type="button"
              className="serif mt-2 text-left text-[26px] font-semibold leading-[1.22] tracking-[-0.01em] text-ink decoration-brand/40 underline-offset-[6px] group-hover:underline"
            >
              {story.title}
            </button>
          </NewsReader>
          {story.excerpt && story.excerpt !== story.title ? (
            <p className="serif mt-3 max-w-[72ch] text-[16px] leading-[1.7] text-ink-2">{story.excerpt}</p>
          ) : null}
        </div>
        <aside className="flex flex-col justify-between gap-4 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">Why it matters</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{story.reason}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Tickers story={story} max={8} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NewsEffects story={story} />
            <NewsReader story={story}>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-brand hover:bg-brand-50"
              >
                Read
                <ArrowUpRight size={12} />
              </button>
            </NewsReader>
          </div>
        </aside>
      </div>
    </article>
  );
}
function Row({ story }: { story: Story }) {
  return (
    <li
      id={'story-' + story.id}
      className="group relative grid scroll-mt-28 gap-x-6 gap-y-2 px-6 py-4 transition-colors hover:bg-sunken/40 md:grid-cols-[minmax(0,1fr)_220px]"
    >
      <span aria-hidden="true" className={'absolute inset-y-4 left-0 w-[3px] rounded-r ' + KIND[story.category].bar} />
      <div className="min-w-0">
        <Meta story={story} />
        <NewsReader story={story}>
          <button
            type="button"
            className="serif mt-1.5 text-left text-[17px] font-semibold leading-[1.35] text-ink decoration-brand/40 underline-offset-4 group-hover:underline"
          >
            {story.title}
          </button>
        </NewsReader>
        {story.excerpt && story.excerpt !== story.title ? (
          <p className="mt-1.5 line-clamp-2 max-w-[80ch] text-[13px] leading-relaxed text-ink-2">{story.excerpt}</p>
        ) : null}
        <p className="mt-1.5 truncate text-[11px] text-muted" title={story.reason}>
          {story.reason}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 md:justify-end">
        <div className="flex flex-wrap gap-1.5 md:justify-end">
          <Tickers story={story} max={4} />
        </div>
        <NewsEffects story={story} />
      </div>
    </li>
  );
}
/** Front-page feed: a lead story, then one aligned, full-width list grouped by theme (newest first), filterable by theme. */
export function NewsFeed({ stories }: { stories: Story[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const lead = stories[0],
    rest = stories.slice(1);
  const groups = THEMES.map((t) => ({
    t,
    items: rest
      .filter((a) => themeOf(a.topics).key === t.key)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
  })).filter((g) => g.items.length);
  const shown = selected.length ? groups.filter((g) => selected.includes(g.t.key)) : groups;
  const toggle = (k: string) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  return (
    <div className="space-y-5">
      {lead && (!selected.length || selected.includes(themeOf(lead.topics).key)) ? <Lead story={lead} /> : null}
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-3">
          <p className="text-[12px] text-ink-2">
            <span className="font-semibold text-ink">{shown.reduce((n, g) => n + g.items.length, 0)}</span> stories
            {selected.length ? (
              <>
                {' '}
                in <span className="font-semibold text-ink">{selected.length}</span>{' '}
                {selected.length === 1 ? 'theme' : 'themes'}
              </>
            ) : (
              ' across all themes'
            )}
          </p>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                aria-label="Filter headlines by theme"
                className={
                  'relative inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors ' +
                  (selected.length
                    ? 'border-brand bg-brand-50 text-brand'
                    : 'border-line-strong text-ink-2 hover:border-brand hover:text-brand')
                }
              >
                <Filter size={14} />
                Filter
                {selected.length ? (
                  <span className="num ml-0.5 rounded-full bg-brand px-1.5 text-[10px] text-white">
                    {selected.length}
                  </span>
                ) : null}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={6}
                className="z-50 w-72 rounded-lg border border-line bg-surface p-1.5 shadow-pop focus:outline-none"
              >
                <div className="flex items-center justify-between px-2 py-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Themes</p>
                  <button
                    type="button"
                    onClick={() => setSelected([])}
                    disabled={!selected.length}
                    className="text-[11px] font-medium text-brand disabled:text-muted"
                  >
                    Clear
                  </button>
                </div>
                <ul role="listbox" aria-multiselectable="true">
                  {groups.map((g) => {
                    const on = selected.includes(g.t.key);
                    return (
                      <li key={g.t.key}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={on}
                          onClick={() => toggle(g.t.key)}
                          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] hover:bg-sunken"
                        >
                          <span
                            className={
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border ' +
                              (on ? 'border-brand bg-brand text-white' : 'border-line-strong bg-surface')
                            }
                          >
                            {on ? <Check size={11} strokeWidth={3} /> : null}
                          </span>
                          <span className="flex-1 text-ink">{g.t.label}</span>
                          <span className="num text-[11px] text-muted">{g.items.length}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        {shown.map((g) => (
          <section key={g.t.key} aria-label={g.t.label}>
            <h3 className="flex items-center justify-between border-b border-line bg-sunken/60 px-6 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-navy">
              {g.t.label}
              <span className="num font-medium normal-case tracking-normal text-muted">
                {g.items.length} {g.items.length === 1 ? 'story' : 'stories'}
              </span>
            </h3>
            <ul className="divide-y divide-line border-b border-line last:border-b-0">
              {g.items.map((a) => (
                <Row key={a.id} story={a} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
