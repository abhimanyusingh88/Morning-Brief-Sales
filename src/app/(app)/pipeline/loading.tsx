import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the morning run">
      <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-48" /><Skeleton className="h-4 w-full max-w-xl" /></div>
      <Skeleton className="h-[76px] rounded-[12px]" />
      <Skeleton className="h-[330px] rounded-[12px]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"><Skeleton className="h-[560px] rounded-[12px]" /><Skeleton className="h-[560px] rounded-[12px]" /></div>
    </div>
  );
}
