import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { loadMe, meFromRequest } from '@/lib/auth/session';
import { demoBusinessDate } from '@/lib/config';
import { runPipeline } from '@/lib/pipeline/run';
import { publish } from '@/lib/pipeline/bus';
import { FEED_BY_KEY } from '@/lib/feeds/registry';
import { SCENARIOS } from '@/lib/market/scenarios';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
  scenarios: z.array(z.string()).max(10).optional(),
  /** pace the run as a ~90 s time-lapse of the morning (default); false runs it as fast as it can */
  timelapse: z.boolean().default(true),
  /** simulate a feed problem: { feedKey: "down" | "delayed" } */
  outages: z.record(z.string(), z.enum(['down', 'delayed'])).optional(),
  /** the simulated spot-check reviewer holds one brief */
  qcFlag: z.boolean().optional(),
  /** ignore stored model output and call the model again */
  bypassCache: z.boolean().optional(),
  /** false forces the template writer even when a model is configured */
  useLlm: z.boolean().optional(),
});

/** Admin / desk head, or the demo-control PIN. */
async function authorised(req: Request): Promise<boolean> {
  const pin = process.env.DEMO_CONTROL_PIN;
  if (pin && req.headers.get('x-demo-pin') === pin) return true;
  const id = meFromRequest(req);
  const me = id ? await loadMe(id) : null;
  return me?.role === 'admin' || me?.role === 'desk_head';
}

export async function POST(req: Request) {
  if (!(await authorised(req))) return NextResponse.json({ error: 'not allowed' }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'bad request' }, { status: 400 });
  const { date, scenarios, timelapse, outages, qcFlag, bypassCache, useLlm } = parsed.data;
  const known = new Set(SCENARIOS.map((s) => s.key));
  const bad = scenarios?.find((s) => !known.has(s));
  if (bad) return NextResponse.json({ error: `unknown scenario: ${bad}` }, { status: 400 });
  const badFeed = Object.keys(outages ?? {}).find((k) => !FEED_BY_KEY.has(k));
  if (badFeed) return NextResponse.json({ error: `unknown feed: ${badFeed}` }, { status: 400 });

  const db = await getDb();
  // Two runs at once would overwrite each other's drafts. A run that has shown no progress for two minutes counts as abandoned.
  const live = (
    await db.asService((q) =>
      q<{ id: string }>(
        `select r.id from pipeline_runs r
      where r.status = 'running'
        and greatest(r.started_at, coalesce((select max(coalesce(s.finished_at, s.started_at)) from pipeline_steps s where s.run_id = r.id), r.started_at)) > now() - interval '2 minutes'
      limit 1`,
      ),
    )
  )[0];
  if (live) return NextResponse.json({ error: 'A run is already in progress', runId: live.id }, { status: 409 });

  const businessDate = date ?? demoBusinessDate();
  // Allocate the run id up front so the caller can start streaming immediately.
  const runId = crypto.randomUUID();
  publish(runId, { type: 'run', runId, businessDate, status: 'running', steps: [] });
  after(async () => {
    await runPipeline({
      db,
      businessDate,
      trigger: 'demo',
      scenarios,
      useLlm,
      timelapse,
      outages,
      qcFlag,
      bypassCache,
      runId,
      // instant mode: no artificial hold; time-lapse: the run's own pacing (about 3.6 s per step) applies
      minStepMs: timelapse ? undefined : 0,
    });
  });
  return NextResponse.json({ runId, businessDate }, { status: 202 });
}
