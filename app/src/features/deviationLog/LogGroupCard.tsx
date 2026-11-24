import {
  daysBetween,
  deviationDescription,
  deviationLogId,
  isOverdue,
  type DeviationLogEntry,
  type FollowUpRequest,
  type InspectionKind,
  type MachineModel,
} from '@modig/shared';
import clsx from 'clsx';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { modelName } from '../../lib/useSettings';
import { machineHref } from '../machines/model';
import { SeverityBadge } from '../inspections/DeviationCard';
import { FollowUpActions, StatusPill } from './FollowUpActions';
import { deviationsTabHref, type LogGroup } from './model';

type Props = {
  kind: InspectionKind;
  group: LogGroup;
  models: MachineModel[] | undefined;
  today: string;
  /** `{inspectionId}/{key}` of the deviations being saved. */
  pending: ReadonlySet<string>;
  onFollowUp: (entry: DeviationLogEntry, request: FollowUpRequest) => void;
};

/**
 * One machine in the log: its Machine ID and serial number (a quality check's title too), its
 * model and the inspection its deviations come from, how many are open and closed, then the
 * deviations. A table where the card is wide enough (a desktop); one card per deviation on a
 * tablet or a phone, where seven columns don't fit. Each layout is hidden in the other, so only
 * one of them is in the accessibility tree at a time.
 */
export function LogGroupCard({ kind, group, models, today, pending, onFollowUp }: Props) {
  const titleId = useId();
  const total = group.open + group.closed;
  const closedShare = total > 0 ? group.closed / total : 0;
  return (
    <section
      aria-labelledby={titleId}
      className="@container overflow-hidden rounded-lg border border-ink-200 bg-surface"
    >
      {/* Not a <header>: it isn't the page's. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 pt-4 pb-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold wrap-break-word text-ink-900">
            {group.machineRef ? (
              // The machine's page: all its checks, and where it is.
              <Link to={machineHref(group.machineRef)} className="hover:underline">
                {group.machineName}
              </Link>
            ) : (
              group.machineName.trim() || (
                <span className="font-normal text-ink-500">No Machine ID</span>
              )
            )}
            {/* A space of its own: the heading names the region, "Magellan#1 S/N MG-0001". */}{' '}
            <span className="ml-1 text-sm font-normal whitespace-nowrap text-ink-500">
              S/N {group.serialNumber.trim() || '—'}
            </span>
          </h2>
          {/* Spaced, not separated by dots: on a phone a dot would dangle at a line's start. */}
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-500">
            {group.checkName && <span className="text-ink-700">{group.checkName}</span>}
            <span>{modelName(models, group.modelCode)}</span>
          </p>
          {/* Where its deviations come from, a line each: quiet, as it is only for looking up. */}
          <ul className="mt-2 space-y-0.5 text-xs text-ink-500">
            {group.inspections.map((inspection) => (
              <li key={inspection.id} className="flex flex-wrap items-baseline gap-x-2.5">
                <Link
                  to={deviationsTabHref(kind, inspection.id)}
                  className="font-medium text-ink-700 tabular-nums underline-offset-2 hover:text-brand-700 hover:underline"
                >
                  {inspection.number}
                </Link>
                {inspection.checkName && <span>{inspection.checkName}</span>}
                <span className="tabular-nums">{inspection.date}</span>
                {!inspection.finalised && <span>In progress</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="w-full shrink-0 sm:w-44">
          <p className="text-xs text-ink-500 tabular-nums sm:text-right">
            <span className={clsx(group.open > 0 && 'font-medium text-ink-800')}>
              {group.open} open
            </span>
            {' · '}
            {group.closed} closed
          </p>
          {/* The words say it; the bar shows it at a glance. */}
          <div aria-hidden="true" className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-ok-fg"
              style={{ width: `${Math.round(closedShare * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <table className="hidden w-full border-t border-ink-100 text-left text-sm @min-[58rem]:table">
        {/* Small quiet labels, no fill: the rows are what is read. */}
        <thead className="text-[0.6875rem] tracking-wide text-ink-500 uppercase">
          <tr>
            <th scope="col" className="pt-3 pr-3 pb-1 pl-5 font-medium">
              Deviation
            </th>
            <th scope="col" className="w-28 px-3 pt-3 pb-1 font-medium">
              Responsible
            </th>
            <th scope="col" className="w-32 px-3 pt-3 pb-1 font-medium">
              Category
            </th>
            <th scope="col" className="w-28 px-3 pt-3 pb-1 font-medium">
              Found
            </th>
            <th scope="col" className="w-34 px-3 pt-3 pb-1 font-medium">
              Status
            </th>
            {/* Room for Edit and Reopen… side by side. */}
            <th scope="col" className="w-48 pt-3 pr-5 pb-1 pl-3 font-medium">
              <span className="sr-only">Follow-up</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {group.entries.map((entry) => (
            <tr key={entry.key} className="align-top">
              <td className="py-3.5 pr-3 pl-5">
                <DeviationText kind={kind} entry={entry} />
              </td>
              <td className="px-3 py-3.5 text-[0.8125rem] wrap-break-word text-ink-600">
                {entry.resp || '—'}
              </td>
              <td className="px-3 py-3.5 text-[0.8125rem] wrap-break-word text-ink-600">
                {entry.category || '—'}
              </td>
              <td className="px-3 py-3.5">
                <Found entry={entry} today={today} />
              </td>
              <td className="px-3 py-3.5">
                <StatusPill status={entry.status} />
                <Closed entry={entry} stacked className="mt-1.5" />
              </td>
              <td className="py-3 pr-5 pl-3">
                <Actions
                  entry={entry}
                  pending={pending}
                  onFollowUp={onFollowUp}
                  className="flex-nowrap justify-end"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-ink-100 text-sm @min-[58rem]:hidden">
        {group.entries.map((entry) => (
          <li key={entry.key} className="px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-64">
                <DeviationText kind={kind} entry={entry} />
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <Meta label="Responsible">{entry.resp || '—'}</Meta>
                  <Meta label="Category">{entry.category || '—'}</Meta>
                  <Meta label="Found">
                    <Found entry={entry} today={today} inline />
                  </Meta>
                </dl>
              </div>
              {/* Beside the text from a small tablet; under it, across, on a phone. */}
              <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 @min-[30rem]:w-auto @min-[30rem]:max-w-52 @min-[30rem]:flex-col @min-[30rem]:items-end">
                <StatusPill status={entry.status} />
                <Closed entry={entry} className="@min-[30rem]:text-right" />
                <Actions
                  entry={entry}
                  pending={pending}
                  onFollowUp={onFollowUp}
                  className="mt-1.5 w-full @min-[30rem]:w-auto @min-[30rem]:justify-end"
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The ID (a link to the deviation on its inspection's Deviations tab) and severity, what it is
 * about, its comment and what was done.
 */
function DeviationText({ kind, entry }: { kind: InspectionKind; entry: DeviationLogEntry }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          to={deviationsTabHref(kind, entry.inspectionId, entry.key)}
          className="text-xs text-ink-500 tabular-nums underline-offset-2 hover:text-brand-700 hover:underline"
        >
          {deviationLogId(entry)}
        </Link>
        <SeverityBadge severity={entry.severity} className="h-5 px-2 font-medium ring-0" />
      </div>
      <p className="mt-1.5 leading-5 font-medium wrap-break-word text-ink-900">
        {deviationDescription(entry) || <span className="font-normal text-ink-500">No text</span>}
      </p>
      {entry.comment && (
        <p className="mt-0.5 text-[0.8125rem] leading-5 wrap-break-word whitespace-pre-line text-ink-500">
          {entry.comment}
        </p>
      )}
      {entry.action && (
        <p className="mt-1.5 leading-5 wrap-break-word whitespace-pre-line text-ink-700">
          <span className="font-medium text-ink-500">Action: </span>
          {entry.action}
        </p>
      )}
    </div>
  );
}

/** The day it was found; while open, how long ago, in red once it is overdue. */
function Found({
  entry,
  today,
  inline = false,
}: {
  entry: DeviationLogEntry;
  today: string;
  inline?: boolean;
}) {
  const days = daysBetween(entry.foundOn, today);
  const overdue = isOverdue(entry, today);
  return (
    <>
      <span className="text-[0.8125rem] whitespace-nowrap text-ink-600 tabular-nums">
        {entry.foundOn}
      </span>
      {entry.status === 'open' && days > 0 && (
        <span
          className={clsx(
            'text-xs tabular-nums',
            inline ? 'ml-1.5' : 'mt-0.5 block',
            overdue ? 'font-semibold text-nok-fg' : 'text-ink-500',
          )}
        >
          {days === 1 ? '1 day open' : `${days} days open`}
        </span>
      )}
    </>
  );
}

/** When and by whom it was closed: on two lines in the table's narrow column, else on one. */
function Closed({
  entry,
  stacked = false,
  className,
}: {
  entry: DeviationLogEntry;
  stacked?: boolean;
  className?: string;
}) {
  if (entry.status !== 'closed' || !(entry.closedOn || entry.closedBy)) return null;
  return (
    <p className={clsx('text-xs text-ink-600', className)}>
      <span className="sr-only">Closed </span>
      <span className="whitespace-nowrap tabular-nums">{entry.closedOn}</span>
      {entry.closedBy && (
        <span className={clsx('wrap-break-word text-ink-500', stacked && 'block')}>
          {!stacked && entry.closedOn && ' · '}
          {entry.closedBy}
        </span>
      )}
    </p>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-ink-800">{children}</dd>
    </div>
  );
}

function Actions({
  entry,
  pending,
  onFollowUp,
  className,
}: {
  entry: DeviationLogEntry;
  pending: ReadonlySet<string>;
  onFollowUp: Props['onFollowUp'];
  className?: string;
}) {
  return (
    <FollowUpActions
      target={{
        deviationId: deviationLogId(entry),
        description: deviationDescription(entry),
        status: entry.status,
        action: entry.action,
        closedOn: entry.closedOn,
        closedBy: entry.closedBy,
      }}
      pending={pending.has(`${entry.inspectionId}/${entry.key}`)}
      onChange={(request) => onFollowUp(entry, request)}
      className={className}
    />
  );
}
