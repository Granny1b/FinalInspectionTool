import { describe, expect, it } from 'vitest';
import { countTicks } from './axis';

describe('count axis ticks', () => {
  it('leaves room above the highest value, in whole round steps', () => {
    expect(countTicks(8)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(countTicks(3)).toEqual([0, 1, 2, 3, 4]);
    expect(countTicks(17)).toEqual([0, 5, 10, 15, 20]);
    expect(countTicks(45)).toEqual([0, 20, 40, 60]);
    expect(countTicks(130)).toEqual([0, 50, 100, 150]);
  });

  it('keeps at least three steps for small numbers and none at all', () => {
    expect(countTicks(1)).toEqual([0, 1, 2, 3]);
    expect(countTicks(0)).toEqual([0, 1, 2, 3]);
  });

  it('never puts the highest value on the top tick', () => {
    for (let max = 1; max <= 500; max++) {
      const ticks = countTicks(max);
      expect(ticks.at(-1)).toBeGreaterThan(max);
      expect(ticks.length).toBeGreaterThanOrEqual(4);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });
});
