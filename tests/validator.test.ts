import { describe, expect, it } from 'vitest';
import { validateText } from '../src/lib/ai/validator';
import { FactBook } from '../src/lib/ai/facts';

const allowed = new Set(['mkt.UST10Y.chg', 'card1.exposure', 'mkt.NVDA.name']);
const v = (t: string, extra: Partial<Parameters<typeof validateText>[1]> = {}) =>
  validateText(t, { allowedKeys: allowed, ...extra });

describe('number guardrail', () => {
  it('accepts prose built from allowed tokens', () => {
    const r = v(
      'The ten-year is {{mkt.UST10Y.chg}} overnight and {{card1.exposure}} of duration is exposed.'.replace(
        'ten-year',
        'long end',
      ),
    );
    expect(r.ok).toBe(true);
    expect(r.tokens).toEqual(['mkt.UST10Y.chg', 'card1.exposure']);
  });

  it.each([
    ['Yields rose 9 bp overnight.', 'digit_outside_token'],
    ['Yields rose 9.5 basis points.', 'digit_outside_token'],
    ['They hold about $40mm in chips.', 'digit_outside_token'],
    ['Yields rose nine basis points.', 'number_word:nine'],
    ['The ten-year is higher.', 'number_word:ten'],
    ['Exposure doubled overnight.', 'number_word:doubled'],
    ['Up one basis point since yesterday.', 'number_word:one'],
    ['Down roughly half a percent.', 'number_word:half'],
    ['Prices fell 3%', 'digit_outside_token'],
    ['Prices fell {{card1.exposure}}%', 'symbol_outside_token:%'],
    ['Yields rose by some bps', 'unit_outside_token:bp'],
    ['Yields rose ９ overnight.', 'digit_outside_token'],
    ['Yields rose ٩ overnight.', 'digit_outside_token'],
    ['Yields rose ½ a notch.', 'digit_outside_token'],
  ])('rejects %s', (text, err) => {
    const r = v(text);
    expect(r.ok).toBe(false);
    expect(r.errors.join(',')).toContain(err);
  });

  it('rejects tokens the model invented', () => {
    const r = v('Duration is {{card1.convexity}} today.');
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('unknown_token:card1.convexity');
  });

  it('rejects malformed tokens and empty text', () => {
    expect(v('Open {{card1.exposure').ok).toBe(false);
    expect(v('   ').ok).toBe(false);
  });

  it('blocks restricted names (information barrier), case-insensitively and by whole word', () => {
    expect(v('Worth a word on Micron today.', { forbiddenTerms: ['Micron'] }).ok).toBe(false);
    expect(v('Worth a word on micron today.', { forbiddenTerms: ['Micron'] }).ok).toBe(false);
    expect(v('Worth a word on the sector today.', { forbiddenTerms: ['MU', 'Micron'] }).ok).toBe(true);
    expect(v('Consumer names are quiet.', { forbiddenTerms: ['MU'] }).ok).toBe(true);
  });

  it('blocks guarantees and hints of inside information', () => {
    expect(v('This will outperform for sure.').ok).toBe(false);
    expect(v('A risk-free way to add duration.').ok).toBe(false);
    expect(v('We have non-public color on this.').ok).toBe(false);
  });

  it('enforces a length cap', () => {
    expect(v('a'.repeat(500), { maxLength: 100 }).errors.join()).toContain('too_long');
  });
});

describe('fact book', () => {
  it('renders tokens and refuses unknown ones', () => {
    const fb = new FactBook();
    fb.add({
      key: 'mkt.UST10Y.chg',
      label: '10Y move',
      value: 9.5,
      display: '+9.5 bp',
      unit: 'bp',
      source: 'sim',
      asOf: '2026-10-05T10:20:00Z',
    });
    expect(fb.render('Yields {{mkt.UST10Y.chg}}')).toBe('Yields +9.5 bp');
    expect(() => fb.render('{{nope}}')).toThrow();
  });
  it('rejects keys that could escape the token syntax', () => {
    expect(() =>
      new FactBook().add({ key: 'a b', label: '', value: 1, display: '1', unit: 'count', source: '', asOf: '' }),
    ).toThrow();
  });
});
