"use client";
import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Avatar } from "@/components/ui/avatar";

export interface Persona { id: string; name: string; initials: string; title: string; role: "sales" | "desk_head" | "compliance" | "admin"; hue: number; desk: string | null; clients: number }

const ROLE_NOTE: Record<Persona["role"], string> = { sales: "Salesperson", desk_head: "Desk head", compliance: "Compliance", admin: "Administrator" };

export function PersonaGrid({ personas }: { personas: Persona[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const enter = async (p: Persona) => {
    setBusy(p.id);
    setError(null);
    try {
      const r = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: p.id }) });
      if (!r.ok) throw new Error("Could not sign in");
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
      setBusy(null);
    }
  };

  const groups = new Map<string, Persona[]>();
  for (const p of personas) {
    const g = p.desk ?? "Oversight";
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }

  return (
    <div className="mt-10 space-y-8">
      {error ? <p role="alert" className="rounded-lg bg-down/20 px-4 py-2.5 text-sm text-white">{error}</p> : null}
      {[...groups.entries()].map(([group, list]) => (
        <section key={group}>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">{group}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <button key={p.id} onClick={() => enter(p)} disabled={busy !== null}
                className="group flex cursor-pointer items-center gap-3.5 rounded-xl border border-navy-line bg-navy-2 p-3.5 text-left transition hover:border-brand hover:bg-[#14264a] disabled:opacity-60">
                <Avatar initials={p.initials} hue={p.hue} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[12.5px] text-white/55">{p.title}</span>
                  <span className="mt-1 block text-[11.5px] text-white/35">{ROLE_NOTE[p.role]}{p.role === "sales" ? ` · ${p.clients} clients` : ""}</span>
                </span>
                {busy === p.id ? <Loader2 size={16} className="animate-spin text-cyan" /> : <ArrowRight size={16} className="text-white/25 transition group-hover:translate-x-0.5 group-hover:text-cyan" />}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
