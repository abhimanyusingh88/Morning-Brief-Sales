/** Wordmark: a hairline horizon with a half sun, in a quiet outlined square. No gradients, no colour fill. */
export function BrandMark({ firm }: { firm: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-white/20 text-white" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18h18" /><path d="M7 18a5 5 0 0 1 10 0" /><path d="M12 6v3" /><path d="M5.6 10.6l1.8 1.8" /><path d="M18.4 10.6l-1.8 1.8" />
        </svg>
      </span>
      <div className="leading-tight">
        <p className="text-[13.5px] font-semibold tracking-[-0.01em] text-white">Morning Brief</p>
        <p className="text-[11px] text-white/45">{firm}</p>
      </div>
    </div>
  );
}
