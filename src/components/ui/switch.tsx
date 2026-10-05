"use client";
import * as RadixSwitch from "@radix-ui/react-switch";
import * as React from "react";
import { cn } from "@/lib/cn";

export function Switch({ checked, onCheckedChange, label, className }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className={cn("relative h-5 w-9 shrink-0 cursor-pointer rounded-full bg-line-strong transition-colors data-[state=checked]:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand", className)}
    >
      <RadixSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </RadixSwitch.Root>
  );
}
