"use client";
import { CircleAlert, ClipboardCheck, Inbox, BookOpenText } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Status } from "@/components/ui/status";
import { cn } from "@/lib/cn";
import { fmtDuration, fmtInt, type RunView } from "./model";

/** Price used for the cost estimate: dollars per one million tokens. */
const PRICE = { input: 0.1, output: 0.5 };

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});

function Tile({ label, figure, caption }: { label: string; figure: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="num mt-1 font-mono text-[20px] font-medium leading-7 text-ink">{figure}</dd>
      {caption ? <dd className="mt-0.5 text-[12px] leading-snug text-muted">{caption}</dd> : null}
    </div>
  );
}

export function ResultPanel({ view, role }: { view: RunView; role: string }) {
  const sum = view.summary;
  if (!sum || (view.status !== "succeeded" && view.status !== "failed")) return null;

  const failedStep = view.steps.find((s) => s.status === "failed");
  if (view.status === "failed") {
    return (
      <Card role="alert" className="border-down/30">
        <div className="flex items-start gap-3 px-5 py-4">
          <CircleAlert size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-down" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-[13px] font-semibold text-ink">The run failed{failedStep ? ` at step ${failedStep.seq}: ${failedStep.label}` : ""}</h3>
            <p className="mt-1 break-words font-mono text-[12.5px] leading-snug text-down">{String(sum.error ?? "No error message was recorded.")}</p>
            <p className="mt-2 text-[12.5px] text-muted">Nothing from this run was published. Briefs from the previous successful run are unchanged. Start the run again from the options above.</p>
          </div>
        </div>
      </Card>
    );
  }

  const published = obj(sum.published), qc = obj(sum.qc), delivery = obj(sum.delivery), feeds = obj(sum.feeds), gen = obj(sum.generation), nar = obj(sum.narrative);
  const briefs = num(published.briefs), held = num(qc.held) ?? 0, cards = num(published.cards);
  const email = num(delivery.email), dash = num(delivery.dashboard), emailFailed = num(delivery.failed) ?? 0;
  const feedDown = num(feeds.down) ?? 0;
  const llm = sum.llm === true;
  const calls = ["accepted", "repaired", "fallback", "failed"].reduce((a, k) => a + (num(gen[k]) ?? 0), 0);
  const tokIn = (num(gen.promptTokens) ?? 0) + (num(nar.promptTokens) ?? 0);
  const tokOut = (num(gen.completionTokens) ?? 0) + (num(nar.tokensOut) ?? 0);
  const cost = llm && (tokIn > 0 || tokOut > 0) ? (tokIn * PRICE.input + tokOut * PRICE.output) / 1e6 : null;
  const showBrief = role === "sales";

  return (
    <Card>
      <CardHeader
        title="Run complete"
        sub={`Business date ${view.businessDate ?? ""}. Every figure in the briefs carries its source feed and as-of time.`}
        right={<Status tone={held || feedDown || emailFailed ? "warn" : "ok"}>{held || feedDown || emailFailed ? "Complete, with exceptions" : "Complete"}</Status>}
      />
      <dl className="grid grid-cols-2 gap-x-8 gap-y-6 px-5 py-5 sm:grid-cols-3 2xl:grid-cols-6">
        <Tile label="Duration" figure={fmtDuration(num(sum.durationMs))} caption={sum.timelapse ? "Time-lapse" : "Instant"} />
        <Tile label="Briefs" figure={<>{briefs == null ? "—" : fmtInt(briefs)}<span className="text-[13px] font-normal text-muted"> published</span></>} caption={held ? `${fmtInt(held)} held by QC, not published or emailed` : "None held"} />
        <Tile label="Call cards" figure={cards == null ? "—" : fmtInt(cards)} caption="in published briefs" />
        <Tile label="Emails" figure={email == null ? "—" : fmtInt(email)} caption={`queued on the simulated relay${dash != null ? `; ${fmtInt(dash)} dashboard` : ""}${emailFailed ? `; ${emailFailed} failed` : ""}`} />
        <Tile label="Model calls" figure={llm ? fmtInt(calls + (nar.status ? 1 : 0)) : "None"} caption={llm ? `${fmtInt(num(gen.accepted) ?? 0)} cards accepted first time, ${fmtInt(num(gen.repaired) ?? 0)} repaired, ${fmtInt((num(gen.fallback) ?? 0) + (num(gen.failed) ?? 0))} on template` : "Template writer; no model was called"} />
        <Tile
          label="Tokens and cost"
          figure={llm ? <>{fmtInt(tokIn)} <span className="text-[13px] font-normal text-muted">in</span> · {fmtInt(tokOut)} <span className="text-[13px] font-normal text-muted">out</span></> : "—"}
          caption={!llm ? "No model used" : cost == null ? "No tokens recorded; replayed from stored model output" : <>{`≈ $${cost.toFixed(cost < 0.01 ? 4 : 2)} at the configured model price`}<span className="block">{`$${PRICE.input.toFixed(2)} per 1M input, $${PRICE.output.toFixed(2)} per 1M output. Cards and Catalysts only.`}</span></>}
        />
      </dl>
      {feedDown || held || emailFailed ? (
        <ul className="space-y-1 border-t border-line px-5 py-3 text-[12.5px] text-ink-2">
          {feedDown ? <li>{feedDown} feed{feedDown > 1 ? "s" : ""} not healthy. Sections that need {feedDown > 1 ? "them" : "it"} were withheld with &ldquo;data temporarily unavailable&rdquo;.</li> : null}
          {held ? <li>{held} brief{held > 1 ? "s were" : " was"} held for review and will not go out until QC releases {held > 1 ? "them" : "it"}.</li> : null}
          {emailFailed ? <li>{emailFailed} email digest{emailFailed > 1 ? "s" : ""} failed on the relay and will retry at the next window.</li> : null}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
        {showBrief ? <Button asChild variant="secondary" size="md"><Link href="/brief"><BookOpenText size={14} strokeWidth={1.5} /> Open a sample brief</Link></Button> : null}
        <Button asChild variant={held ? "primary" : "secondary"} size="md"><Link href="/qc"><ClipboardCheck size={14} strokeWidth={1.5} /> Review QC</Link></Button>
        <Button asChild variant="secondary" size="md"><Link href="/deliveries"><Inbox size={14} strokeWidth={1.5} /> View deliveries</Link></Button>
        <span className={cn("ml-auto hidden text-[12px] text-muted md:inline")}>Nothing is ever sent to a client. The agent drafts; the human sends.</span>
      </div>
    </Card>
  );
}
