import type { FactView } from '@/lib/ai/chat';

export type { FactView };

export interface AgentDraft {
  subject: string;
  template: string;
  to: string | null;
}

/** Stored beside each assistant message. Text only: figures stay {{tokens}} and are rendered from `facts`. */
export interface MessageMeta {
  steps?: string[];
  followups?: string[];
  draft?: AgentDraft;
  intent?: string;
  generator?: 'llm' | 'rules';
  clientId?: string;
  clientName?: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  /** The template: prose with {{fact_key}} tokens. */
  content: string;
  facts: Record<string, FactView>;
  meta: MessageMeta;
  createdAt: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  clientId: string | null;
  clientName: string | null;
  /** Plain text, figures already substituted from the stored facts. */
  preview: string;
}

export const MAX_MESSAGE = 500;
export const DEFAULT_TITLE = 'New conversation';

/** Seeded ids are deterministic, not RFC-versioned, so zod's strict .uuid() would refuse them. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
