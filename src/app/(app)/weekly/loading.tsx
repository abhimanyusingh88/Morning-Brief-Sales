import { LoadingLine, Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading weekly moves">
      <LoadingLine label="Loading this week's closes for your clients…" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px]" />
        ))}
      </div>
      <Skeleton className="h-[120px]" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[380px]" />
        <Skeleton className="h-[380px]" />
      </div>
    </div>
  );
}
