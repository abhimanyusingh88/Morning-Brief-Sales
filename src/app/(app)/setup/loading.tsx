import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div className="mx-auto max-w-[760px] space-y-6" aria-busy="true" aria-label="Loading brief setup">
      <div className="space-y-2 border-b border-line pb-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-[260px]" />
      <Skeleton className="h-[220px]" />
      <Skeleton className="h-[240px]" />
      <Skeleton className="h-9 w-32" />
    </div>
  );
}
