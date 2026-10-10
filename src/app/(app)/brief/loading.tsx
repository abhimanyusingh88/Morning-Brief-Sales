import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[860px] space-y-6" aria-busy="true" aria-label="Loading your morning brief">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="paper-surface rounded-[12px] border border-paper-line bg-paper px-5 py-7 sm:px-10 sm:py-9">
        <div className="flex items-baseline justify-between border-b border-ink-rule pb-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="mt-4 h-4 w-80 max-w-full" />
        <Skeleton className="mt-5 h-16" />
        <Skeleton className="mt-8 h-4 w-32" />
        <Skeleton className="mt-3 h-[168px]" />
        <Skeleton className="mt-9 h-4 w-48" />
        <Skeleton className="mt-3 h-[300px]" />
        <Skeleton className="mt-9 h-4 w-24" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}
