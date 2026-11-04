/**
 * Deviations per month (brief §5.5, line). Loaded only when Insights opens (the page imports it
 * lazily), so Recharts never weighs on the pages inspectors use.
 */
import type { Insights } from '@modig/shared';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts';
import { countTicks } from './axis';
import { formatCount, formatMonthLong, formatMonthShort, plural } from './format';

type Month = Insights['perMonth'][number];

/**
 * Below this many months a line has nothing to join (one month is a lone dot on the grid), so
 * the months are columns, each with its count on the cap. From three on, the line shows the trend.
 */
const LINE_FROM = 3;

/**
 * Recharts draws with its own default colours; the classes below restyle its parts from the
 * theme tokens (CSS beats SVG presentation attributes): a 2 px brand line, dots ringed in the
 * card's colour, brand columns with their count in ink above them, a hairline grid and muted
 * axis text.
 */
const CHART = [
  '[&_.recharts-line-curve]:stroke-brand-600',
  '[&_.recharts-line-dot]:fill-brand-600 [&_.recharts-line-dot]:stroke-surface',
  '[&_.recharts-active-dot_circle]:fill-brand-600 [&_.recharts-active-dot_circle]:stroke-surface',
  '[&_.recharts-bar-rectangle_.recharts-rectangle]:fill-brand-600',
  '[&_.recharts-label-list_.recharts-label]:fill-ink-700 [&_.recharts-label-list_.recharts-label]:text-xs [&_.recharts-label-list_.recharts-label]:font-medium',
  '[&_.recharts-cartesian-grid_line]:stroke-ink-200',
  '[&_.recharts-cartesian-axis-line]:stroke-ink-300 [&_.recharts-cartesian-axis-tick-line]:stroke-ink-300',
  '[&_.recharts-cartesian-axis-tick-value]:fill-ink-500 [&_.recharts-cartesian-axis-tick-value]:text-xs',
  '[&_.recharts-curve.recharts-tooltip-cursor]:stroke-ink-300',
  '[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-ink-100',
].join(' ');

const MARGIN = { top: 8, right: 12, bottom: 0, left: -12 };

export default function MonthlyChart({ months }: { months: Month[] }) {
  const ticks = countTicks(Math.max(0, ...months.map((month) => month.deviations)));
  // The same axes for both forms (spread, as Recharts finds its parts among its chart's children).
  const xAxis = {
    dataKey: 'month',
    tickFormatter: formatMonthShort,
    tickMargin: 8,
    minTickGap: 16,
    interval: 'preserveStartEnd',
  } as const;
  const yAxis = {
    allowDecimals: false,
    domain: [0, ticks.at(-1)!],
    ticks,
    tickLine: false,
    axisLine: false,
    width: 48,
  };
  return (
    <>
      <div className={CHART}>
        {/* The chart's height includes the axis band, so nothing scrolls inside the card. */}
        <ResponsiveContainer width="100%" height={240}>
          {months.length < LINE_FROM ? (
            <BarChart data={months} margin={MARGIN}>
              <CartesianGrid vertical={false} />
              <XAxis {...xAxis} />
              <YAxis {...yAxis} />
              <Tooltip content={MonthTooltip} isAnimationActive={false} />
              {/* Thin, rounded at the end that carries the value, square at the baseline. */}
              <Bar
                dataKey="deviations"
                name="Deviations"
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                <LabelList dataKey="deviations" position="top" offset={6} />
              </Bar>
            </BarChart>
          ) : (
            <LineChart data={months} margin={MARGIN}>
              <CartesianGrid vertical={false} />
              <XAxis {...xAxis} />
              <YAxis {...yAxis} />
              <Tooltip content={MonthTooltip} isAnimationActive={false} />
              <Line
                type="linear"
                dataKey="deviations"
                name="Deviations"
                strokeWidth={2}
                dot={months.length <= 36 ? { r: 4, strokeWidth: 2 } : false}
                activeDot={{ r: 5, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {/* The numbers behind the chart, for screen readers. */}
      <table className="sr-only">
        <caption>Deviations per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Deviations</th>
            <th scope="col">Inspections</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}>
              <th scope="row">{formatMonthLong(month.month)}</th>
              <td>{month.deviations}</td>
              <td>{month.inspections}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * The value leads; the month and the number of inspections follow. An overlay, lifted off the
 * card like a menu.
 */
function MonthTooltip({ active, payload }: TooltipContentProps<TooltipValueType, number | string>) {
  const month = payload?.[0]?.payload as Month | undefined;
  if (!active || !month) return null;
  return (
    <div className="rounded-md border border-ink-200 bg-overlay px-3 py-2 text-xs shadow-md dark:border-ink-300">
      <p className="text-sm font-semibold text-ink-900">{plural(month.deviations, 'deviation')}</p>
      <p className="mt-0.5 text-ink-500">
        {formatMonthLong(month.month)} · {formatCount(month.inspections)}{' '}
        {month.inspections === 1 ? 'inspection' : 'inspections'}
      </p>
    </div>
  );
}
