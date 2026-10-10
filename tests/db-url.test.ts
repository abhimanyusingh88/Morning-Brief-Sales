import { describe, expect, it } from 'vitest';
import { normalizeDatabaseUrl } from '@/lib/db/url';

const host = 'aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
describe('normalizeDatabaseUrl', () => {
  it('keeps an already-encoded url working', () => {
    const u = new URL(normalizeDatabaseUrl(`postgresql://postgres.ref:Abc%402026@${host}`));
    expect(decodeURIComponent(u.password)).toBe('Abc@2026');
    expect(u.hostname).toBe('aws-0-ap-south-1.pooler.supabase.com');
    expect(u.port).toBe('6543');
  });
  it('encodes a raw @ in the password', () => {
    const u = new URL(normalizeDatabaseUrl(`postgresql://postgres.ref:Abc@2026@${host}`));
    expect(decodeURIComponent(u.password)).toBe('Abc@2026');
    expect(u.hostname).toBe('aws-0-ap-south-1.pooler.supabase.com');
  });
  it('strips brackets, quotes and trailing comments', () => {
    const u = new URL(normalizeDatabaseUrl(`"postgresql://postgres.ref:[Abc@2026]@${host}"  # note`));
    expect(decodeURIComponent(u.password)).toBe('Abc@2026');
  });
  it('rejects the placeholder without echoing secrets', () => {
    expect(() => normalizeDatabaseUrl(`postgresql://postgres.ref:[YOUR-PASSWORD]@${host}`)).toThrow(/placeholder/);
  });
  it('rejects garbage with a helpful message', () => {
    expect(() => normalizeDatabaseUrl('not a url')).toThrow(/Transaction pooler/);
  });
});
