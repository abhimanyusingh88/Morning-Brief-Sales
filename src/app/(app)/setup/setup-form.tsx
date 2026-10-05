"use client";
import { Check, Loader2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { ALL_PRODUCTS, INCLUDE_TOGGLES, PRODUCT_GROUPS, SPEC_SECTORS, type BriefPrefs, type Delivery } from "@/lib/brief/spec";

const DELIVERY: { key: Delivery; label: string; hint: string }[] = [
  { key: "dashboard", label: "Dashboard", hint: "Opens in the app at your send time" },
  { key: "email", label: "Email digest", hint: "An email version of your brief, available as a preview" },
  { key: "both", label: "Both", hint: "Dashboard and email digest" },
];

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function SetupForm({ initial, pending, businessDate, isDefault }: { initial: BriefPrefs; pending: BriefPrefs | null; businessDate: string; isDefault: boolean }) {
  const start = pending ?? initial;
  const [p, setP] = React.useState({ sectors: start.sectors as string[], products: start.products, include: start.include as Record<string, boolean>, delivery: start.delivery, sendTime: start.sendTime });
  const [state, setState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = React.useState("");
  const [effective, setEffective] = React.useState<string | null>(pending?.effectiveFrom ?? null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("saving");
    try {
      const r = await fetch("/api/brief-prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Could not save");
      setEffective(body.effectiveFrom);
      setState("saved");
      setTimeout(() => setState("idle"), 2400);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not save");
      setState("error");
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <p className="text-[12.5px] text-muted">
        Business date <span className="num text-ink-2">{businessDate}</span>
        {isDefault && !effective ? " · showing the desk default; nothing saved yet" : null}
        {effective ? <> · your saved setup starts <span className="num text-ink-2">{effective}</span></> : null}
      </p>

      <Card>
        <CardHeader title="Sectors" />
        <CardBody>
          <p className="mb-3 text-[13px] text-muted">Movers, earnings and news are filtered to these.</p>
          <div className="flex flex-wrap gap-2">
            {SPEC_SECTORS.map((s) => <Chip key={s} selected={p.sectors.includes(s)} onClick={() => setP((x) => ({ ...x, sectors: toggle(x.sectors, s) }))}>{s}</Chip>)}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Products" right={<button type="button" className="cursor-pointer text-[12.5px] text-brand-600 hover:underline" onClick={() => setP((x) => ({ ...x, products: x.products.length === ALL_PRODUCTS.length ? [] : [...ALL_PRODUCTS] }))}>{p.products.length === ALL_PRODUCTS.length ? "Clear all" : "Select all"}</button>} />
        <CardBody className="space-y-4">
          {PRODUCT_GROUPS.map((g) => (
            <div key={g.group}>
              <p className="eyebrow mb-2">{g.group}</p>
              <div className="flex flex-wrap gap-2">{g.options.map((o) => <Chip key={o} selected={p.products.includes(o)} onClick={() => setP((x) => ({ ...x, products: toggle(x.products, o) }))}>{o}</Chip>)}</div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="What to include" />
        <CardBody className="divide-y divide-line !py-0">
          {INCLUDE_TOGGLES.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-4 py-3">
              <div><p className="text-[13.5px] font-medium text-ink">{t.label}</p>{"hint" in t ? <p className="text-[12px] text-muted">{t.hint}</p> : null}</div>
              <Switch label={t.label} checked={p.include[t.key] !== false} onCheckedChange={(v) => setP((x) => ({ ...x, include: { ...x.include, [t.key]: v } }))} />
            </div>
          ))}
          <p className="py-3 text-[12px] text-muted">The market snapshot, the S&amp;P 500 chart and Catalysts are always shown.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Delivery" />
        <CardBody className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Delivery">
            {DELIVERY.map((d) => (
              <button type="button" key={d.key} role="radio" aria-checked={p.delivery === d.key} onClick={() => setP((x) => ({ ...x, delivery: d.key }))}
                className={`cursor-pointer rounded-lg border p-3 text-left transition-colors ${p.delivery === d.key ? "border-brand/50 bg-brand-50" : "border-line-strong hover:bg-sunken"}`}>
                <p className="text-[13.5px] font-medium text-ink">{d.label}</p>
                <p className="mt-0.5 text-[12px] text-muted">{d.hint}</p>
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="send" className="text-[13px] font-medium text-ink">Send time (New York)</label>
            <input id="send" type="time" value={p.sendTime} onChange={(e) => setP((x) => ({ ...x, sendTime: e.target.value }))} className="num mt-2 block h-9 rounded-lg border border-line-strong bg-surface px-3 text-[14px] outline-none focus:border-brand focus:ring-2 focus:ring-brand-100" />
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={state === "saving" || p.sectors.length === 0}>
          {state === "saving" ? <Loader2 size={14} className="animate-spin" /> : state === "saved" ? <Check size={14} /> : null} {state === "saved" ? "Saved" : "Save setup"}
        </Button>
        {p.sectors.length === 0 ? <p className="text-[12.5px] text-muted">Choose at least one sector.</p> : null}
        {state === "error" ? <p role="alert" className="text-[13px] text-down">{msg}</p> : null}
      </div>
    </form>
  );
}
