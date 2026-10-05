import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="grid h-[calc(100dvh-120px)] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]" aria-busy>
      <Skeleton className="h-full" /><Skeleton className="h-full" />
    </div>
  );
}
