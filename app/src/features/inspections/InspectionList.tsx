import type { InspectionSummary, MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { Link } from 'react-router';
import { modelName } from '../../lib/useSettings';
import { formatCalendarDate } from './dates';
import { StateBadge } from './StateBadge';

type Props = {
  inspections: InspectionSummary[];
  models: MachineModel[] | undefined;
};

const HEAD = 'px-4 py-2.5 font-medium whitespace-nowrap';

/** Number, machine, serial, model, date, state and #NOK (brief §5.1); the whole row opens it. */
export function InspectionList({ inspections, models }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200 bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
          <tr>
            <th scope="col" className={HEAD}>
              Number
            </th>
            <th scope="col" className={HEAD}>
              Machine
            </th>
            <th scope="col" className={HEAD}>
              Serial number
            </th>
            <th scope="col" className={HEAD}>
              Model
            </th>
            <th scope="col" className={HEAD}>
              Date
            </th>
            <th scope="col" className={HEAD}>
              State
            </th>
            <th scope="col" className={`${HEAD} text-right`}>
              NOK
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {inspections.map((inspection) => (
            <tr
              key={inspection.id}
              // The number's link covers the row; the outline shows where keyboard focus is.
              className="relative -outline-offset-2 outline-brand-600 transition-colors hover:bg-ink-50 has-[a:focus-visible]:outline-2"
            >
              <td className="px-4 py-3.5 whitespace-nowrap">
                <Link
                  to={`/inspections/${inspection.id}`}
                  className="font-medium text-ink-900 outline-none after:absolute after:inset-0"
                >
                  {inspection.number}
                </Link>
              </td>
              <td className="max-w-64 px-4 py-3.5">
                {inspection.machineName ? (
                  <span className="line-clamp-2 text-ink-900">{inspection.machineName}</span>
                ) : (
                  <span className="text-ink-500">No machine name</span>
                )}
              </td>
              <td className="max-w-48 truncate px-4 py-3.5 text-ink-700">
                {inspection.serialNumber}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-ink-700">
                {modelName(models, inspection.modelCode)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-ink-700">
                {formatCalendarDate(inspection.date)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                <StateBadge state={inspection.state} />
                {inspection.state === 'in_progress' && (
                  <div className="mt-1 text-xs text-ink-500 tabular-nums">
                    {inspection.filled} / {inspection.total} rows
                  </div>
                )}
              </td>
              <td
                className={clsx(
                  'px-4 py-3.5 text-right tabular-nums',
                  inspection.nokCount > 0 ? 'font-semibold text-nok-fg' : 'text-ink-500',
                )}
              >
                {inspection.nokCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
