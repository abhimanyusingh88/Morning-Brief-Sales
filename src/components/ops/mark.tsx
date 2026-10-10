import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Pass or fail, as an icon and a word together, so colour is never the only signal. */
export function Mark({
  ok,
  yes = 'Pass',
  no = 'Fail',
  className,
}: {
  ok: boolean;
  yes?: string;
  no?: string;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[12px] font-medium', ok ? 'text-up' : 'text-down', className)}
    >
      {ok ? <Check size={14} strokeWidth={1.75} aria-hidden /> : <X size={14} strokeWidth={1.75} aria-hidden />}
      {ok ? yes : no}
    </span>
  );
}
