import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5" aria-busy="true" aria-label="Loading today's brief">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-[220px] rounded-[12px]" />
      <Skeleton className="h-[260px] rounded-[12px]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Skeleton className="h-[320px] rounded-[12px]" />
          <Skeleton className="h-[280px] rounded-[12px]" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-[340px] rounded-[12px]" />
          <Skeleton className="h-[240px] rounded-[12px]" />
        </div>
      </div>
    </div>
  );
}
