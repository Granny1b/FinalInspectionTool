/**
 * Deviations per month (brief §5.5, line). Loaded only when Insights opens (the page imports it
 * lazily), so Recharts never weighs on the pages inspectors use.
 */
import type { Insights } from '@modig/shared';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts';
import { formatCount, formatMonthLong, formatMonthShort, plural } from './format';

type Month = Insights['perMonth'][number];

/**
 * Recharts draws with its own default colours; the classes below restyle its parts from the
 * theme tokens (CSS beats SVG presentation attributes): a 2 px brand line, dots ringed in the
 * card's colour, a hairline grid and muted axis text.
 */
const CHART = [
  '[&_.recharts-line-curve]:stroke-brand-600',
  '[&_.recharts-line-dot]:fill-brand-600 [&_.recharts-line-dot]:stroke-surface',
  '[&_.recharts-active-dot_circle]:fill-brand-600 [&_.recharts-active-dot_circle]:stroke-surface',
  '[&_.recharts-cartesian-grid_line]:stroke-ink-200',
  '[&_.recharts-cartesian-axis-line]:stroke-ink-300 [&_.recharts-cartesian-axis-tick-line]:stroke-ink-300',
  '[&_.recharts-cartesian-axis-tick-value]:fill-ink-500 [&_.recharts-cartesian-axis-tick-value]:text-xs',
  '[&_.recharts-tooltip-cursor]:stroke-ink-300',
].join(' ');

export default function MonthlyChart({ months }: { months: Month[] }) {
  return (
    <>
      <div className={CHART}>
        {/* The chart's height includes the axis band, so nothing scrolls inside the card. */}
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={months} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthShort}
              tickMargin={8}
              minTickGap={16}
              interval="preserveStartEnd"
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={48} />
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
        </ResponsiveContainer>
      </div>
      {/* The numbers behind the line, for screen readers. */}
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

/** The value leads; the month and the number of inspections follow. */
function MonthTooltip({ active, payload }: TooltipContentProps<TooltipValueType, number | string>) {
  const month = payload?.[0]?.payload as Month | undefined;
  if (!active || !month) return null;
  return (
    <div className="rounded-md border border-ink-200 bg-surface px-3 py-2 text-xs shadow-md">
      <p className="text-sm font-semibold text-ink-900">{plural(month.deviations, 'deviation')}</p>
      <p className="mt-0.5 text-ink-500">
        {formatMonthLong(month.month)} · {formatCount(month.inspections)}{' '}
        {month.inspections === 1 ? 'inspection' : 'inspections'}
      </p>
    </div>
  );
}
