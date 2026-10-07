import type { InspectionState, MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { INPUT } from '../../components/Field';
import type { InspectionFilter } from './listFilter';

type Props = {
  filter: InspectionFilter;
  /** Models that have inspections, by name. */
  models: MachineModel[];
  onChange: (filter: InspectionFilter) => void;
};

/** Search box plus model and state filters above the inspections table (brief §5.1). */
export function InspectionFilters({ filter, models, onChange }: Props) {
  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-auto sm:min-w-64 sm:flex-1">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
        />
        <input
          type="search"
          aria-label="Search inspections"
          placeholder="Search number, machine or serial number"
          autoComplete="off"
          spellCheck={false}
          value={filter.query}
          onChange={(event) => onChange({ ...filter, query: event.target.value })}
          className={clsx(INPUT, 'h-9 pl-9')}
        />
      </div>
      {/* Sized by a wrapper: INPUT is full width. */}
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
      <div className="w-full sm:w-40">
        <select
          aria-label="State"
          value={filter.state}
          onChange={(event) =>
            onChange({ ...filter, state: event.target.value as InspectionState | '' })
          }
          className={clsx(INPUT, 'h-9')}
        >
          <option value="">All states</option>
          <option value="in_progress">In progress</option>
          <option value="finalised">Finalised</option>
        </select>
      </div>
    </div>
  );
}
