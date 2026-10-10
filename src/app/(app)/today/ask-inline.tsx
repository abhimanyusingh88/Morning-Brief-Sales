'use client';
import { useAsk } from '@/components/shell/chat-drawer';

const Q = ['Who should I call today?', 'What moved overnight?', 'Which open follow-ups am I behind on?'];

export function AskInline() {
  const { ask } = useAsk();
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {Q.map((q) => (
        <button
          key={q}
          onClick={() => ask(q)}
          className="cursor-pointer rounded-lg bg-white/8 px-3 py-2 text-left text-[13px] text-white/85 transition hover:bg-white/15"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
