import type { Insights } from '@modig/shared';
import { useFitScale } from '../../print/fitScale';
import { formatCount, formatMonthLong, formatMonthShort } from '../format';
import { CHART_GUTTER_MM, MM, monthChart, monthRows, PT } from './chart';

type Month = Insights['perMonth'][number];

/**
 * Deviations per month on paper: an SVG, so it prints as sharp vector lines and real text at any
 * zoom, in black and greys. As on the Insights page, one or two months are
 * columns with their count on top (a line needs three points to show a trend), and from three
 * months on a line with dots. Under it, the numbers: deviations and inspections for each month.
 */
export function PaperMonthChart({ months }: { months: Month[] }) {
  const chart = monthChart(months);
  const { plot } = chart;
  // Drawn afresh at each scale the sheets are fitted to: Chrome kept the text laid out for the
  // first one, so on a phone the axis labels came out twice their size and out of place.
  const scale = useFitScale();
  return (
    <>
      {/* The table below has the numbers for screen readers too. */}
      <svg
        key={scale}
        className="report-chart"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        aria-hidden="true"
        fontSize={7 * PT}
      >
        {chart.ticks.map((tick) => (
          <g key={tick.value}>
            <line
              className={tick.value === 0 ? 'report-chart-axis' : 'report-chart-grid'}
              x1={plot.left}
              x2={plot.right}
              y1={tick.y}
              y2={tick.y}
              strokeWidth={(tick.value === 0 ? 0.25 : 0.15) * MM}
            />
            <text
              className="report-chart-tick"
              x={plot.left - 2.5 * MM}
              // On its gridline: the middle of a digit is about 0.35 em above the baseline.
              y={tick.y + 0.35 * 6.5 * PT}
              textAnchor="end"
              fontSize={6.5 * PT}
            >
              {formatCount(tick.value)}
            </text>
          </g>
        ))}
        {chart.kind === 'columns' ? (
          chart.points.map((point) => (
            <g key={point.month}>
              <rect
                className="report-chart-column"
                x={point.x - chart.columnWidth / 2}
                y={point.y}
                width={chart.columnWidth}
                height={plot.bottom - point.y}
              />
              <text
                className="report-chart-value"
                x={point.x}
                y={point.y - 1.4 * MM}
                textAnchor="middle"
                fontSize={7.5 * PT}
              >
                {formatCount(point.deviations)}
              </text>
            </g>
          ))
        ) : (
          <>
            <polyline
              className="report-chart-line"
              points={chart.points.map((point) => `${point.x},${point.y}`).join(' ')}
              strokeWidth={0.5 * MM}
            />
            {chart.dots &&
              chart.points.map((point) => (
                <circle
                  key={point.month}
                  className="report-chart-dot"
                  cx={point.x}
                  cy={point.y}
                  r={0.9 * MM}
                  strokeWidth={0.3 * MM}
                />
              ))}
          </>
        )}
        {chart.points
          .filter((point) => point.labelled)
          .map((point) => (
            <text
              key={point.month}
              className="report-chart-month"
              x={point.x}
              y={chart.labelY}
              textAnchor="middle"
            >
              {formatMonthShort(point.month)}
            </text>
          ))}
      </svg>
      {monthRows(months).map((row, index) => (
        <MonthTable key={row[0]?.month ?? index} months={row} />
      ))}
    </>
  );
}

/** A row of months under the chart, its label column as wide as the chart's axis gutter. */
function MonthTable({ months }: { months: (Month | null)[] }) {
  return (
    <table className="report-months">
      <colgroup>
        <col style={{ width: `${CHART_GUTTER_MM}mm` }} />
        {months.map((_, index) => (
          <col key={index} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <td />
          {months.map((month, index) =>
            month ? (
              <th key={month.month} scope="col">
                {formatMonthLong(month.month)}
              </th>
            ) : (
              <td key={index} data-pad="" />
            ),
          )}
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Deviations</th>
          {months.map((month, index) =>
            month ? (
              <td key={month.month}>{formatCount(month.deviations)}</td>
            ) : (
              <td key={index} data-pad="" />
            ),
          )}
        </tr>
        <tr>
          <th scope="row">Inspections</th>
          {months.map((month, index) =>
            month ? (
              <td key={month.month}>{formatCount(month.inspections)}</td>
            ) : (
              <td key={index} data-pad="" />
            ),
          )}
        </tr>
      </tbody>
    </table>
  );
}
