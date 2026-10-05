"use client";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";

export function UserMenu({ name, title, initials, hue }: { name: string; title: string; initials: string; hue: number }) {
  const router = useRouter();
  const out = async () => {
    await fetch("/api/session", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  };
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 outline-none hover:bg-sunken focus-visible:outline-2 focus-visible:outline-brand" aria-label="Account menu">
        <Avatar initials={initials} hue={hue} size={30} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-semibold text-ink">{name}</span>
          <span className="block max-w-[190px] truncate text-[11.5px] text-muted">{title}</span>
        </span>
        <ChevronDown size={14} className="text-subtle" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} className="z-50 min-w-[200px] rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
          <Dropdown.Item onSelect={out} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-sunken"><Repeat size={14} /> Switch account</Dropdown.Item>
          <Dropdown.Item onSelect={out} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[13px] outline-none data-[highlighted]:bg-sunken"><LogOut size={14} /> Sign out</Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
