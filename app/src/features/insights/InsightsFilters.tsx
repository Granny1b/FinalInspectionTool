import type { InsightsMachine, MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { useId } from 'react';
import { DateInput } from '../../components/DateInput';
import { INPUT } from '../../components/Field';
import { formatCalendarDate, localDate } from '../inspections/dates';
import {
  filterKind,
  monthOptions,
  PERIOD_LABELS,
  periodRange,
  PERIODS,
  withPeriod,
  type InsightsFilter,
  type Period,
} from './filters';
import { formatMonthLong } from './format';
import { INSIGHTS_WORDS } from './words';

type Props = {
  filter: InsightsFilter;
  /** Models to choose from, by name. */
  models: MachineModel[];
  /** Quality checks: the quality checks to choose from, by title. */
  checks?: readonly string[];
  /** The machines with inspections of the kind shown, by Machine ID. */
  machines?: readonly InsightsMachine[];
  /** The earliest inspection's date (any, whatever the filters): where the month menus start. */
  firstInspectionDate: string | null;
  /** Why the chosen range can't be used, shown under it. */
  error?: string;
  /** New numbers are on their way; the old ones stay on screen meanwhile. */
  updating?: boolean;
  onChange: (filter: InsightsFilter) => void;
};

/** The id of the message under the range, which its fields point to. */
const ERROR_ID = 'insights-range-error';

/**
 * The menus. INPUT is full width, so each is sized by a wrapper: a whole line on a phone, about
 * its longest choice from sm.
 */
const SELECT = clsx(INPUT, 'h-9');
/** Two ends of a range: side by side at every width, the dash between them. */
const RANGE = 'flex w-full items-center gap-2 sm:w-auto';
const DASH = (
  <span aria-hidden="true" className="text-sm text-ink-500">
    –
  </span>
);

/**
 * One row above everything it scopes (brief §5.5: date range, model, include in-progress). The
 * period comes first; a single month opens a month menu, a month range two, custom dates two date
 * fields. A relative period says which dates it covers today, so "Last 12 months" is never a
 * guess. On a phone each control takes a line of its own; the two ends of a range share one.
 */
export function InsightsFilters({
  filter,
  models,
  checks = [],
  machines = [],
  firstInspectionDate,
  error,
  updating = false,
  onChange,
}: Props) {
  const today = localDate();
  const current = today.slice(0, 7);
  const months = monthOptions(firstInspectionDate, today, [
    filter.month,
    filter.fromMonth,
    filter.toMonth,
  ]);
  const coversId = useId();
  const covers = relativeRange(filter, today);
  const invalid = error
    ? ({ 'aria-invalid': true, 'aria-describedby': ERROR_ID } as const)
    : ({} as const);
  const quality = filterKind(filter) === 'quality';
  // A check from a shared link stays selectable even when none of it was done.
  const checkOptions =
    filter.check && !checks.includes(filter.check) ? [...checks, filter.check] : checks;
  // The machines of the model picked; one from a shared link stays selectable as its id.
  const machineOptions = machines.filter(
    (machine) => !filter.model || machine.modelCode === filter.model,
  );
  if (filter.machine && !machineOptions.some((machine) => machine.id === filter.machine)) {
    const known = machines.find((machine) => machine.id === filter.machine);
    machineOptions.push(
      known ?? { id: filter.machine, machineName: 'This machine', modelCode: filter.model },
    );
  }

  return (
    <div role="search" aria-label="Filters" className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-44">
        <select
          aria-label="Period"
          aria-describedby={covers ? coversId : undefined}
          value={filter.period}
          onChange={(event) =>
            onChange(withPeriod(filter, event.target.value as Period, firstInspectionDate))
          }
          className={SELECT}
        >
          {PERIODS.map((period) => (
            <option key={period} value={period}>
              {PERIOD_LABELS[period]}
            </option>
          ))}
        </select>
      </div>
      {filter.period === 'month' && (
        <div className="w-full sm:w-32">
          <MonthSelect
            label="Month"
            months={months}
            value={filter.month || current}
            onChange={(month) => onChange({ ...filter, month })}
          />
        </div>
      )}
      {filter.period === 'months' && (
        <div className={RANGE}>
          <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
            <MonthSelect
              label="From month"
              months={months}
              value={filter.fromMonth || months.at(-1)!}
              onChange={(fromMonth) => onChange({ ...filter, fromMonth })}
              {...invalid}
            />
          </div>
          {DASH}
          <div className="min-w-0 flex-1 sm:w-32 sm:flex-none">
            <MonthSelect
              label="To month"
              months={months}
              value={filter.toMonth || current}
              onChange={(toMonth) => onChange({ ...filter, toMonth })}
              {...invalid}
            />
          </div>
        </div>
      )}
      {filter.period === 'custom' && (
        <div className={RANGE}>
          <DateInput
            aria-label="From"
            min="2000-01-01"
            max="2099-12-31"
            clearable
            value={filter.from}
            onChange={(from) => onChange({ ...filter, from })}
            {...invalid}
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
          />
          {DASH}
          <DateInput
            aria-label="To"
            min="2000-01-01"
            max="2099-12-31"
            clearable
            value={filter.to}
            onChange={(to) => onChange({ ...filter, to })}
            {...invalid}
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
          />
        </div>
      )}
      {error && (
        // Under the fields it is about: on a phone right after them, from sm on a line of its
        // own under the whole row.
        <p id={ERROR_ID} className="w-full text-xs font-medium text-nok-fg sm:order-last">
          {error}
        </p>
      )}
      {covers && (
        // The dates a relative period stands for today, next to it: muted, as a hint is.
        <p id={coversId} className="w-full text-xs text-ink-500 sm:w-auto sm:pr-2 sm:pl-1">
          {covers}
        </p>
      )}
      <div className="w-full sm:w-44">
        <select
          aria-label="Machine model"
          value={filter.model}
          onChange={(event) => onChange({ ...filter, model: event.target.value })}
          className={SELECT}
        >
          <option value="">All models</option>
          {models.map((model) => (
            <option key={model.code} value={model.code}>
              {model.name}
            </option>
          ))}
        </select>
      </div>
      {(machineOptions.length > 0 || filter.machine) && (
        // One machine's inspections; the model narrows the choices.
        <div className="w-full sm:w-44">
          <select
            aria-label="Machine"
            value={filter.machine ?? ''}
            onChange={(event) => onChange({ ...filter, machine: event.target.value })}
            className={SELECT}
          >
            <option value="">All machines</option>
            {machineOptions.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.machineName}
              </option>
            ))}
          </select>
        </div>
      )}
      {quality && (
        // Which quality check: by its title, on every machine that has it (the model narrows it).
        <div className="w-full sm:w-64">
          <select
            aria-label="Quality check"
            value={filter.check ?? ''}
            onChange={(event) => onChange({ ...filter, check: event.target.value })}
            className={SELECT}
          >
            <option value="">All quality checks</option>
            {checkOptions.map((check) => (
              <option key={check} value={check}>
                {check}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="flex h-9 items-center gap-2 px-1 text-sm whitespace-nowrap text-ink-800">
        <input
          type="checkbox"
          className="size-4 accent-brand-600"
          checked={filter.includeInProgress}
          onChange={(event) => onChange({ ...filter, includeInProgress: event.target.checked })}
        />
        Include {INSIGHTS_WORDS[filterKind(filter)].many} in progress
      </label>
      {/* Always in the page, so a screen reader hears it start; seen from sm, where the row
            has room for it (on a phone the dimmed numbers say as much). */}
      <p
        role="status"
        className="flex items-center gap-1.5 text-xs text-ink-500 max-sm:sr-only sm:ml-auto"
      >
        {updating && (
          <>
            <LoaderCircle size={14} aria-hidden="true" className="animate-spin" />
            Updating…
          </>
        )}
      </p>
    </div>
  );
}

type MonthSelectProps = {
  label: string;
  /** Newest first. */
  months: readonly string[];
  value: string;
  onChange: (month: string) => void;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
};

function MonthSelect({ label, months, value, onChange, ...aria }: MonthSelectProps) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={SELECT}
      {...aria}
    >
      {months.map((month) => (
        <option key={month} value={month}>
          {formatMonthLong(month)}
        </option>
      ))}
    </select>
  );
}

/**
 * "2025-12-01 – 2026-11-05": the dates a relative period covers today. Undefined for the others,
 * whose menus or fields already show their dates, and for all time.
 */
function relativeRange(filter: InsightsFilter, today: string): string | undefined {
  if (filter.period !== 'last12' && filter.period !== 'thisYear' && filter.period !== 'lastYear') {
    return undefined;
  }
  const { from, to } = periodRange(filter, today);
  return `${formatCalendarDate(from!)} – ${formatCalendarDate(to!)}`;
}
