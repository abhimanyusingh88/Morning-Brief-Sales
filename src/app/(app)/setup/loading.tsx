import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading brief setup">
      <div className="space-y-2 border-b border-line pb-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-[64px]" />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Skeleton className="h-[420px]" />
        <div className="space-y-5">
          <Skeleton className="h-[260px]" />
          <Skeleton className="h-[280px]" />
        </div>
      </div>
    </div>
  );
}
