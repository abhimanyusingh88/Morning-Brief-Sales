import { Skeleton } from '@/components/ui/states';

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy>
      <Skeleton className="h-12 w-80" />
      <div className="grid gap-4 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
