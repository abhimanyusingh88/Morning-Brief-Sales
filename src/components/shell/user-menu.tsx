import { Avatar } from '@/components/ui/avatar';
export function UserMenu({
  name,
  title,
  initials,
  hue,
}: {
  name: string;
  title: string;
  initials: string;
  hue: number;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1 pl-1 pr-2" aria-label="Public demo salesperson">
      <Avatar initials={initials} hue={hue} size={30} />
      <span className="hidden text-left leading-tight sm:block">
        <span className="block text-[13px] font-semibold text-ink">{name}</span>
        <span className="block max-w-[190px] truncate text-[11.5px] text-muted">{title} · Demo</span>
      </span>
    </div>
  );
}
