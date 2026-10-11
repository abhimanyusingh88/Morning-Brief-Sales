import { LoadingLine, Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading brief setup">
      <LoadingLine label="Loading your brief setup…" />
      <div className="space-y-2 border-b border-line pb-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-[100px]" />
      <Skeleton className="h-[400px]" />
      <div className="grid items-stretch gap-5 xl:grid-cols-2">
        <Skeleton className="h-[520px]" />
        <Skeleton className="h-[520px]" />
      </div>
    </div>
  );
}
