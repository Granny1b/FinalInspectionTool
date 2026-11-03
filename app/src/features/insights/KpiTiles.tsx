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
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
    <div className="flex flex-col rounded-lg border border-ink-200 bg-surface px-5 py-4">
      <dt className="text-sm text-ink-500">{label}</dt>
      {/* Proportional figures: a big standalone number looks loose with tabular ones. */}
      <dd className="mt-1.5 text-3xl font-semibold tracking-tight text-ink-900">{value}</dd>
      <dd className="mt-1 text-xs text-ink-500">{detail}</dd>
    </div>
  );
}
