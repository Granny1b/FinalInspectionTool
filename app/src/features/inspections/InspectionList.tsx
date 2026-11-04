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

/*
 * Cells are padded 12 px apart and 16 px from the card's edges, so the seven columns fit a
 * portrait tablet (768 px) and a landscape one beside the sidebar (1024 px) without scrolling.
 * Below `md` they don't fit a phone at all: one "Inspection" column then sums up the number,
 * machine, serial number and date, next to the state and #NOK. Each layout's cells are hidden
 * (display: none) in the other, so only one of them is in the accessibility tree at a time.
 */
const HEAD = 'py-2.5 font-medium whitespace-nowrap';
const CELL = 'py-3.5';
const FIRST = 'pr-3 pl-4';
const MIDDLE = 'px-3';
const LAST = 'pr-4 pl-3';
const WIDE = 'hidden md:table-cell';
const NARROW = 'md:hidden';
/** The state and #NOK beside a summed-up inspection line up with its number, at the top. */
const TOP = 'align-top md:align-middle';
/** The number's link covers the row; the outline shows where keyboard focus is. */
const ROW_LINK = 'font-medium text-ink-900 outline-none after:absolute after:inset-0';

/** Number, machine, serial, model, date, state and #NOK (brief §5.1); the whole row opens it. */
export function InspectionList({ inspections, models }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200 bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
          <tr>
            <th scope="col" className={clsx(HEAD, FIRST, NARROW)}>
              Inspection
            </th>
            <th scope="col" className={clsx(HEAD, FIRST, WIDE)}>
              Number
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Machine
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Serial number
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Model
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Date
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE)}>
              State
            </th>
            <th scope="col" className={clsx(HEAD, LAST, 'text-right')}>
              NOK
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {inspections.map((inspection) => (
            <tr
              key={inspection.id}
              className="relative -outline-offset-2 outline-brand-600 transition-colors hover:bg-ink-50 has-[a:focus-visible]:outline-2"
            >
              <td className={clsx(CELL, FIRST, NARROW)}>
                <Link to={`/inspections/${inspection.id}`} className={ROW_LINK}>
                  {inspection.number}
                </Link>
                <div className="mt-0.5 line-clamp-2 wrap-anywhere">
                  {inspection.machineName ? (
                    <span className="text-ink-900">{inspection.machineName}</span>
                  ) : (
                    <span className="text-ink-500">No machine name</span>
                  )}
                </div>
                {/* Wraps after the dot, before the date; only a narrow phone breaks the serial
                    number, at a hyphen, rather than scroll sideways. */}
                <div className="mt-0.5 text-xs text-ink-500">
                  {`S/N\u00a0${inspection.serialNumber}\u00a0· `}
                  <span className="whitespace-nowrap">{formatCalendarDate(inspection.date)}</span>
                </div>
              </td>
              <td className={clsx(CELL, FIRST, WIDE, 'whitespace-nowrap')}>
                <Link to={`/inspections/${inspection.id}`} className={ROW_LINK}>
                  {inspection.number}
                </Link>
              </td>
              <td className={clsx(CELL, MIDDLE, WIDE, 'max-w-64')}>
                {inspection.machineName ? (
                  <span className="line-clamp-2 text-ink-900">{inspection.machineName}</span>
                ) : (
                  <span className="text-ink-500">No machine name</span>
                )}
              </td>
              <td className={clsx(CELL, MIDDLE, WIDE, 'max-w-48 truncate text-ink-700')}>
                {inspection.serialNumber}
              </td>
              <td className={clsx(CELL, MIDDLE, WIDE, 'whitespace-nowrap text-ink-700')}>
                {modelName(models, inspection.modelCode)}
              </td>
              <td className={clsx(CELL, MIDDLE, WIDE, 'whitespace-nowrap text-ink-700')}>
                {formatCalendarDate(inspection.date)}
              </td>
              <td className={clsx(CELL, MIDDLE, TOP, 'whitespace-nowrap')}>
                <StateBadge state={inspection.state} />
                {inspection.state === 'in_progress' && (
                  <div className="mt-1 text-xs text-ink-500 tabular-nums">
                    {inspection.filled} / {inspection.total} rows
                  </div>
                )}
              </td>
              <td
                className={clsx(
                  CELL,
                  LAST,
                  TOP,
                  'text-right tabular-nums',
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
