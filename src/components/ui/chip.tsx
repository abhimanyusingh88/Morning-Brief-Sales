'use client';
import * as React from 'react';
import { cn } from '@/lib/cn';

/** A selectable pill (setup screens). Pressed state is conveyed by colour and aria-pressed. */
export function Chip({
  selected,
  onClick,
  children,
  disabled,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-8 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50',
        selected
          ? 'border-brand/40 bg-brand-50 text-brand-600'
          : 'border-line-strong bg-surface text-ink-2 hover:bg-sunken',
      )}
    >
      {children}
    </button>
  );
}
