import { describe, expect, it } from 'vitest';
import { offListLabel, offListValue } from './choices';

const LIST = ['Mechanical', 'Electrical'];

describe('offListValue', () => {
  it('is null for no value and for a value on the list', () => {
    expect(offListValue(LIST, undefined)).toBeNull();
    expect(offListValue(LIST, '')).toBeNull();
    expect(offListValue(LIST, 'Electrical')).toBeNull();
  });

  it('keeps a value that is not on the list exactly as stored', () => {
    expect(offListValue(LIST, 'Mekanik')).toBe('Mekanik');
    // Matched exactly: another spelling is another value, and stays as it was stored.
    expect(offListValue(LIST, 'mechanical')).toBe('mechanical');
    expect(offListValue([], 'Mechanical')).toBe('Mechanical');
  });

  it('labels it as not in the list', () => {
    expect(offListLabel('Mekanik')).toBe('Mekanik (not in the list)');
  });
});
