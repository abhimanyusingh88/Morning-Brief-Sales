import { AlertTriangle, Inbox } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/cn';

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton', className)} />;

/** A running line with a label: unmistakably in motion, so a slow load is never mistaken for a stuck page. */
export function LoadingLine({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-lg border border-line bg-surface shadow-card"
    >
      <div className="loading-bar" />
      <p className="px-3.5 py-2 text-[12.5px] font-medium text-ink-2">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-muted">
        {icon ?? <Inbox size={18} />}
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body ? <p className="max-w-sm text-[13px] text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  body,
  action,
}: {
  title?: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-down-50 text-down">
        <AlertTriangle size={18} />
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {body ? <p className="max-w-sm text-[13px] text-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
