import { z } from 'zod';
import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/live/delivery';
import { getCoverage, getDayReport, getReport, getReportVersion, narrowReport } from '@/lib/live/reports';
import { parseFilters } from '@/lib/live/presentation';
import { businessDate } from '@/lib/live/time';
import { answerFromReport, answerWithModel, fallbackAnswer, type ThinkingEvent } from '@/lib/live/assistant';
import { getCalendar, getMovers } from '@/lib/live/intraday';
import { ensureThread, threadHistory } from '@/lib/live/threads';
import { compareReports, comparisonAnswer } from '@/lib/live/compare';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const Id = z.string().regex(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
const Body = z.object({
  report: Id,
  client: Id.nullable(),
  question: z.string().trim().min(1).max(1200),
  filters: z.object({ q: z.string().max(160), topic: z.string().max(40), symbol: z.string().max(15) }),
  thread: Id.nullable().optional(),
  compare: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  clients: z.array(Id).max(50).optional(),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(5000) }))
    .max(6)
    .default([]),
});
type Result = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): Result => ({ status, body: { error } });

async function answer(id: string, b: z.infer<typeof Body>, emit: (e: ThinkingEvent) => void): Promise<Result> {
  const db = await getDb();
  // A client selection in the chat narrows the all-clients report; ids must be within the person's coverage.
  const picked = b.clients?.length ? b.clients : null;
  if (picked) {
    const cov = await getCoverage(db, id);
    if (picked.some((c) => !cov.clients.some((x) => x.id === c)))
      return fail(400, 'Select clients from your coverage.');
  }
  emit({ type: 'phase', label: 'Reading the brief and client positions' });
  const version = await getReportVersion(db, id, b.client, b.report);
  if (!version) return fail(409, 'Refresh the brief before asking about this report.');
  // A past day's brief is answered from its own snapshot; picking clients narrows that day's all-clients version.
  const archived = Boolean(version.archived),
    base = !picked
      ? version
      : archived
        ? version.clientId
          ? await getDayReport(db, id, null, version.businessDate)
          : version
        : await getReport(db, id, null);
  const report = base && picked ? narrowReport(base, picked) : base;
  if (!report) return fail(409, 'Refresh the brief before asking about this report.');
  // Comparison: the same client scope's brief for another day, today's live version or a past day's snapshot.
  let compare: typeof report | null = null;
  if (b.compare) {
    if (b.compare === report.businessDate) return fail(400, 'Pick a different day to compare with.');
    emit({ type: 'phase', label: 'Loading the ' + b.compare + ' brief for comparison' });
    const scope = picked ? null : b.client,
      other =
        b.compare === businessDate() ? await getReport(db, id, scope) : await getDayReport(db, id, scope, b.compare);
    compare = other && picked ? narrowReport(other, picked) : other;
    if (!compare) return fail(404, 'No brief was published for that day in this client view.');
  }
  const filters = parseFilters(new URLSearchParams(b.filters));
  // Each conversation is isolated: context comes only from this thread's stored messages, never from the client.
  const thread = await ensureThread(db, id, b.thread, b.question);
  if (!thread) return fail(404, 'Conversation not found');
  const history = b.thread ? await threadHistory(db, id, thread) : [];
  let result = compare ? null : answerFromReport(report, filters, b.question);
  if (!result) {
    if (!archived) emit({ type: 'phase', label: 'Checking live prices and today’s calendar' });
    // Public quotes for held symbols and the public calendar; no client data leaves the server.
    // Today's quotes and calendar would misdate a past brief, so an archived day is answered from its own evidence only.
    const live = archived
      ? undefined
      : await Promise.all([getMovers(report.coverage), getCalendar(new Date(), db)]).then(([movers, calendar]) => ({
          movers,
          calendar,
        }));
    if (process.env.OPENAI_API_KEY) {
      const reserved = await db.asService((q) =>
        q(
          "insert into live_assistant_usage(profile_id,day,calls) values($1,$2,1) on conflict(profile_id,day) do update set calls=live_assistant_usage.calls+1,last_call=now() where live_assistant_usage.calls<60 and live_assistant_usage.last_call<now()-interval '3 seconds' returning calls",
          [id, businessDate()],
        ),
      );
      if (reserved.length)
        try {
          result = await answerWithModel(report, filters, b.question, history, live, emit, compare ?? undefined);
        } catch (e) {
          const error = e as { name?: string; status?: number; code?: string };
          console.warn(
            '[live-assistant] analysis_unavailable',
            error.name ?? 'Error',
            error.status ?? '',
            error.code ?? '',
          );
        }
    }
    if (!result)
      result = compare
        ? {
            method: 'facts',
            notice: 'Comparison computed from the two saved briefs.',
            answer: comparisonAnswer(compareReports(report, compare)),
            sources: [],
          }
        : fallbackAnswer(report, filters, b.question, live);
  }
  if (!result)
    return fail(
      422,
      'The answer could not be grounded in this report. Try a more specific question; no unsupported answer was shown.',
    );
  // Recheck assignment, report evidence and preference changes after any model request.
  if (!(await getReportVersion(db, id, picked ? null : b.client, picked ? base!.id : b.report)))
    return fail(409, 'Your client scope changed. Reload the brief.');
  await db.asUser(id, (q) =>
    q(
      'insert into live_assistant_messages(profile_id,report_id,question,answer,source_ids,method,thread_id,notice) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        base!.id,
        b.question,
        result!.answer,
        result!.sources.map((s) => s.id),
        result!.method,
        thread,
        result!.notice ?? null,
      ],
    ),
  );
  await db.asUser(id, (q) => q('update live_assistant_threads set updated_at=now() where id=$1', [thread]));
  return {
    status: 200,
    body: {
      ...result,
      thread,
      reportId: report.id,
      clientName: report.clientName,
      cutoff: report.cutoff,
      businessDate: report.businessDate,
      archived,
      compare: compare?.businessDate ?? null,
    },
  };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const id = meFromRequest(request);
  if (!id || !(await loadMe(id))) return Response.json({ error: 'Sign in required' }, { status: 401 });
  if (Number(request.headers.get('content-length') ?? 0) > 40000)
    return Response.json({ error: 'Question is too large' }, { status: 413 });
  const raw = await request.text();
  if (raw.length > 40000) return Response.json({ error: 'Question is too large' }, { status: 413 });
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid question' }, { status: 400 });
  }
  const parsed = Body.safeParse(input);
  if (!parsed.success) return Response.json({ error: 'Enter a question and a valid report' }, { status: 400 });
  const unavailable = fail(503, 'The assistant could not respond. Your brief remains available.');
  // Server-sent events: live progress and the model's reasoning summary, then the verified answer.
  if ((request.headers.get('accept') ?? '').includes('text/event-stream')) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let open = true;
        const send = (event: string, data: unknown) => {
          if (open)
            try {
              controller.enqueue(enc.encode('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'));
            } catch {
              open = false;
            }
        };
        const r = await answer(id, parsed.data, (e) => send(e.type, e)).catch(() => unavailable);
        send('result', r);
        open = false;
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Accel-Buffering': 'no',
      },
    });
  }
  const r = await answer(id, parsed.data, () => {}).catch(() => unavailable);
  return Response.json(r.body, { status: r.status, headers: { 'Cache-Control': 'private, no-store' } });
}
