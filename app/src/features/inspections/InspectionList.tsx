import type { InspectionKind, InspectionSummary, MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { Link } from 'react-router';
import { modelName } from '../../lib/useSettings';
import { formatCalendarDate } from './dates';
import { inspectionHref } from './listFilter';
import { StateBadge } from './StateBadge';

type Props = {
  /** Final inspections, or quality checks done (which have a check where machines have a name). */
  kind?: InspectionKind;
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

/**
 * Number, Machine ID, serial, model, date, state and #NOK (brief §5.1); the whole row opens it. A
 * quality check's list has its title where the model was, and the model under the Machine ID:
 * Number, Machine ID, Quality check, Serial number, Date, State, NOK.
 */
export function InspectionList({ kind = 'final', inspections, models }: Props) {
  if (kind === 'quality') return <QualityCheckList checks={inspections} models={models} />;
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
              Machine ID
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
                <Link to={inspectionHref('final', inspection.id)} className={ROW_LINK}>
                  {inspection.number}
                </Link>
                <div className="mt-0.5 line-clamp-2 wrap-anywhere">
                  {inspection.machineName ? (
                    <span className="text-ink-900">{inspection.machineName}</span>
                  ) : (
                    <span className="text-ink-500">No Machine ID</span>
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
                <Link to={inspectionHref('final', inspection.id)} className={ROW_LINK}>
                  {inspection.number}
                </Link>
              </td>
              <td className={clsx(CELL, MIDDLE, WIDE, 'max-w-64')}>
                {inspection.machineName ? (
                  <span className="line-clamp-2 text-ink-900">{inspection.machineName}</span>
                ) : (
                  <span className="text-ink-500">No Machine ID</span>
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

type QualityProps = { checks: InspectionSummary[]; models: MachineModel[] | undefined };

/**
 * The quality checks done: the same table, with which check it was. A machine has several, so
 * the check's title gets the model's column, and the model goes under the Machine ID.
 */
function QualityCheckList({ checks, models }: QualityProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200 bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
          <tr>
            <th scope="col" className={clsx(HEAD, FIRST, NARROW)}>
              Quality check
            </th>
            <th scope="col" className={clsx(HEAD, FIRST, WIDE)}>
              Number
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Machine ID
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Quality check
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Serial number
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
          {checks.map((check) => {
            const href = inspectionHref('quality', check.id);
            const model = modelName(models, check.modelCode);
            return (
              <tr
                key={check.id}
                className="relative -outline-offset-2 outline-brand-600 transition-colors hover:bg-ink-50 has-[a:focus-visible]:outline-2"
              >
                <td className={clsx(CELL, FIRST, NARROW)}>
                  <Link to={href} className={ROW_LINK}>
                    {check.number}
                  </Link>
                  <div className="mt-0.5 line-clamp-2 wrap-anywhere">
                    <span className="text-ink-900">{check.machineName || '—'}</span>
                    <span className="text-ink-500"> · </span>
                    <span className="text-ink-900">{check.templateName}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-ink-500">
                    {`${model}\u00a0· S/N\u00a0${check.serialNumber}\u00a0· `}
                    <span className="whitespace-nowrap">{formatCalendarDate(check.date)}</span>
                  </div>
                </td>
                <td className={clsx(CELL, FIRST, WIDE, 'whitespace-nowrap')}>
                  <Link to={href} className={ROW_LINK}>
                    {check.number}
                  </Link>
                </td>
                <td className={clsx(CELL, MIDDLE, WIDE, 'max-w-56')}>
                  {/* An older check, started before quality checks had one, has none. */}
                  <span className="line-clamp-2 text-ink-900">{check.machineName || '—'}</span>
                  <span className="block text-xs whitespace-nowrap text-ink-500">{model}</span>
                </td>
                <td className={clsx(CELL, MIDDLE, WIDE, 'max-w-64')}>
                  <span className="line-clamp-2 text-ink-900">{check.templateName}</span>
                </td>
                <td className={clsx(CELL, MIDDLE, WIDE, 'max-w-48 truncate text-ink-700')}>
                  {check.serialNumber}
                </td>
                <td className={clsx(CELL, MIDDLE, WIDE, 'whitespace-nowrap text-ink-700')}>
                  {formatCalendarDate(check.date)}
                </td>
                <td className={clsx(CELL, MIDDLE, TOP, 'whitespace-nowrap')}>
                  <StateBadge state={check.state} />
                  {check.state === 'in_progress' && (
                    <div className="mt-1 text-xs text-ink-500 tabular-nums">
                      {check.filled} / {check.total} rows
                    </div>
                  )}
                </td>
                <td
                  className={clsx(
                    CELL,
                    LAST,
                    TOP,
                    'text-right tabular-nums',
                    check.nokCount > 0 ? 'font-semibold text-nok-fg' : 'text-ink-500',
                  )}
                >
                  {check.nokCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
