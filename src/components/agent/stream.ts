import type { AgentMessage, AgentDraft, FactView } from '@/lib/agent/types';

export interface ThreadEvent {
  threadId: string;
  created: boolean;
  title: string;
  clientId: string | null;
  clientName: string | null;
  updatedAt: string;
}
export interface AnswerEvent {
  threadId: string;
  messageId: string;
  createdAt: string;
  template: string;
  facts: Record<string, FactView>;
  followups: string[];
  steps: string[];
  draft?: AgentDraft;
  generator: 'llm' | 'rules';
  intent?: string;
  clientId?: string;
  clientName?: string;
}
export type StreamEvent =
  | { type: 'thread'; data: ThreadEvent }
  | { type: 'step'; label: string }
  | { type: 'answer'; data: AnswerEvent }
  | { type: 'error'; message: string };

export class SendError extends Error {}

/** POST a question and read the server-sent events (thread, step, answer, error) as they arrive. */
export async function streamChat(
  url: string,
  body: Record<string, unknown>,
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SendError('You appear to be offline. Check your connection and retry.');
  }
  if (res.status === 403) throw new SendError('The agent is available to salespeople and desk heads.');
  if (res.status === 404) throw new SendError('That conversation is no longer available. Start a new chat.');
  if (!res.ok || !res.body) throw new SendError('The agent is unavailable right now. Please retry.');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let finished = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const f of frames) {
      const ev = /event: (\w+)/.exec(f)?.[1];
      const raw = /data: (.*)/.exec(f)?.[1];
      if (!ev || raw === undefined) continue;
      const data = JSON.parse(raw);
      if (ev === 'thread') onEvent({ type: 'thread', data });
      else if (ev === 'step') onEvent({ type: 'step', label: data.label });
      else if (ev === 'answer') {
        finished = true;
        onEvent({ type: 'answer', data });
      } else if (ev === 'error') {
        finished = true;
        throw new SendError(data.message || 'Something went wrong. Please retry.');
      }
    }
  }
  if (!finished) throw new SendError('The connection dropped before the answer arrived. Please retry.');
}

export const answerToMessage = (a: AnswerEvent): AgentMessage => ({
  id: a.messageId,
  role: 'assistant',
  content: a.template,
  facts: a.facts,
  createdAt: a.createdAt,
  meta: {
    steps: a.steps,
    followups: a.followups,
    draft: a.draft,
    intent: a.intent,
    generator: a.generator,
    clientId: a.clientId,
    clientName: a.clientName,
  },
});
