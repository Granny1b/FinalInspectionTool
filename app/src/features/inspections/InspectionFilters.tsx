import type { InspectionKind, InspectionState, MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { INPUT } from '../../components/Field';
import { MachineSearch } from '../machines/MachineSearch';
import type { MachineChoice } from '../machines/model';
import type { InspectionFilter } from './listFilter';

type Props = {
  /** Which list: the search box says what it searches. */
  kind?: InspectionKind;
  filter: InspectionFilter;
  /** Models that have inspections, by name. */
  models: MachineModel[];
  /** The machines the search box offers (those of the model picked), by Machine ID. */
  machines: readonly MachineChoice[];
  /** Every model, to name each machine's. */
  machineModels: readonly MachineModel[] | undefined;
  onChange: (filter: InspectionFilter) => void;
};

/**
 * Search box (with the machines to pick from) plus model and state filters above the inspections
 * table (brief §5.1), and above the quality checks done.
 */
export function InspectionFilters({
  kind = 'final',
  filter,
  models,
  machines,
  machineModels,
  onChange,
}: Props) {
  const quality = kind === 'quality';
  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-auto sm:min-w-64 sm:flex-1">
        {/* Short enough for a 320 px phone; the icon and the name already say it is a search. */}
        <MachineSearch
          label={quality ? 'Search quality checks' : 'Search inspections'}
          placeholder={quality ? 'Number, machine ID, check or S/N' : 'Number, machine ID or S/N'}
          machines={machines}
          models={machineModels}
          value={{ query: filter.query, machine: filter.machine }}
          onChange={({ query, machine }) => onChange({ ...filter, query, machine })}
        />
      </div>
      {/* Sized by a wrapper: INPUT is full width. Just wide enough for the longest choices, so the
          search box keeps room for its placeholder beside the sidebar (1024 px). */}
      <div className="w-full sm:w-40">
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
      <div className="w-full sm:w-36">
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
