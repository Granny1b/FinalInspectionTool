import { describe, expect, it } from 'vitest';
import { countTicks, monthTicks } from './axis';

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

describe('month axis ticks', () => {
  /** `count` months from `first` on, "YYYY-MM". */
  const months = (first: string, count: number) =>
    Array.from({ length: count }, (_, index) => {
      const at = Number(first.slice(0, 4)) * 12 + Number(first.slice(5, 7)) - 1 + index;
      return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}`;
    });

  it('labels every month when they fit', () => {
    expect(monthTicks(months('2025-12', 12), 800)).toEqual(months('2025-12', 12));
    expect(monthTicks(['2026-10'], 100)).toEqual(['2026-10']);
    expect(monthTicks([], 400)).toEqual([]);
  });

  it('otherwise labels quarters, halves or years, always on the same months', () => {
    // 21 months in 450 px: a 56 px label needs three months' room, so quarters.
    expect(monthTicks(months('2025-03', 21), 450)).toEqual([
      '2025-04',
      '2025-07',
      '2025-10',
      '2026-01',
      '2026-04',
      '2026-07',
      '2026-10',
    ]);
    expect(monthTicks(months('2025-03', 21), 260)).toEqual(['2025-07', '2026-01', '2026-07']);
    expect(monthTicks(months('2019-05', 90), 500)).toEqual([
      '2020-01',
      '2021-01',
      '2022-01',
      '2023-01',
      '2024-01',
      '2025-01',
      '2026-01',
    ]);
  });

  it('keeps the labels at least a label apart', () => {
    for (let count = 1; count <= 240; count++) {
      for (const width of [240, 320, 450, 700, 1000]) {
        const all = months('2020-02', count);
        const ticks = monthTicks(all, width);
        expect(ticks.length).toBeGreaterThan(0);
        const slot = width / count;
        for (let index = 1; index < ticks.length; index++) {
          const apart = all.indexOf(ticks[index]!) - all.indexOf(ticks[index - 1]!);
          expect(apart * slot).toBeGreaterThanOrEqual(56);
        }
      }
    }
  });

  it('names the first month of a stretch too short for a quarter', () => {
    expect(monthTicks(['2026-02', '2026-03'], 50)).toEqual(['2026-02']);
  });
});
