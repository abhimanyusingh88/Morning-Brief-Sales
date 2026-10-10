import { describe, expect, it } from 'vitest';
import { testDb } from './helpers/testdb';
import { runPipeline } from '../src/lib/pipeline/run';

const D = '2026-10-05';

describe('market brief per the build specification', () => {
  it('runs the staged pipeline and stores spec sections, QC and deliveries', async () => {
    const db = await testDb();
    const r = await runPipeline({ db, businessDate: D, trigger: 'manual', useLlm: false });
    expect(r.summary.error).toBeUndefined();
    expect(r.status).toBe('succeeded');
    const steps = await db.asService((q) =>
      q<{ key: string; status: string }>(`select key, status from pipeline_steps where run_id = $1 order by seq`, [
        r.runId,
      ]),
    );
    expect(steps.map((s) => s.status)).toEqual(steps.map(() => 'succeeded'));

    const kinds = await db.asService((q) =>
      q<{ kind: string; n: number }>(
        `select s.kind, count(*)::int n from brief_sections s join briefs b on b.id = s.brief_id where b.run_id = $1 group by s.kind`,
        [r.runId],
      ),
    );
    const by = Object.fromEntries(kinds.map((k) => [k.kind, k.n]));
    const briefs = (
      await db.asService((q) => q<{ n: number }>(`select count(*)::int n from briefs where run_id = $1`, [r.runId]))
    )[0].n;
    for (const k of ['snapshot', 'chart', 'catalysts']) expect(by[k], k).toBe(briefs);
    expect(by.earnings ?? 0).toBeGreaterThan(0);
    expect(by.news ?? 0).toBeGreaterThan(0);

    const st = await db.asService((q) =>
      q<{ n: number }>(
        `select count(*)::int n from briefs where run_id = $1 and status = 'published' and qc_status = 'passed'`,
        [r.runId],
      ),
    );
    expect(st[0].n).toBe(briefs);
    const dl = await db.asService((q) =>
      q<{ channel: string; status: string; n: number }>(
        `select channel, status, count(*)::int n from deliveries where run_id = $1 group by 1,2`,
        [r.runId],
      ),
    );
    expect(dl.some((d) => d.channel === 'email' && d.status === 'simulated')).toBe(true);
    const qc = await db.asService((q) =>
      q<{ kind: string; status: string; n: number }>(
        `select kind, status, count(*)::int n from qc_reviews where run_id = $1 group by 1,2`,
        [r.runId],
      ),
    );
    expect(qc.find((x) => x.kind === 'automated' && x.status === 'flagged')).toBeUndefined();
  }, 180_000);

  it('snapshot shows index moves in bp and every figure has a feed', async () => {
    const db = await testDb();
    const rows = await db.asService((q) =>
      q<{ key: string; display: string; feed_key: string | null }>(
        `select distinct on (f.key) f.key, f.display, f.feed_key from brief_facts f where f.key like 'sp.%.sub' or f.key like 'sp.%.lvl' order by f.key`,
      ),
    );
    expect(rows.find((r) => r.key === 'sp.SPX.sub')?.display).toMatch(/bp$/);
    expect(rows.find((r) => r.key === 'sp.UST10Y.lvl')?.display).toMatch(/%$/);
    expect(rows.every((r) => r.feed_key)).toBe(true);
  });

  it('no digit outside a token in any stored section template', async () => {
    const db = await testDb();
    const rows = await db.asService((q) =>
      q<{ t: string }>(`select body_template t from brief_sections where status = 'ok'`),
    );
    for (const { t } of rows) expect(t.replace(/\{\{[^}]+\}\}/g, '')).not.toMatch(/\p{N}/u);
  });
});
