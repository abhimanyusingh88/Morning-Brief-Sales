"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Status } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { FEEDS, type FeedDef } from "@/lib/feeds/registry";
import { FeedDrawer } from "./feed-drawer";
import { FEED_STATUS } from "./feed-status";
import { CATEGORY_LABEL, CATEGORY_ORDER, etTime, feedUiStatus, fmtInt, fmtMs, type FeedUiStatus, type RunView } from "./model";

function FeedCard({ def, view, ingestDone, onOpen }: { def: FeedDef; view: RunView; ingestDone: boolean; onOpen: () => void }) {
  const f = view.feeds[def.key];
  const ui = feedUiStatus(f, view.status, ingestDone);
  const bad = ui === "down" || ui === "delayed";
  const landed = ui === "ok" || bad;
  const withheld = (f?.detail?.withheld as string[] | undefined) ?? [];
  const st = FEED_STATUS[ui];
  return (
    <li>
      <button
        type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={`${def.name}, ${st.label}. Open details`}
        className={cn(
          "flex h-full w-full cursor-pointer flex-col gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          ui === "down" ? "border-down/40 bg-down-50/60 hover:bg-down-50" : ui === "delayed" ? "border-amber/40 bg-amber-50/70 hover:bg-amber-50" : ui === "connecting" ? "border-brand/40 bg-brand-50/40" : "border-line bg-surface hover:bg-sunken/60",
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium leading-snug text-ink">{def.name}</span>
            <span className="block truncate text-[12px] leading-snug text-muted">{def.vendor}</span>
          </span>
          <span className="shrink-0 pt-px"><Status tone={st.tone}>{st.label}</Status></span>
        </span>
        <span className="flex items-center gap-2">
          <Badge tone="outline">{def.transport}</Badge>
        </span>
        <dl className="num mt-auto grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-4 text-[12px]">
          <div><dt className="text-[11px] text-subtle">Rows</dt><dd className="font-mono text-ink-2">{landed ? fmtInt(f?.rows ?? 0) : "—"}</dd></div>
          <div><dt className="text-[11px] text-subtle">Latency</dt><dd className="font-mono text-ink-2">{landed ? fmtMs(f?.latencyMs) : "—"}</dd></div>
          <div className="min-w-0 text-right"><dt className="text-[11px] text-subtle">As of · SLA</dt><dd className={cn("truncate font-mono", ui === "delayed" ? "font-medium text-amber" : "text-ink-2")}>{landed && f?.asOf ? etTime(f.asOf) : "—"} · {def.slaTime}</dd></div>
        </dl>
        {bad ? (
          <span className={cn("block border-t pt-1.5 text-[12px] leading-snug", ui === "down" ? "border-down/20 text-down" : "border-amber/25 text-amber")}>
            <span className="font-medium">Withheld: data temporarily unavailable.</span>{withheld.length ? <span className="text-ink-2"> {withheld.join(", ")}.</span> : null}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function FeedMap({ view }: { view: RunView }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const ingest = view.steps.find((s) => s.key === "ingest_feeds");
  const ingestDone = ingest?.status === "succeeded" || ingest?.status === "failed";
  const all = FEEDS.map((d) => feedUiStatus(view.feeds[d.key], view.status, ingestDone));
  const count = (s: FeedUiStatus) => all.filter((x) => x === s).length;
  const tally: [FeedUiStatus, number][] = ([["ok", count("ok")], ["delayed", count("delayed")], ["down", count("down")], ["connecting", count("connecting")], ["queued", count("queued")]] as [FeedUiStatus, number][]).filter(([, n]) => n > 0);

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Feed map"
        sub={`${FEEDS.length} connectors. Select one for its log, payload and the sections that depend on it.`}
        right={<div className="flex flex-wrap justify-end gap-x-3 gap-y-1 pt-0.5">{tally.map(([s, n]) => <Status key={s} tone={FEED_STATUS[s].tone}><span className="num">{n}</span> {FEED_STATUS[s].label.toLowerCase()}</Status>)}</div>}
      />
      <div className="space-y-4 p-5">
        {CATEGORY_ORDER.map((c) => {
          const list = FEEDS.filter((f) => f.category === c);
          if (!list.length) return null;
          return (
            <section key={c} aria-label={CATEGORY_LABEL[c]}>
              <h4 className="eyebrow mb-2">{CATEGORY_LABEL[c]}</h4>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((d) => <FeedCard key={d.key} def={d} view={view} ingestDone={ingestDone} onOpen={() => setOpen(d.key)} />)}
              </ul>
            </section>
          );
        })}
      </div>
      <FeedDrawer feedKey={open} view={view} ingestDone={ingestDone} onClose={() => setOpen(null)} />
    </Card>
  );
}
