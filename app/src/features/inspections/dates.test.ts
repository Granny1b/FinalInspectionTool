import { describe, expect, it } from 'vitest';
import { formatCalendarDate, localDate } from './dates';

describe('localDate', () => {
  it('is the local calendar date, zero-padded', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });
});

describe('formatCalendarDate', () => {
  it('is ISO, like the app’s other dates, and never shifts the day', () => {
    expect(formatCalendarDate('2026-10-07')).toBe('2026-10-07');
    expect(formatCalendarDate('2026-01-01')).toBe('2026-01-01');
  });

  it('shows anything unparseable as it is', () => {
    expect(formatCalendarDate('soon')).toBe('soon');
  });
});
