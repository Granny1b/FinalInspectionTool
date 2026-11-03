import type { MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { INPUT } from '../../components/Field';
import { PERIOD_LABELS, PERIODS, type InsightsFilter, type Period } from './filters';

type Props = {
  filter: InsightsFilter;
  /** Models to choose from, by name. */
  models: MachineModel[];
  /** Why a custom range can't be used, shown under it. */
  error?: string;
  onChange: (filter: InsightsFilter) => void;
};

/**
 * One row above everything it scopes (brief §5.5: date range, model, include in-progress). The
 * period comes first; a custom range opens two date fields.
 */
export function InsightsFilters({ filter, models, error, onChange }: Props) {
  const custom = filter.period === 'custom';
  return (
    <div role="search" aria-label="Filters" className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="w-full sm:w-44">
          <select
            aria-label="Period"
            value={filter.period}
            onChange={(event) => onChange({ ...filter, period: event.target.value as Period })}
            className={clsx(INPUT, 'h-9')}
          >
            {PERIODS.map((period) => (
              <option key={period} value={period}>
                {PERIOD_LABELS[period]}
              </option>
            ))}
          </select>
        </div>
        {custom && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              type="date"
              aria-label="From"
              min="2000-01-01"
              max="2099-12-31"
              value={filter.from}
              onChange={(event) => onChange({ ...filter, from: event.target.value })}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'insights-range-error' : undefined}
              className={clsx(INPUT, 'h-9 sm:w-40')}
            />
            <span aria-hidden="true" className="text-sm text-ink-500">
              –
            </span>
            <input
              type="date"
              aria-label="To"
              min="2000-01-01"
              max="2099-12-31"
              value={filter.to}
              onChange={(event) => onChange({ ...filter, to: event.target.value })}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'insights-range-error' : undefined}
              className={clsx(INPUT, 'h-9 sm:w-40')}
            />
          </div>
        )}
        <div className="w-full sm:w-44">
          <select
            aria-label="Machine model"
            value={filter.model}
            onChange={(event) => onChange({ ...filter, model: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          >
            <option value="">All models</option>
            {models.map((model) => (
              <option key={model.code} value={model.code}>
                {model.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex h-9 items-center gap-2 px-1 text-sm whitespace-nowrap text-ink-800">
          <input
            type="checkbox"
            className="size-4 accent-brand-600"
            checked={filter.includeInProgress}
            onChange={(event) => onChange({ ...filter, includeInProgress: event.target.checked })}
          />
          Include inspections in progress
        </label>
      </div>
      {error && (
        <p id="insights-range-error" className="text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}
    </div>
  );
}
