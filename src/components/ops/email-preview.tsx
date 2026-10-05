"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emailPreviewHtml } from "@/components/brief/email-html";

/** The stored email digest in an isolated, script-free frame. Preview only: no relay is called. */
export function EmailPreview({ subject, to, html }: { subject: string | null; to: string | null; html: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild><Button size="sm" variant="ghost"><Mail size={14} strokeWidth={1.5} /> Preview</Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(800px,100vw)] flex-col border-l border-line bg-surface shadow-pop focus:outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0"><Dialog.Title className="truncate text-[15px] font-semibold text-ink">{subject ?? "Email digest"}</Dialog.Title><Dialog.Description className="truncate text-[12.5px] text-muted">To {to ?? "—"} · preview only, nothing is sent</Dialog.Description></div>
            <Dialog.Close className="cursor-pointer rounded-md p-1 text-muted hover:bg-sunken" aria-label="Close"><X size={16} /></Dialog.Close>
          </div>
          <iframe title="Email preview" srcDoc={emailPreviewHtml(html)} sandbox="" className="h-full w-full flex-1 border-0 bg-white" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
