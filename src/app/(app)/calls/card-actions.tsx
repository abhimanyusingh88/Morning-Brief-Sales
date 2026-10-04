"use client";
import { Check, Clock, EyeOff, Mail, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useAsk } from "@/components/shell/chat-drawer";

export function CardActions({ id, status, clientName }: { id: string; status: string; clientName: string }) {
  const router = useRouter();
  const { ask } = useAsk();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const set = (s: string) => start(async () => {
    setErr(null);
    const r = await fetch(`/api/cards/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
    if (!r.ok) setErr("Could not update. Try again.");
    router.refresh();
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "done" || status === "dismissed" || status === "snoozed" ? (
        <Button variant="secondary" onClick={() => set("new")} disabled={pending}><RotateCcw size={14} /> Reopen</Button>
      ) : (
        <>
          <Button variant="primary" onClick={() => set("done")} disabled={pending}><Check size={15} /> Mark as called</Button>
          <Button variant="secondary" onClick={() => set("snoozed")} disabled={pending}><Clock size={14} /> Snooze</Button>
          <Button variant="ghost" onClick={() => set("dismissed")} disabled={pending}><EyeOff size={14} /> Not today</Button>
        </>
      )}
      <Button variant="secondary" onClick={() => ask(`Draft an email to ${clientName}`)} className="ml-auto"><Mail size={14} /> Draft a note</Button>
      {err ? <p role="alert" className="w-full text-xs text-down">{err}</p> : null}
    </div>
  );
}
