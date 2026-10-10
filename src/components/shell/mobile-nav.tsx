'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { Role } from '@/lib/auth/session';
import { BrandMark } from './brand';
import { NavList } from './nav-list';

export function MobileNav({ role, firm }: { role: Role; firm: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="mobile-nav-trigger -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-sunken lg:hidden"
        >
          <Menu size={18} strokeWidth={1.5} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="mobile-nav-overlay fixed inset-0 z-40 bg-navy/40 lg:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="mobile-nav-panel fixed bottom-0 left-0 top-0 z-50 flex w-[288px] max-w-[85vw] flex-col bg-navy text-white lg:hidden"
        >
          <div className="flex h-28 shrink-0 items-center justify-between border-b border-navy-line px-4">
            <Dialog.Title asChild>
              <div>
                <BrandMark firm={firm} />
              </div>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </Dialog.Close>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto px-3 py-4">
            <NavList role={role} roomy onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-navy-line px-5 py-4 text-[12px] text-white/65">Your morning, connected.</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
