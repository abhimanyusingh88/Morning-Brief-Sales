import OpenAI from "openai";

export class LlmUnavailable extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "LlmUnavailable";
  }
}

export const llmConfigured = () => Boolean(process.env.OPENAI_API_KEY);
export const modelName = () => process.env.OPENAI_MODEL || "gpt-6-luna";

let client: OpenAI | undefined;
const getClient = () => {
  if (!llmConfigured()) throw new LlmUnavailable("OPENAI_API_KEY is not set");
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 1 });
  return client;
};

// Small circuit breaker so a bad key or wrong model name fails fast instead of stalling every card.
const breaker = { failures: 0, openUntil: 0 };

export interface Completion {
  text: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
}

export interface CompleteOptions {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
}

export async function complete(opts: CompleteOptions): Promise<Completion> {
  if (Date.now() < breaker.openUntil) throw new LlmUnavailable("LLM temporarily disabled after repeated failures");
  const c = getClient();
  const started = Date.now();
  try {
    const res = await c.chat.completions.create({
      model: modelName(),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      max_completion_tokens: opts.maxTokens ?? 1800,
      ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    });
    breaker.failures = 0;
    return {
      text: res.choices[0]?.message?.content ?? "",
      model: res.model || modelName(),
      promptTokens: res.usage?.prompt_tokens ?? null,
      completionTokens: res.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    breaker.failures += 1;
    if (breaker.failures >= 3) breaker.openUntil = Date.now() + 60_000;
    throw new LlmUnavailable(e instanceof Error ? e.message : String(e));
  }
}

/** Health check used by /api/health and the pipeline monitor: does the configured model exist for this key? */
export async function probeModel(): Promise<{ configured: boolean; model: string; ok: boolean; detail: string }> {
  const model = modelName();
  if (!llmConfigured()) return { configured: false, model, ok: false, detail: "OPENAI_API_KEY not set; template writer in use" };
  try {
    await getClient().models.retrieve(model);
    return { configured: true, model, ok: true, detail: "model available" };
  } catch (e) {
    return { configured: true, model, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export function resetBreaker() {
  breaker.failures = 0;
  breaker.openUntil = 0;
}
