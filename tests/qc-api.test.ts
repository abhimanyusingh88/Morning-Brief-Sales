import { beforeAll, describe, expect, it } from 'vitest';
import { testDb, pid, installTestDb } from './helpers/testdb';
import { signSession } from '../src/lib/auth/session';
import { runPipeline } from '../src/lib/pipeline/run';
import { publishedAt } from '../src/lib/pipeline/persist';

const D = '2026-10-05';
const URL = (id: string) => `http://x/api/qc/${id}`;
const post = (id: string, body: unknown, cookie?: string) =>
  new Request(URL(id), { method: 'POST', body: JSON.stringify(body), headers: cookie ? { cookie } : {} });
const get = (id: string, cookie?: string) => new Request(URL(id), { headers: cookie ? { cookie } : {} });
const ctx = (id: string) => ({ params: Promise.resolve({ briefId: id }) });
const as = async (slug: string) => `mb_session=${signSession(await pid(slug))}`;

let held = ''; // held by the simulated spot-check reviewer
let published = ''; // published; belongs to the RCS desk (Delaney's)
let eqsBrief = ''; // published; belongs to the EQS desk (Kessler's)
let route: typeof import('../src/app/api/qc/[briefId]/route');

beforeAll(async () => {
  installTestDb();
  const db = await testDb();
  // six people on two desks; the simulated reviewer holds one brief so both paths can be exercised
  const profileIds = await Promise.all(['okafor', 'raman', 'marchetti', 'whitfield', 'rahman', 'fontaine'].map(pid));
  await runPipeline({ db, businessDate: D, trigger: 'manual', useLlm: false, qcFlag: true, profileIds });
  const rows = await db.asService((q) =>
    q<{ id: string; status: string; qc_status: string; slug: string; desk: string }>(
      `select b.id, b.status, b.qc_status, split_part(p.email, '.', 2) slug, d.code desk from briefs b join profiles p on p.id = b.profile_id join desks d on d.id = p.desk_id where b.business_date = $1`,
      [D],
    ),
  );
  held = rows.find((r) => r.qc_status === 'flagged')!.id;
  published = rows.find((r) => r.status === 'published' && r.desk === 'RCS')!.id;
  eqsBrief = rows.find((r) => r.status === 'published' && r.desk === 'EQS')!.id;
  route = await import('../src/app/api/qc/[briefId]/route');
}, 180_000);

describe('/api/qc/[briefId] access', () => {
  it('refuses salespeople, including the default demo profile', async () => {
    expect((await route.POST(post(published, { action: 'hold' }), ctx(published))).status).toBe(403);
    expect((await route.POST(post(published, { action: 'hold' }, await as('rahman')), ctx(published))).status).toBe(
      403,
    );
    expect((await route.GET(get(published, await as('okafor')), ctx(published))).status).toBe(403);
    // and nothing changed
    const db = await testDb();
    expect(
      (
        await db.asService((q) => q<{ qc_status: string }>(`select qc_status from briefs where id = $1`, [published]))
      )[0].qc_status,
    ).toBe('passed');
  });

  it('validates the id and the body', async () => {
    const cookie = await as('delaney');
    expect((await route.POST(post('nope', { action: 'hold' }, cookie), ctx('nope'))).status).toBe(400);
    expect((await route.POST(post(published, { action: 'delete' }, cookie), ctx(published))).status).toBe(400);
    expect(
      (await route.POST(post(published, { action: 'hold', note: 'x'.repeat(1001) }, cookie), ctx(published))).status,
    ).toBe(400);
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await route.POST(post(ghost, { action: 'hold' }, cookie), ctx(ghost))).status).toBe(404);
  });

  it("a desk head cannot act on, or read, another desk's brief (row-level security)", async () => {
    const cookie = await as('delaney'); // heads Rates & Credit Sales; the brief belongs to Equity Sales
    expect((await route.POST(post(eqsBrief, { action: 'hold' }, cookie), ctx(eqsBrief))).status).toBe(404);
    expect((await route.GET(get(eqsBrief, cookie), ctx(eqsBrief))).status).toBe(404);
    const db = await testDb();
    expect(
      (await db.asService((q) => q<{ qc_status: string }>(`select qc_status from briefs where id = $1`, [eqsBrief])))[0]
        .qc_status,
    ).toBe('passed');
  });
});

describe('GET: a brief as its salesperson sees it', () => {
  it('returns the stored sections and the facts they cite to the desk head, the admin and compliance', async () => {
    for (const slug of ['delaney', 'whitaker', 'overton']) {
      const res = await route.GET(get(published, await as(slug)), ctx(published));
      expect(res.status, slug).toBe(200);
      const body = await res.json();
      expect(body.brief.id).toBe(published);
      expect(body.sections.length).toBeGreaterThan(5);
      const snap = body.sections.find((s: { kind: string }) => s.kind === 'snapshot');
      expect(snap.template).toMatch(/\{\{sp\.SPX\.lvl\}\}/);
      for (const k of snap.factKeys) expect(body.facts[k], k).toBeTruthy();
      expect(body.facts['sp.SPX.lvl'].source).toBeTruthy();
      expect(body.facts['sp.SPX.lvl'].asOf).toBeTruthy();
    }
  });
});

describe('hold and release', () => {
  it('hold: the brief becomes a draft, its deliveries are removed, and the decision is recorded and audited', async () => {
    const db = await testDb();
    const before = await db.asService((q) =>
      q<{ n: number }>(`select count(*)::int n from deliveries where brief_id = $1`, [published]),
    );
    expect(before[0].n).toBeGreaterThan(0);

    const res = await route.POST(
      post(published, { action: 'hold', note: 'Tone of the Catalysts text needs an edit' }, await as('delaney')),
      ctx(published),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      action: 'hold',
      status: 'draft',
      qcStatus: 'flagged',
      publishedAt: null,
    });

    const b = (
      await db.asService((q) =>
        q<{ status: string; qc_status: string; published_at: string | null }>(
          `select status, qc_status, published_at from briefs where id = $1`,
          [published],
        ),
      )
    )[0];
    expect(b).toMatchObject({ status: 'draft', qc_status: 'flagged', published_at: null });
    expect(
      (
        await db.asService((q) =>
          q<{ n: number }>(`select count(*)::int n from deliveries where brief_id = $1`, [published]),
        )
      )[0].n,
    ).toBe(0);

    const review = (
      await db.asService((q) =>
        q<{ kind: string; status: string; reviewer: string; notes: string; checks: { name: string; ok: boolean }[] }>(
          `select kind, status, reviewer, notes, checks from qc_reviews where brief_id = $1 and kind = 'spot_check' order by created_at desc, id desc limit 1`,
          [published],
        ),
      )
    )[0];
    expect(review).toMatchObject({
      kind: 'spot_check',
      status: 'flagged',
      reviewer: 'Marcus Delaney',
      notes: 'Tone of the Catalysts text needs an edit',
    });
    expect(review.checks.at(-1)).toMatchObject({ name: 'manual_decision', ok: false });

    const audit = await db.asService((q) =>
      q<{ action: string; actor_id: string; detail: { note: string } }>(
        `select action, actor_id, detail from audit_log where object_id = $1`,
        [published],
      ),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'qc.hold', actor_id: await pid('delaney') });
    expect(audit[0].detail.note).toMatch(/Tone/);
  });

  it('holding twice is refused and changes nothing', async () => {
    const res = await route.POST(post(published, { action: 'hold' }, await as('whitaker')), ctx(published));
    expect(res.status).toBe(409);
    const db = await testDb();
    expect(
      (
        await db.asService((q) =>
          q<{ n: number }>(`select count(*)::int n from qc_reviews where brief_id = $1 and reviewer = 'Sam Whitaker'`, [
            published,
          ]),
        )
      )[0].n,
    ).toBe(0);
  });

  it('a held brief stays unpublished and undelivered', async () => {
    const db = await testDb();
    for (const id of [held, published]) {
      const b = (
        await db.asService((q) =>
          q<{ status: string; qc_status: string }>(`select status, qc_status from briefs where id = $1`, [id]),
        )
      )[0];
      expect(b).toMatchObject({ status: 'draft', qc_status: 'flagged' });
      expect(
        (
          await db.asService((q) =>
            q<{ n: number }>(`select count(*)::int n from deliveries where brief_id = $1`, [id]),
          )
        )[0].n,
      ).toBe(0);
    }
  });

  it("release: publishes at the person's own send time and writes the deliveries their setting asks for", async () => {
    const db = await testDb();
    const profileId = (
      await db.asService((q) => q<{ profile_id: string }>(`select profile_id from briefs where id = $1`, [published]))
    )[0].profile_id;
    // this person asked for both channels at 07:00 ET
    await db.asService((q) =>
      q(
        `insert into brief_preferences (profile_id, effective_from, sectors, products, delivery, send_time) values ($1, '2026-10-01', '{Financials}', '{Equities}', 'both', '07:00')`,
        [profileId],
      ),
    );

    const res = await route.POST(
      post(published, { action: 'release', note: 'Edited and rechecked' }, await as('whitaker')),
      ctx(published),
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    const want = publishedAt(D, profileId, '07:00');
    expect(out).toMatchObject({
      ok: true,
      action: 'release',
      status: 'published',
      qcStatus: 'passed',
      publishedAt: want,
    });

    const b = (
      await db.asService((q) =>
        q<{ status: string; qc_status: string; published_at: string }>(
          `select status, qc_status, published_at from briefs where id = $1`,
          [published],
        ),
      )
    )[0];
    expect(b.status).toBe('published');
    expect(b.qc_status).toBe('passed');
    expect(new Date(b.published_at).toISOString()).toBe(want);

    const dl = await db.asService((q) =>
      q<{
        channel: string;
        status: string;
        to_address: string | null;
        subject: string | null;
        html: string | null;
        delivered_at: string;
      }>(
        `select channel, status, to_address, subject, html, delivered_at from deliveries where brief_id = $1 order by channel`,
        [published],
      ),
    );
    expect(dl.map((d) => `${d.channel}:${d.status}`)).toEqual(['dashboard:delivered', 'email:simulated']);
    expect(new Date(dl[0].delivered_at).toISOString()).toBe(want);
    expect(dl[1].to_address).toMatch(/@northgate\.example$/); // the salesperson, never a client
    expect(dl[1].subject).toMatch(/Morning brief/);
    expect(dl[1].html).toMatch(/<html/);

    const review = (
      await db.asService((q) =>
        q<{ status: string; reviewer: string }>(
          `select status, reviewer from qc_reviews where brief_id = $1 and kind = 'spot_check' order by created_at desc, id desc limit 1`,
          [published],
        ),
      )
    )[0];
    expect(review).toMatchObject({ status: 'passed', reviewer: 'Sam Whitaker' });
    const audit = await db.asService((q) =>
      q<{ action: string }>(`select action from audit_log where object_id = $1 order by id`, [published]),
    );
    expect(audit.map((a) => a.action)).toEqual(['qc.hold', 'qc.release']);
  });

  it('releasing a published brief is refused; compliance can release the brief the reviewer held', async () => {
    expect((await route.POST(post(published, { action: 'release' }, await as('overton')), ctx(published))).status).toBe(
      409,
    );
    const res = await route.POST(post(held, { action: 'release' }, await as('overton')), ctx(held));
    expect(res.status).toBe(200);
    const db = await testDb();
    const b = (
      await db.asService((q) =>
        q<{ status: string; qc_status: string }>(`select status, qc_status from briefs where id = $1`, [held]),
      )
    )[0];
    expect(b).toMatchObject({ status: 'published', qc_status: 'passed' });
    const dl = await db.asService((q) =>
      q<{ channel: string; to_address: string | null }>(
        `select channel, to_address from deliveries where brief_id = $1`,
        [held],
      ),
    );
    expect(dl.length).toBeGreaterThan(0);
    // never anyone but the salesperson
    const email = (
      await db.asService((q) =>
        q<{ email: string }>(`select p.email from briefs b join profiles p on p.id = b.profile_id where b.id = $1`, [
          held,
        ]),
      )
    )[0].email;
    for (const d of dl) if (d.channel === 'email') expect(d.to_address).toBe(email);
  });
});
