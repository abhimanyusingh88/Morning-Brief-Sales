'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Eye, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import type { BriefReview } from '@/lib/data/ops';
import { emailPreviewHtml } from '@/components/brief/email-html';

/** Hold or release one brief. The only effect is on our own brief and its deliveries; nothing goes to a client. */
export function HoldRelease({ briefId, held, canAct }: { briefId: string; held: boolean; canAct: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/qc/${briefId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: held ? 'release' : 'hold' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not update');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant={held ? 'primary' : 'secondary'}
        disabled={busy || !canAct}
        onClick={go}
        title={canAct ? undefined : 'Desk heads, admins and compliance only'}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : null}
        {held ? 'Release' : 'Hold'}
      </Button>
      {err ? (
        <span role="alert" className="text-[12px] text-down">
          {err}
        </span>
      ) : null}
    </span>
  );
}

/** The same paper-style digest used by the email preview, including held briefs. */
export function ViewBrief({ briefId, name }: { briefId: string; name: string }) {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<BriefReview | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!open || data) return;
    let off = false;
    fetch(`/api/qc/${briefId}`)
      .then(async (r) => {
        const b = await r.json();
        if (off) return;
        if (!r.ok) setErr(b.error ?? 'Could not load');
        else setData(b);
      })
      .catch(() => !off && setErr('Could not load'));
    return () => {
      off = true;
    };
  }, [open, data, briefId]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="ghost" aria-label={`View ${name}'s brief`}>
          <Eye size={14} strokeWidth={1.5} /> View
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(800px,100vw)] flex-col border-l border-line bg-surface shadow-pop focus:outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-[15px] font-semibold text-ink">{name}&apos;s brief</Dialog.Title>
              <Dialog.Description className="text-[12.5px] text-muted">
                Morning brief preview · nothing is sent
              </Dialog.Description>
            </div>
            <Dialog.Close className="cursor-pointer rounded-md p-1 text-muted hover:bg-sunken" aria-label="Close">
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {err ? (
              <ErrorState title="Could not load this brief" body={err} />
            ) : !data ? (
              <p className="text-[13px] text-muted" aria-busy>
                Loading…
              </p>
            ) : (
              <iframe
                title="QC brief preview"
                srcDoc={emailPreviewHtml(data.previewHtml)}
                sandbox=""
                className="min-h-0 w-full flex-1 border-0"
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
