import { describe, expect, it } from 'vitest';
import { isIsoDate, parseTypedDate, withinBounds } from './isoDate';

describe('isIsoDate', () => {
  it('accepts real dates written YYYY-MM-DD', () => {
    expect(isIsoDate('2026-11-05')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });

  it('refuses impossible dates and other spellings', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-11-5')).toBe(false);
    expect(isIsoDate('11/05/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
  });
});

describe('parseTypedDate', () => {
  it('reads the usual ways of typing a date as YYYY-MM-DD', () => {
    expect(parseTypedDate('2026-11-05')).toBe('2026-11-05');
    expect(parseTypedDate(' 20261105 ')).toBe('2026-11-05');
    expect(parseTypedDate('2026/11/05')).toBe('2026-11-05');
    expect(parseTypedDate('2026.11.5')).toBe('2026-11-05');
    expect(parseTypedDate('2026 1 9')).toBe('2026-01-09');
  });

  it('is null while the date is incomplete or impossible', () => {
    expect(parseTypedDate('2026-11-')).toBeNull();
    expect(parseTypedDate('2026-02-30')).toBeNull();
    expect(parseTypedDate('05/11/2026')).toBeNull();
  });
});

describe('withinBounds', () => {
  it('compares as text, the bounds optional', () => {
    expect(withinBounds('2026-11-05', '2000-01-01', '2099-12-31')).toBe(true);
    expect(withinBounds('1999-12-31', '2000-01-01')).toBe(false);
    expect(withinBounds('2100-01-01', undefined, '2099-12-31')).toBe(false);
    expect(withinBounds('2026-11-05')).toBe(true);
  });
});
