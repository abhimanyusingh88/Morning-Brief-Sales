'use client';
import { Check, Clock, EyeOff, Mail, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useAsk } from '@/components/shell/chat-drawer';

export function CardActions({ id, status, clientName }: { id: string; status: string; clientName: string }) {
  const router = useRouter();
  const { ask } = useAsk();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const set = (s: string) =>
    start(async () => {
      setErr(null);
      const r = await fetch(`/api/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: s }),
      });
      if (!r.ok) setErr('Could not update. Try again.');
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100">
      {status === 'done' || status === 'dismissed' || status === 'snoozed' ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => set('new')}
          disabled={pending}
          className="gap-1.5 text-xs font-medium"
        >
          <RotateCcw size={13} /> Reopen call
        </Button>
      ) : (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={() => set('done')}
            disabled={pending}
            className="gap-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs"
          >
            <Check size={14} /> Mark as called
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => set('snoozed')}
            disabled={pending}
            className="gap-1.5 text-xs font-medium text-slate-700"
          >
            <Clock size={13} /> Snooze
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set('dismissed')}
            disabled={pending}
            className="gap-1.5 text-xs text-slate-500 hover:text-slate-800"
          >
            <EyeOff size={13} /> Not today
          </Button>
        </>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => ask(`Draft an email to ${clientName}`)}
        className="ml-auto gap-1.5 text-xs font-medium text-slate-800"
      >
        <Mail size={13} strokeWidth={1.75} /> Draft a note
      </Button>
      {err ? (
        <p role="alert" className="w-full text-xs text-red-600 mt-1">
          {err}
        </p>
      ) : null}
    </div>
  );
}
