"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** A right-hand detail drawer. The title is always present for screen readers; the body scrolls, the header and footer stay. */
export function Drawer({ open, onOpenChange, title, subtitle, actions, footer, width = 640, children }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** controls placed beside the close button */
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/20" />
        <Dialog.Content aria-describedby={undefined} style={{ width: `min(${width}px, 100vw)` }} className="fixed bottom-0 right-0 top-0 z-50 flex flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)] focus:outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</Dialog.Title>
              {subtitle ? <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {actions}
              <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X size={16} strokeWidth={1.5} /></Button></Dialog.Close>
            </div>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer ? <div className="border-t border-line bg-surface px-5 py-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** A titled block inside a drawer. */
export function DrawerSection({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-line px-5 py-4 last:border-b-0", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h4 className="eyebrow">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Label/value pairs with a fixed label column so values align down the drawer. */
export function DefList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
      {items.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 text-ink">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
