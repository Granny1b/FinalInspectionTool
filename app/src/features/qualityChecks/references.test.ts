import { MAX_REFERENCES } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { addReferences, splitReferences } from './references';

describe('splitReferences', () => {
  it('splits on commas, semicolons and lines, tidying the spaces', () => {
    expect(splitReferences(' ISO  12100, ISO 7010;IEC 60204-1\nEN 1037 ,, ')).toEqual([
      'ISO 12100',
      'ISO 7010',
      'IEC 60204-1',
      'EN 1037',
    ]);
    expect(splitReferences('  ')).toEqual([]);
    expect(splitReferences('x'.repeat(150))[0]).toHaveLength(100);
  });
});

describe('addReferences', () => {
  it('adds what is new, ignoring case, and keeps the array when nothing is', () => {
    const list = ['ISO 12100'];
    expect(addReferences(list, ['iso 12100', 'ISO 7010', 'ISO 7010'])).toEqual([
      'ISO 12100',
      'ISO 7010',
    ]);
    expect(addReferences(list, ['ISO 12100'])).toBe(list);
  });

  it('stops at the most a row may have', () => {
    const many = Array.from({ length: MAX_REFERENCES - 1 }, (_, i) => `R${i}`);
    expect(addReferences(many, ['A', 'B'])).toHaveLength(MAX_REFERENCES);
  });
});
