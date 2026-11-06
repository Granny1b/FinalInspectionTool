import type { MachineModel, MachineProgress, MachineSummary } from '@modig/shared';
import clsx from 'clsx';
import { Link } from 'react-router';
import { modelName } from '../../lib/useSettings';
import { MachineStatusBadge } from './MachineStatus';
import { machineHref } from './model';

type Props = { machines: MachineSummary[]; models: MachineModel[] | undefined };

/*
 * As the inspections list: cells 12 px apart and 16 px from the card's edges, so the seven columns
 * fit a portrait tablet. Below `md` one "Machine" column sums up the Machine ID, model, serial
 * number and status next to the open deviations. Each layout's cells are hidden in the other, so
 * only one of them is in the accessibility tree at a time.
 */
const HEAD = 'py-2.5 font-medium whitespace-nowrap';
const CELL = 'py-3.5';
const FIRST = 'pr-3 pl-4';
const MIDDLE = 'px-3';
const LAST = 'pr-4 pl-3';
const WIDE = 'hidden md:table-cell';
const NARROW = 'md:hidden';
const TOP = 'align-top md:align-middle';
/** The Machine ID's link covers the row; the outline shows where keyboard focus is. */
const ROW_LINK = 'font-medium text-ink-900 outline-none after:absolute after:inset-0';

/**
 * Machine ID, serial number, model, status, quality checks finalised, final inspection and open
 * deviations; the whole row opens the machine.
 */
export function MachineList({ machines, models }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink-200 bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-ink-200 bg-ink-50 text-xs text-ink-500">
          <tr>
            <th scope="col" className={clsx(HEAD, FIRST, NARROW)}>
              Machine
            </th>
            <th scope="col" className={clsx(HEAD, FIRST, WIDE)}>
              Machine ID
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Serial number
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Model
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Status
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Quality checks
            </th>
            <th scope="col" className={clsx(HEAD, MIDDLE, WIDE)}>
              Final inspection
            </th>
            <th scope="col" className={clsx(HEAD, LAST, 'text-right')}>
              <abbr title="Open deviations" className="no-underline">
                Open
              </abbr>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {machines.map((machine) => {
            const href = machineHref(machine.id);
            const model = modelName(models, machine.modelCode);
            const { open } = machine.progress.deviations;
            return (
              <tr
                key={machine.id}
                className="relative -outline-offset-2 outline-brand-600 transition-colors hover:bg-ink-50 has-[a:focus-visible]:outline-2"
              >
                <td className={clsx(CELL, FIRST, NARROW)}>
                  <Link to={href} className={clsx(ROW_LINK, 'line-clamp-2 wrap-anywhere')}>
                    {machine.machineName}
                  </Link>
                  <div className="mt-0.5 text-xs text-ink-500">
                    {`${model}\u00a0· S/N\u00a0${machine.serialNumber}`}
                  </div>
                  <div className="mt-1.5">
                    <MachineStatusBadge progress={machine.progress} />
                  </div>
                </td>
                <td className={clsx(CELL, FIRST, WIDE, 'max-w-56')}>
                  <Link to={href} className={clsx(ROW_LINK, 'line-clamp-2 wrap-anywhere')}>
                    {machine.machineName}
                  </Link>
                </td>
                <td className={clsx(CELL, MIDDLE, WIDE, 'max-w-44 truncate text-ink-700')}>
                  {machine.serialNumber}
                </td>
                <td className={clsx(CELL, MIDDLE, WIDE, 'whitespace-nowrap text-ink-700')}>
                  {model}
                </td>
                <td className={clsx(CELL, MIDDLE, WIDE)}>
                  <MachineStatusBadge progress={machine.progress} />
                </td>
                <td className={clsx(CELL, MIDDLE, WIDE)}>
                  <QualityProgress progress={machine.progress} />
                </td>
                <td className={clsx(CELL, MIDDLE, WIDE, 'whitespace-nowrap text-ink-700')}>
                  {finalText(machine.progress)}
                </td>
                <td
                  className={clsx(
                    CELL,
                    LAST,
                    TOP,
                    'text-right tabular-nums',
                    open > 0 ? 'font-semibold text-nok-fg' : 'text-ink-500',
                  )}
                >
                  {open}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "3 / 5 finalised" with a bar; "—" without quality checks. */
function QualityProgress({ progress }: { progress: MachineProgress }) {
  const { total, finalised } = progress.quality;
  if (total === 0) return <span className="text-ink-500">—</span>;
  return (
    <div className="flex items-center gap-2.5 whitespace-nowrap">
      <div aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-200">
        <div
          className={clsx('h-full rounded-full', finalised === total ? 'bg-ok-fg' : 'bg-brand-600')}
          style={{ width: `${(finalised / total) * 100}%` }}
        />
      </div>
      <span className="text-ink-700 tabular-nums">
        {finalised} / {total}
      </span>
    </div>
  );
}

/** The final inspection's state in a word; "Not added" when the machine has none yet. */
function finalText({ final }: MachineProgress): string {
  if (final.total === 0) return 'Not added';
  if (final.finalised === final.total) return 'Finalised';
  return final.started > 0 ? 'In progress' : 'Not started';
}
