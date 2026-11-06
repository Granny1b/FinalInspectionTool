import { describe, expect, it } from 'vitest';
import {
  formatHours,
  newQualityFront,
  parseHours,
  qualityCheckTitle,
  rowHasContent,
  rowsHours,
  totalHours,
} from './qualityChecks';

describe('qualityCheckTitle', () => {
  it('is "Quality check – " and the name, or nothing while the name is blank', () => {
    expect(qualityCheckTitle({ name: ' Pre start up ' })).toBe('Quality check – Pre start up');
    expect(qualityCheckTitle({ name: ' ' })).toBe('');
  });

  it('does not say "Quality check" twice', () => {
    expect(qualityCheckTitle({ name: 'Quality check – Frame' })).toBe('Quality check – Frame');
    expect(qualityCheckTitle({ name: 'quality check frame' })).toBe('quality check frame');
  });
});

describe('newQualityFront', () => {
  it('starts with the Quality department and what is known', () => {
    expect(newQualityFront({ name: ' Frame ', madeBy: 'Sam', date: '2026-11-05' })).toEqual({
      name: 'Frame',
      department: 'Quality',
      documentNumber: '',
      madeBy: 'Sam',
      date: '2026-11-05',
    });
  });
});

describe('hours', () => {
  it('adds up to one decimal, without float noise', () => {
    expect(rowsHours([{ timeHours: 0.1 }, { timeHours: 0.2 }, {}])).toBe(0.3);
    expect(totalHours([{ items: [{ timeHours: 0.1 }] }, { items: [{ timeHours: 0.2 }] }])).toBe(
      0.3,
    );
    expect(totalHours([])).toBe(0);
  });

  it('shows one decimal', () => {
    expect(formatHours(0)).toBe('0.0 h');
    expect(formatHours(0.8)).toBe('0.8 h');
    expect(formatHours(12)).toBe('12.0 h');
    expect(formatHours(0.30000000000000004)).toBe('0.3 h');
  });

  it('reads hours as typed, with a decimal comma too', () => {
    expect(parseHours('0.5', 999)).toBe(0.5);
    expect(parseHours('0,5', 999)).toBe(0.5);
    expect(parseHours(' 2 ', 999)).toBe(2);
    expect(parseHours('.5', 999)).toBe(0.5);
    expect(parseHours('1.25', 999)).toBe(1.3);
    expect(parseHours('', 999)).toBeUndefined();
    expect(parseHours('  ', 999)).toBeUndefined();
    expect(parseHours('-1', 999)).toBeNull();
    expect(parseHours('abc', 999)).toBeNull();
    expect(parseHours('.', 999)).toBeNull();
    expect(parseHours('1000', 999)).toBeNull();
  });
});

describe('rowHasContent', () => {
  it('is false only for a row with nothing in it', () => {
    expect(rowHasContent({ id: 'a', text: ' ' })).toBe(false);
    expect(rowHasContent({ id: 'a', text: '', how: ' ', references: [] })).toBe(false);
    expect(rowHasContent({ id: 'a', text: 'x' })).toBe(true);
    expect(rowHasContent({ id: 'a', text: '', how: 'x' })).toBe(true);
    expect(rowHasContent({ id: 'a', text: '', references: ['ISO 1'] })).toBe(true);
    expect(rowHasContent({ id: 'a', text: '', timeHours: 0 })).toBe(true);
    expect(rowHasContent({ id: 'a', text: '', guide: { images: [] } })).toBe(true);
  });
});
