/**
 * The geometry of the report's month chart: an A4 sheet's content is 185 mm wide (print.css:
 * 210 mm less the 12 mm margins and the edge inset). Sizes are chosen in millimetres and points,
 * as on paper, and drawn in CSS pixels (the SVG's user units, 96 to the inch). Not in millimetres:
 * text a few user units high (7 pt is 2.5 mm) came out several times too large in Chrome when the
 * sheet was scaled down to fit a phone. Worked out here, so the component only draws, and tests
 * can check the choices it makes.
 */
import type { Insights } from '@modig/shared';
import { countTicks } from '../axis';

type Month = Insights['perMonth'][number];

/** CSS pixels to a millimetre and to a point. */
export const MM = 96 / 25.4;
export const PT = 96 / 72;

/** The chart's width in millimetres: the sheet's content width. */
const WIDTH_MM = 185;

/**
 * Room on the left for the count axis' labels, in millimetres. The month table under the chart
 * has a label column exactly this wide, so with one row of months its columns sit under the
 * chart's.
 */
export const CHART_GUTTER_MM = 20;

/** Months to a row of the month table: a year. */
export const MONTHS_PER_ROW = 12;

const PLOT_TOP = 5 * MM;
const PLOT_HEIGHT = 42 * MM;
/** Under the plot: the month labels, when the chart writes them itself. */
const AXIS_BAND = 7 * MM;
/** Under the plot without them: the month table's header follows straight away. */
const NO_AXIS_BAND = 1 * MM;
/** Below this many months a line has nothing to join: columns, as on the Insights page. */
const LINE_FROM = 3;
/** Past this many months the dots would touch; the line alone shows the trend (as on the page). */
const DOTS_UP_TO = 36;
/** What a month label ("2026-10" at 7 pt) needs, with air on both sides. */
const LABEL_ROOM = 12 * MM;
/** Columns as wide as the page's (24 px) look like a print's: about 8 mm on paper. */
const MAX_COLUMN = 8 * MM;

export type ChartPoint = Month & {
  /** The month's centre, and its count's height. */
  x: number;
  y: number;
  /** Its month is written under the axis (with many months, only every few). */
  labelled: boolean;
};

export type ChartLayout = {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  ticks: { value: number; y: number }[];
  points: ChartPoint[];
  kind: 'columns' | 'line';
  dots: boolean;
  columnWidth: number;
  /**
   * The chart writes the months under its axis. Not for a year or less: the month table's header
   * row, right under the chart and in line with it, names them.
   */
  axisLabels: boolean;
  /** Where the month labels' baseline is. */
  labelY: number;
};

export function monthChart(months: readonly Month[]): ChartLayout {
  const plot = {
    left: CHART_GUTTER_MM * MM,
    right: WIDTH_MM * MM,
    top: PLOT_TOP,
    bottom: PLOT_TOP + PLOT_HEIGHT,
  };
  const slot = (plot.right - plot.left) / Math.max(1, months.length);
  const ticks = countTicks(Math.max(0, ...months.map((month) => month.deviations)));
  const top = ticks.at(-1)!;
  const y = (value: number) => plot.bottom - (value / top) * PLOT_HEIGHT;
  // Every month's label when they fit; else every second, third… counted back from the latest
  // month, which is always labelled.
  const every = Math.ceil(LABEL_ROOM / slot);
  const axisLabels = months.length > MONTHS_PER_ROW;
  return {
    width: WIDTH_MM * MM,
    height: plot.bottom + (axisLabels ? AXIS_BAND : NO_AXIS_BAND),
    plot,
    ticks: ticks.map((value) => ({ value, y: y(value) })),
    points: months.map((month, index) => ({
      ...month,
      x: plot.left + slot * (index + 0.5),
      y: y(month.deviations),
      labelled: axisLabels && (months.length - 1 - index) % every === 0,
    })),
    kind: months.length < LINE_FROM ? 'columns' : 'line',
    dots: months.length <= DOTS_UP_TO,
    columnWidth: Math.min(MAX_COLUMN, slot / 2),
    axisLabels,
    labelY: plot.bottom + 4.2 * MM,
  };
}

/**
 * The months in rows of a year for the table under the chart, each row padded to a whole year
 * so its columns are as wide as the first row's. One row of fewer months is not padded: its
 * columns then line up with the chart's.
 */
export function monthRows(months: readonly Month[]): (Month | null)[][] {
  if (months.length <= MONTHS_PER_ROW) return [[...months]];
  const rows: (Month | null)[][] = [];
  for (let start = 0; start < months.length; start += MONTHS_PER_ROW) {
    const row: (Month | null)[] = months.slice(start, start + MONTHS_PER_ROW);
    while (row.length < MONTHS_PER_ROW) row.push(null);
    rows.push(row);
  }
  return rows;
}
