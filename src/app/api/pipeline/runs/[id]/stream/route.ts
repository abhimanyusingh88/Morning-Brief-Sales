import { getDb } from "@/lib/db";
import { subscribe, type PipelineEvent, type StepState } from "@/lib/pipeline/bus";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const enc = new TextEncoder();
const frame = (e: PipelineEvent) => enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);

/**
 * Server-sent events for one run. Same-process runs stream from memory; otherwise (another instance,
 * or a finished run) the stream is rebuilt by polling the persisted steps, so a reload mid-run still works.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("bad id", { status: 400 });
  const db = await getDb();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (e: PipelineEvent) => { if (!closed) controller.enqueue(frame(e)); };
      const close = () => { if (!closed) { closed = true; try { controller.close(); } catch {} } };
      req.signal.addEventListener("abort", close);

      // Give a just-started run a moment to appear.
      let off = subscribe(id, (e) => { send(e); if (e.type === "done") close(); });
      if (off) return; // live from memory

      const last = new Map<number, string>();
      let idle = 0;
      while (!closed) {
        const run = (await db.asService((q) => q<{ business_date: string; status: "running" | "succeeded" | "failed"; summary: Record<string, unknown> }>(
          `select business_date::text, status, summary from pipeline_runs where id = $1`, [id])))[0];
        if (!run) {
          if (++idle > 8) { send({ type: "done", runId: id, status: "failed", summary: { error: "run not found" } }); return close(); }
          off = subscribe(id, (e) => { send(e); if (e.type === "done") close(); });
          if (off) return;
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        const rows = await db.asService((q) => q(`select seq, key, label, status, started_at, finished_at, rows_in, rows_out, detail, log from pipeline_steps where run_id = $1 order by seq`, [id]));
        const steps: StepState[] = rows.map((r) => ({
          seq: Number(r.seq), stage: Number((r.detail as Record<string, unknown>)?.stage ?? 1), simAt: String((r.detail as Record<string, unknown>)?.simAt ?? "04:00"), key: String(r.key), label: String(r.label), status: r.status as StepState["status"],
          startedAt: r.started_at ? new Date(r.started_at as string).toISOString() : null, finishedAt: r.finished_at ? new Date(r.finished_at as string).toISOString() : null,
          rowsIn: r.rows_in as number | null, rowsOut: r.rows_out as number | null, detail: (r.detail as Record<string, unknown>) ?? {}, log: (r.log as string[]) ?? [],
        }));
        if (!last.size) send({ type: "run", runId: id, businessDate: run.business_date, status: run.status, steps });
        for (const s of steps) {
          const sig = JSON.stringify([s.status, s.log.length, s.rowsOut]);
          if (last.get(s.seq) !== sig) { last.set(s.seq, sig); if (last.size) send({ type: "step", runId: id, step: s }); }
        }
        if (run.status !== "running") { send({ type: "done", runId: id, status: run.status, summary: run.summary }); return close(); }
        await new Promise((r) => setTimeout(r, 700));
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
