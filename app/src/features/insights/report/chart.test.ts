import { describe, expect, it } from 'vitest';
import { MM, monthChart, monthRows } from './chart';

const months = (count: number, deviations = (index: number) => index) =>
  Array.from({ length: count }, (_, index) => ({
    month: `20${String(26 + Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, '0')}`,
    inspections: 1,
    deviations: deviations(index),
  }));

describe('monthChart', () => {
  it('draws one or two months as columns, three and more as a line', () => {
    expect(monthChart(months(1)).kind).toBe('columns');
    expect(monthChart(months(2)).kind).toBe('columns');
    expect(monthChart(months(3)).kind).toBe('line');
  });

  it('spreads the months over the plot, right of the axis gutter, the content width wide', () => {
    const chart = monthChart(months(4));
    expect(chart.width).toBeCloseTo(185 * MM);
    expect(chart.plot.left).toBeCloseTo(20 * MM);
    const slot = (165 * MM) / 4;
    expect(chart.points.map((point) => point.x)).toEqual(
      [0.5, 1.5, 2.5, 3.5].map((at) => expect.closeTo(20 * MM + at * slot)),
    );
  });

  it('puts 0 on the axis and the highest month below the top tick', () => {
    const chart = monthChart(months(3, (index) => [0, 7, 3][index]!));
    expect(chart.ticks.map((tick) => tick.value)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(chart.ticks[0]!.y).toBeCloseTo(chart.plot.bottom);
    expect(chart.ticks.at(-1)!.y).toBeCloseTo(chart.plot.top);
    expect(chart.points[0]!.y).toBeCloseTo(chart.plot.bottom);
    expect(chart.points[1]!.y).toBeGreaterThan(chart.plot.top);
  });

  it('leaves a year or less to the month table to name, and thins the labels of more', () => {
    expect(monthChart(months(12)).axisLabels).toBe(false);
    expect(monthChart(months(12)).points.some((point) => point.labelled)).toBe(false);
    const long = monthChart(months(30));
    expect(long.axisLabels).toBe(true);
    const labelled = long.points.flatMap((point, index) => (point.labelled ? [index] : []));
    // Counted back from the latest month, which always has its label.
    expect(labelled.at(-1)).toBe(29);
    expect(labelled[1]! - labelled[0]!).toBe(3);
    expect(long.height).toBeGreaterThan(monthChart(months(12)).height);
  });

  it('keeps dots up to three years and columns no wider than 8 mm', () => {
    expect(monthChart(months(36)).dots).toBe(true);
    expect(monthChart(months(37)).dots).toBe(false);
    expect(monthChart(months(1)).columnWidth).toBeCloseTo(8 * MM);
  });
});

describe('monthRows', () => {
  it('keeps a year or less in one row, as the chart has them', () => {
    expect(monthRows(months(5))).toEqual([months(5)]);
    expect(monthRows(months(12))).toHaveLength(1);
  });

  it('splits more into rows of a year, the last padded to a whole year', () => {
    const rows = monthRows(months(14));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(months(14).slice(0, 12));
    expect(rows[1]).toHaveLength(12);
    expect(rows[1]!.slice(0, 2)).toEqual(months(14).slice(12));
    expect(rows[1]!.slice(2).every((month) => month === null)).toBe(true);
  });
});
