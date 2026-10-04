import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { loadMe, meFromRequest } from "@/lib/auth/session";
import { demoBusinessDate } from "@/lib/config";
import { runPipeline } from "@/lib/pipeline/run";
import { publish } from "@/lib/pipeline/bus";
import { SCENARIOS } from "@/lib/market/scenarios";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scenarios: z.array(z.string()).optional(),
  live: z.boolean().optional(), // slow each step down so the run is watchable
  useLlm: z.boolean().optional(),
});

/** Admin / desk head, or the demo-control PIN. */
async function authorised(req: Request): Promise<boolean> {
  const pin = process.env.DEMO_CONTROL_PIN;
  if (pin && req.headers.get("x-demo-pin") === pin) return true;
  const id = meFromRequest(req);
  const me = id ? await loadMe(id) : null;
  return me?.role === "admin" || me?.role === "desk_head";
}

export async function POST(req: Request) {
  if (!(await authorised(req))) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  const known = new Set(SCENARIOS.map((s) => s.key));
  const bad = parsed.data.scenarios?.find((s) => !known.has(s));
  if (bad) return NextResponse.json({ error: `unknown scenario: ${bad}` }, { status: 400 });

  const db = await getDb();
  const businessDate = parsed.data.date ?? demoBusinessDate();
  // Allocate the run id up front so the caller can start streaming immediately.
  const runId = crypto.randomUUID();
  publish(runId, { type: "run", runId, businessDate, status: "running", steps: [] });
  after(async () => {
    await runPipeline({ db, businessDate, trigger: "demo", scenarios: parsed.data.scenarios, useLlm: parsed.data.useLlm, minStepMs: parsed.data.live ? 900 : 0, runId });
  });
  return NextResponse.json({ runId, businessDate }, { status: 202 });
}
