import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import type { FeedState } from '@/lib/feeds/connectors';
import { subscribe, type PipelineEvent, type StepState } from '@/lib/pipeline/bus';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const enc = new TextEncoder();
const frame = (e: PipelineEvent) => enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
const OPS = new Set(['admin', 'desk_head', 'compliance']);

/**
 * Server-sent events for one run: `run`, `step`, `feed`, `log`, `done`. Same-process runs stream from memory; otherwise
 * (another instance, a finished run, an old run) the stream is rebuilt by polling the persisted steps and connector
 * states, so a reload mid-run or reopening a past run works. Operations roles only; reads run under the caller's row-level security.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('bad id', { status: 400 });
  const meId = meFromRequest(req);
  const me = meId ? await loadMe(meId) : null;
  if (!me || !OPS.has(me.role)) return new Response('not allowed', { status: 403 });
  const db = await getDb();

  let teardown = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let off: (() => void) | null = null;
      const send = (e: PipelineEvent) => {
        if (!closed)
          try {
            controller.enqueue(frame(e));
          } catch {
            closed = true;
          }
      };
      // a comment frame every 15 s keeps proxies from closing a quiet stream
      const beat = setInterval(() => {
        if (!closed)
          try {
            controller.enqueue(enc.encode(': ping\n\n'));
          } catch {
            closed = true;
          }
      }, 15000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(beat);
        off?.();
        try {
          controller.close();
        } catch {}
      };
      teardown = close;
      req.signal.addEventListener('abort', close);
      const follow = () => {
        off = subscribe(id, (e) => {
          send(e);
          if (e.type === 'done') close();
        });
        return off !== null;
      };

      if (follow()) return; // live from memory

      const lastStep = new Map<number, string>();
      const lastFeed = new Map<string, string>();
      let announced = false;
      let idle = 0;
      while (!closed) {
        const run = (
          await db.asUser(me.id, (q) =>
            q<{ business_date: string; status: 'running' | 'succeeded' | 'failed'; summary: Record<string, unknown> }>(
              `select business_date::text, status, summary from pipeline_runs where id = $1`,
              [id],
            ),
          )
        )[0];
        if (!run) {
          // give a just-started run a moment to appear (in memory or in the table)
          if (++idle > 8) {
            send({ type: 'done', runId: id, status: 'failed', summary: { error: 'run not found' } });
            return close();
          }
          if (follow()) return;
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        const rows = await db.asUser(me.id, (q) =>
          q(
            `select seq, key, label, status, started_at, finished_at, rows_in, rows_out, detail, log from pipeline_steps where run_id = $1 order by seq`,
            [id],
          ),
        );
        const steps: StepState[] = rows.map((r) => ({
          seq: Number(r.seq),
          stage: Number((r.detail as Record<string, unknown>)?.stage ?? 1),
          simAt: String((r.detail as Record<string, unknown>)?.simAt ?? '04:00'),
          key: String(r.key),
          label: String(r.label),
          status: r.status as StepState['status'],
          startedAt: r.started_at ? new Date(r.started_at as string).toISOString() : null,
          finishedAt: r.finished_at ? new Date(r.finished_at as string).toISOString() : null,
          rowsIn: r.rows_in as number | null,
          rowsOut: r.rows_out as number | null,
          detail: (r.detail as Record<string, unknown>) ?? {},
          log: (r.log as string[]) ?? [],
        }));
        const feedRows = await db.asUser(me.id, (q) =>
          q(
            `select feed_key, status, started_at, finished_at, rows, latency_ms, as_of, detail, sample, log from feed_runs where run_id = $1 order by started_at, feed_key`,
            [id],
          ),
        );
        const feeds: FeedState[] = feedRows.map((r) => ({
          feedKey: String(r.feed_key),
          status: r.status as FeedState['status'],
          startedAt: new Date(r.started_at as string).toISOString(),
          finishedAt: r.finished_at ? new Date(r.finished_at as string).toISOString() : null,
          rows: Number(r.rows ?? 0),
          latencyMs: r.latency_ms == null ? null : Number(r.latency_ms),
          asOf: r.as_of ? new Date(r.as_of as string).toISOString() : null,
          detail: (r.detail as Record<string, unknown>) ?? {},
          sample: (r.sample as unknown[]) ?? [],
          log: (r.log as string[]) ?? [],
        }));
        if (!announced) {
          announced = true;
          send({ type: 'run', runId: id, businessDate: run.business_date, status: run.status, steps });
        }
        for (const f of feeds) {
          const sig = JSON.stringify([f.status, f.log.length, f.rows]);
          if (lastFeed.get(f.feedKey) !== sig) {
            lastFeed.set(f.feedKey, sig);
            send({ type: 'feed', runId: id, feed: f });
          }
        }
        for (const s of steps) {
          const sig = JSON.stringify([s.status, s.log.length, s.rowsOut]);
          if (lastStep.get(s.seq) !== sig) {
            lastStep.set(s.seq, sig);
            send({ type: 'step', runId: id, step: s });
          }
        }
        if (run.status !== 'running') {
          send({ type: 'done', runId: id, status: run.status, summary: run.summary });
          return close();
        }
        // a run whose process died would otherwise stay "running" for ever
        const touched = Math.max(
          0,
          ...steps.flatMap((s) => [s.startedAt, s.finishedAt]).map((t) => (t ? new Date(t).getTime() : 0)),
        );
        if (touched && Date.now() - touched > 3 * 60_000) {
          send({
            type: 'done',
            runId: id,
            status: 'failed',
            summary: { ...run.summary, error: 'The run stopped reporting progress (its process may have restarted)' },
          });
          return close();
        }
        await new Promise((r) => setTimeout(r, 700));
      }
    },
    cancel() {
      teardown();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
