import { deviationsPerInspection, firstPassRate, type Insights } from '@modig/shared';
import { formatCount, formatDecimal, formatPercent, plural } from './format';

/**
 * The headline numbers (brief §5.5): inspections, deviations, deviations per machine and the
 * first-pass rate, each with a line saying what it counts.
 */
export function KpiTiles({ insights }: { insights: Insights }) {
  const { finalised, inProgress } = insights.inspections;
  const perInspection = deviationsPerInspection(insights);
  const rate = firstPassRate(insights.rows);
  const checked = insights.rows.ok + insights.rows.nok;
  return (
    // Two to a row even on a phone, where one each took half the screen for four short numbers;
    // as far apart as the panels under them from sm, so the columns line up. Each tile spans
    // three rows of the grid (label, value, detail), so a label that wraps keeps the values
    // beside it level.
    <dl className="grid grid-cols-2 gap-3 sm:gap-6 xl:grid-cols-4">
      {inProgress > 0 ? (
        <Tile
          label="Inspections"
          value={formatCount(finalised + inProgress)}
          detail={`${formatCount(finalised)} finalised · ${formatCount(inProgress)} in progress`}
        />
      ) : (
        <Tile
          label="Inspections finalised"
          value={formatCount(finalised)}
          detail="Machines inspected in the period"
        />
      )}
      <Tile
        label="Deviations"
        value={formatCount(insights.deviations)}
        detail="NOK rows and extra deviations"
      />
      <Tile
        label="Deviations per machine"
        value={perInspection === null ? '–' : formatDecimal(perInspection)}
        detail="Average per inspection"
      />
      <Tile
        label="First-pass rate"
        value={rate === null ? '–' : formatPercent(rate, 1)}
        detail={
          rate === null
            ? 'No rows checked yet'
            : `${formatCount(insights.rows.ok)} of ${plural(checked, 'checked row')} OK (N/A not counted)`
        }
      />
    </dl>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    // No gap between its own three rows: the label, value and detail are spaced by their margins.
    <div className="row-span-3 grid grid-rows-subgrid gap-y-0 rounded-lg border border-ink-200 bg-surface px-4 py-3 sm:px-5 sm:py-4">
      <dt className="text-sm text-ink-500">{label}</dt>
      {/* Proportional figures: a big standalone number looks loose with tabular ones. */}
      <dd className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
        {value}
      </dd>
      <dd className="mt-1 text-xs text-ink-500">{detail}</dd>
    </div>
  );
}
