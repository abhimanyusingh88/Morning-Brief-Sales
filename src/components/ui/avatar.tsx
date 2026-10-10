import { cn } from '@/lib/cn';

export function Avatar({
  initials,
  hue = 210,
  size = 32,
  className,
}: {
  initials: string;
  hue?: number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${hue} 55% 46%), hsl(${(hue + 28) % 360} 60% 38%))`,
      }}
    >
      {initials}
    </span>
  );
}
