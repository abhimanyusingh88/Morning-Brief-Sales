import { createHash } from "node:crypto";
import type { Db } from "../db/types";
import { complete as realComplete, modelName, type CompleteOptions, type Completion } from "./gateway";

/**
 * Model output cache. A rerun of an unchanged morning replays the stored response instead of waiting for, and paying
 * for, the model again. Keys include the model name and the full prompt, so any change in the facts misses the cache.
 * Service access only (table has no policies): prompts hold no client names beyond what the writer was already given.
 */
export const hashOf = (o: CompleteOptions, model = modelName()) =>
  createHash("sha256").update(JSON.stringify([model, o.system, o.user, Boolean(o.json), o.maxTokens ?? null])).digest("hex");

export function cachedCompleter(db: Db, opts: { bypass?: boolean; onHit?: () => void } = {}) {
  return async (o: CompleteOptions): Promise<Completion> => {
    const hash = hashOf(o);
    if (!opts.bypass) {
      const hit = await db.asService((q) => q<{ response: string; model: string; prompt_tokens: number | null; completion_tokens: number | null }>(
        `select response, model, prompt_tokens, completion_tokens from llm_cache where hash = $1`, [hash])).catch(() => []);
      if (hit[0]) {
        opts.onHit?.();
        return { text: hit[0].response, model: hit[0].model, promptTokens: hit[0].prompt_tokens, completionTokens: hit[0].completion_tokens, latencyMs: 0, cached: true };
      }
    }
    const res = await realComplete(o);
    await db.asService((q) => q(
      `insert into llm_cache (hash, model, response, prompt_tokens, completion_tokens) values ($1, $2, $3, $4, $5)
       on conflict (hash) do update set response = excluded.response, model = excluded.model, prompt_tokens = excluded.prompt_tokens, completion_tokens = excluded.completion_tokens, created_at = now()`,
      [hash, res.model, res.text, res.promptTokens, res.completionTokens])).catch(() => {});
    return res;
  };
}
