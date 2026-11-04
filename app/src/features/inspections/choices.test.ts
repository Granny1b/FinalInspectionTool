import { describe, expect, it } from 'vitest';
import { offListLabel, offListValues } from './choices';

const LIST = ['Mechanical', 'Electrical'];

describe('offListValues', () => {
  it('is empty for no value and for values on the list', () => {
    expect(offListValues(LIST, [undefined, ''])).toEqual([]);
    expect(offListValues(LIST, ['Electrical', 'Mechanical'])).toEqual([]);
  });

  it('keeps a value that is not on the list exactly as stored', () => {
    expect(offListValues(LIST, ['Mekanik'])).toEqual(['Mekanik']);
    // Matched exactly: another spelling is another value, and stays as it was stored.
    expect(offListValues(LIST, ['mechanical'])).toEqual(['mechanical']);
    expect(offListValues([], ['Mechanical'])).toEqual(['Mechanical']);
  });

  it('keeps the value the page opened with after another was picked, each value once', () => {
    expect(offListValues(LIST, ['Electrical', 'Mekanik'])).toEqual(['Mekanik']);
    expect(offListValues(LIST, ['Mekanik', 'Mekanik'])).toEqual(['Mekanik']);
    expect(offListValues(LIST, ['Svets', 'Mekanik'])).toEqual(['Svets', 'Mekanik']);
  });

  it('labels it as not in the list', () => {
    expect(offListLabel('Mekanik')).toBe('Mekanik (not in the list)');
  });
});
