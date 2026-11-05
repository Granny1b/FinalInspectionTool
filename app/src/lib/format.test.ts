import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';

describe('formatDate and formatDateTime', () => {
  // A moment given in local time, so the expectation holds in any time zone the tests run in.
  const moment = new Date(2026, 10, 5, 9, 7).toISOString();

  it('are ISO 8601: 2026-11-05 and 2026-11-05 09:07, in local time', () => {
    expect(formatDate(moment)).toBe('2026-11-05');
    expect(formatDateTime(moment)).toBe('2026-11-05 09:07');
  });

  it('show anything unparseable as it is', () => {
    expect(formatDate('soon')).toBe('soon');
    expect(formatDateTime('')).toBe('');
  });
});
