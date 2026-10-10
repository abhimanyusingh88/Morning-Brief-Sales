'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './button';

/** A confirmation step for destructive actions. Escape, the overlay and Cancel all dismiss without acting. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = 'Delete',
  busyLabel = 'Deleting…',
  busy = false,
  error = '',
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  busyLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-navy/40 backdrop-blur-[2px]" />
        <Dialog.Content
          role="alertdialog"
          className="fixed left-1/2 top-1/2 z-[61] w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-[0_24px_60px_rgba(14,22,39,0.25)] focus:outline-none"
        >
          <Dialog.Title className="text-[15px] font-semibold text-ink">{title}</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</Dialog.Description>
          {error ? (
            <p role="alert" className="mt-3 text-[12px] text-down">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary" size="sm" disabled={busy} autoFocus>
                Cancel
              </Button>
            </Dialog.Close>
            <Button variant="danger" size="sm" onClick={onConfirm} disabled={busy}>
              {busy ? busyLabel : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
