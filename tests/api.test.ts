import { beforeAll, describe, expect, it } from 'vitest';
import { pid, installTestDb } from './helpers/testdb';
import { signSession, verifySession } from '../src/lib/auth/session';

beforeAll(async () => {
  installTestDb();
});

describe('session cookie', () => {
  it('round-trips and rejects tampering and expiry', () => {
    const t = signSession('11111111-1111-1111-1111-111111111111');
    expect(verifySession(t)).toBe('11111111-1111-1111-1111-111111111111');
    expect(verifySession(t.slice(0, -2) + 'xx')).toBeNull();
    expect(verifySession('a.b')).toBeNull();
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession(t, Date.now() + 13 * 3600 * 1000)).toBeNull();
    const [p, s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ p: '22222222-2222-2222-2222-222222222222', exp: 9999999999 })).toString(
      'base64url',
    );
    expect(verifySession(`${forged}.${s}`)).toBeNull();
    expect(p).toBeTruthy();
  });
});

describe('/api/session', () => {
  it('reports that no sign-in is required and refuses sign-in attempts', async () => {
    const { GET, POST } = await import('../src/app/api/session/route');
    expect(await (await GET()).json()).toEqual({ demo: true, signInRequired: false });
    expect((await POST()).status).toBe(410);
  });
});

describe('/api/pipeline/run', () => {
  it('refuses salespeople and anonymous callers', async () => {
    const { POST } = await import('../src/app/api/pipeline/run/route');
    const anon = await POST(new Request('http://x/api/pipeline/run', { method: 'POST', body: '{}' }));
    expect(anon.status).toBe(403);
    const cookie = `mb_session=${signSession(await pid('rahman'))}`;
    const sales = await POST(
      new Request('http://x/api/pipeline/run', { method: 'POST', body: '{}', headers: { cookie } }),
    );
    expect(sales.status).toBe(403);
  });

  it('rejects a wrong PIN and an unknown scenario', async () => {
    process.env.DEMO_CONTROL_PIN = '123456';
    const { POST } = await import('../src/app/api/pipeline/run/route');
    const wrong = await POST(
      new Request('http://x', { method: 'POST', body: '{}', headers: { 'x-demo-pin': '000000' } }),
    );
    expect(wrong.status).toBe(403);
    const cookie = `mb_session=${signSession(await pid('delaney'))}`;
    const bad = await POST(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ scenarios: ['nope'] }), headers: { cookie } }),
    );
    expect(bad.status).toBe(400);
  });
});

describe('/api/health', () => {
  it('reports wiring without leaking keys', async () => {
    process.env.OPENAI_API_KEY = '';
    const { GET } = await import('../src/app/api/health/route');
    const body = await (await GET()).json();
    expect(body.database.ok).toBe(true);
    expect(body.ai.configured).toBe(false);
    expect(body.market.simulated).toBe(false);
  });
});
