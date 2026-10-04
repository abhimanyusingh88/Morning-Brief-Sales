"use client";
import * as Switch from "@radix-ui/react-switch";
import { Check, Loader2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

interface Prefs { maxCards: number; tone: "concise" | "detailed"; includeMacro: boolean; briefTime: string; focusTags: string[] }
const TAGS = ["rates", "credit", "Semiconductors", "Technology", "Financials", "Energy", "Healthcare", "Utilities", "earnings", "central_banks"];

export function PrefsForm({ initial }: { initial: Prefs }) {
  const [p, setP] = React.useState(initial);
  const [state, setState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [msg, setMsg] = React.useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("saving");
    const r = await fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    if (r.ok) { setState("saved"); setTimeout(() => setState("idle"), 2200); }
    else { setState("error"); setMsg((await r.json().catch(() => ({}))).error ?? "Could not save"); }
  };
  const toggleTag = (t: string) => setP((s) => ({ ...s, focusTags: s.focusTags.includes(t) ? s.focusTags.filter((x) => x !== t) : [...s.focusTags, t] }));
  const field = "text-[13px] font-medium text-ink";
  return (
    <form onSubmit={save} className="space-y-6">
      <div>
        <label htmlFor="max" className={field}>Calls on my list</label>
        <div className="mt-2 flex items-center gap-4">
          <input id="max" type="range" min={3} max={20} value={p.maxCards} onChange={(e) => setP({ ...p, maxCards: Number(e.target.value) })} className="h-2 w-64 accent-brand" />
          <span className="num w-8 text-[15px] font-semibold">{p.maxCards}</span>
        </div>
      </div>
      <div>
        <p className={field}>Tone of the talking points</p>
        <div className="mt-2 inline-flex rounded-lg border border-line-strong p-0.5" role="radiogroup" aria-label="Tone">
          {(["concise", "detailed"] as const).map((t) => (
            <button type="button" key={t} role="radio" aria-checked={p.tone === t} onClick={() => setP({ ...p, tone: t })} className={`cursor-pointer rounded-md px-3.5 py-1.5 text-[13px] font-medium capitalize ${p.tone === t ? "bg-navy text-white" : "text-muted hover:bg-sunken"}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-line p-3.5">
        <div><p className={field}>Include market section</p><p className="text-[12.5px] text-muted">Rates, credit and macro context at the top of the brief.</p></div>
        <Switch.Root checked={p.includeMacro} onCheckedChange={(v) => setP({ ...p, includeMacro: v })} aria-label="Include market section" className="relative h-6 w-11 cursor-pointer rounded-full bg-line-strong transition data-[state=checked]:bg-brand">
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>
      <div>
        <label htmlFor="time" className={field}>Deliver my brief at (New York time)</label>
        <input id="time" type="time" value={p.briefTime} onChange={(e) => setP({ ...p, briefTime: e.target.value })} className="num mt-2 block h-9 rounded-lg border border-line-strong bg-surface px-3 text-[14px] outline-none focus:border-brand focus:ring-2 focus:ring-brand-100" />
      </div>
      <div>
        <p className={field}>Topics I care most about</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TAGS.map((t) => <button type="button" key={t} aria-pressed={p.focusTags.includes(t)} onClick={() => toggleTag(t)} className={`cursor-pointer rounded-full border px-3 py-1 text-[12.5px] font-medium ${p.focusTags.includes(t) ? "border-brand bg-brand-50 text-brand-600" : "border-line text-muted hover:border-line-strong"}`}>{t.replace(/_/g, " ")}</button>)}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-line pt-4">
        <Button type="submit" variant="primary" disabled={state === "saving"}>{state === "saving" ? <Loader2 size={14} className="animate-spin" /> : state === "saved" ? <Check size={14} /> : null} {state === "saved" ? "Saved" : "Save preferences"}</Button>
        {state === "error" ? <p role="alert" className="text-[13px] text-down">{msg}</p> : null}
      </div>
    </form>
  );
}
