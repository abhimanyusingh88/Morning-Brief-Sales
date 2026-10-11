import { Skeleton } from '@/components/ui/states';

/** Mirrors the brief's own layout (header, filter bar, key events, market strip, panels) so nothing jumps on arrival. */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading your morning brief">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface px-5 py-4 shadow-card">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-3 w-44" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 flex-1" />
      </div>
      <p className="flex items-center gap-2 px-1 text-[12.5px] font-medium text-ink-2">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent"
        />
        Loading your brief, market data and charts…
      </p>
      <Skeleton className="h-[76px] rounded-xl" />
      <Skeleton className="h-[150px] rounded-xl" />
      <Skeleton className="h-[74px]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
      <Skeleton className="h-[300px]" />
    </div>
  );
}
