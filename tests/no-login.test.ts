import { describe, expect, it } from 'vitest';
import { meFromRequest, signSession } from '../src/lib/auth/session';
import { uid } from '../src/lib/util/id';
describe('no sign-in', () => {
  it('uses the demo desk profile without a session and honours a valid signed session', () => {
    expect(meFromRequest(new Request('http://x'))).toBe(uid('live:sales-1'));
    expect(meFromRequest(new Request('http://x', { headers: { cookie: 'mb_session=forged.value' } }))).toBe(
      uid('live:sales-1'),
    );
    const other = uid('live:sales-2');
    expect(meFromRequest(new Request('http://x', { headers: { cookie: 'mb_session=' + signSession(other) } }))).toBe(
      other,
    );
  });
});
