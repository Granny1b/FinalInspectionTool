import type { Section } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { advancesAfter, rowOrder, targetRow } from './navigation';

/** Rows a1..a3 / (empty section) / b1..b2. */
const sections: Section[] = [
  {
    id: 'sA',
    title: 'Loading area',
    items: [
      { id: 'a1', text: 'Lifting columns - Marked screws' },
      { id: 'a2', text: 'Light curtains - Correct height' },
      { id: 'a3', text: 'Pallet mover - Chains slack' },
    ],
  },
  { id: 'sE', title: 'Empty', items: [] },
  {
    id: 'sB',
    title: 'Tool Arena',
    items: [
      { id: 'b1', text: 'Tool changer - Labels' },
      { id: 'b2', text: 'Magazine - Doors' },
    ],
  },
];
const order = rowOrder(sections);

describe('rowOrder', () => {
  it('lists every row in checklist order, across sections', () => {
    expect(order).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
  });

  it('is empty without rows', () => {
    expect(rowOrder([])).toEqual([]);
    expect(rowOrder([{ id: 's', title: '', items: [] }])).toEqual([]);
  });
});

describe('targetRow', () => {
  it('moves to the next and previous row', () => {
    expect(targetRow(order, 'a1', 'next')).toBe('a2');
    expect(targetRow(order, 'a2', 'previous')).toBe('a1');
  });

  it('crosses section boundaries, skipping sections without rows', () => {
    expect(targetRow(order, 'a3', 'next')).toBe('b1');
    expect(targetRow(order, 'b1', 'previous')).toBe('a3');
  });

  it('has nowhere to go past either end', () => {
    expect(targetRow(order, 'b2', 'next')).toBeNull();
    expect(targetRow(order, 'a1', 'previous')).toBeNull();
  });

  it('jumps to the first and last row', () => {
    expect(targetRow(order, 'b1', 'first')).toBe('a1');
    expect(targetRow(order, 'a2', 'last')).toBe('b2');
    expect(targetRow(order, 'a1', 'first')).toBeNull();
    expect(targetRow(order, 'b2', 'last')).toBeNull();
  });

  it('ignores an unknown row', () => {
    expect(targetRow(order, 'zz', 'next')).toBeNull();
    expect(targetRow([], 'a1', 'first')).toBeNull();
  });

  it('works with a single row', () => {
    for (const move of ['next', 'previous', 'first', 'last'] as const) {
      expect(targetRow(['only'], 'only', move)).toBeNull();
    }
  });
});

describe('advancesAfter', () => {
  it('moves on after OK and N/A, stays on NOK for its comment and resp', () => {
    expect(advancesAfter('OK')).toBe(true);
    expect(advancesAfter('NA')).toBe(true);
    expect(advancesAfter('NOK')).toBe(false);
  });
});
