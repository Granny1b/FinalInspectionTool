import type { MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { INPUT } from '../../components/Field';
import { MachineSearch } from '../machines/MachineSearch';
import type { MachineChoice } from '../machines/model';
import { STATUS_CHOICES, type LogFilter } from './model';

type Choice = { value: string; label: string };

type Props = {
  filter: LogFilter;
  /** Models with deviations of this kind, by name. */
  models: MachineModel[];
  /** The machines the search box offers (those of the model picked), by Machine ID. */
  machines: readonly MachineChoice[];
  /** Every model, to name each machine's. */
  machineModels: readonly MachineModel[] | undefined;
  responsibles: Choice[];
  categories: Choice[];
  onChange: (filter: LogFilter) => void;
};

/** INPUT is full width: each menu is sized by a wrapper, a line of its own on a phone. */
const SELECT = clsx(INPUT, 'h-9');

/**
 * Open | Closed | All, then the search (with the machines to pick from) and the model, responsible
 * and category menus, in one row above what they filter (as the inspections list's), kept in the
 * address.
 */
export function LogFilters({
  filter,
  models,
  machines,
  machineModels,
  responsibles,
  categories,
  onChange,
}: Props) {
  // A value from the address in another case ("electrical") shows as the menu's own entry.
  const selected = (choices: Choice[], value: string | undefined) =>
    choices.find(
      (choice) => choice.value.toLocaleLowerCase('sv') === value?.toLocaleLowerCase('sv'),
    )?.value ?? '';
  return (
    // Laid out by its own width (container queries), as the page's width depends on the sidebar.
    <div className="@container">
      <div role="search" aria-label="Filters" className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Status"
          className="inline-flex gap-0.5 rounded-lg bg-ink-100 p-0.5 ring-1 ring-ink-200 ring-inset"
        >
          {STATUS_CHOICES.map(({ status, label }) => {
            const pressed = filter.status === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={pressed}
                onClick={() => onChange({ ...filter, status })}
                className={clsx(
                  'inline-flex h-8 items-center rounded-md px-3.5 text-sm font-medium transition-colors focus-visible:outline-offset-0 pointer-coarse:h-10',
                  pressed
                    ? 'bg-raised text-ink-900 shadow-xs ring-1 ring-ink-200'
                    : 'text-ink-600 hover:bg-raised/60 hover:text-ink-900',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="w-full @min-[34rem]:w-auto @min-[34rem]:min-w-56 @min-[34rem]:flex-1">
          <MachineSearch
            label="Search deviations"
            placeholder="Machine ID, S/N, number or text"
            machines={machines}
            models={machineModels}
            value={{ query: filter.q, machine: filter.machine ?? '' }}
            onChange={({ query, machine }) =>
              onChange({ ...filter, q: query, machine: machine || undefined })
            }
          />
        </div>
        {/* The menus share a line under the search on a tablet, beside it on a desktop. */}
        <div className="grid w-full grid-cols-1 gap-2 @min-[34rem]:grid-cols-3 @min-[64rem]:w-auto @min-[64rem]:grid-cols-[10rem_10rem_11rem]">
          <div>
            <select
              aria-label="Machine model"
              value={filter.model ?? ''}
              onChange={(event) => onChange({ ...filter, model: event.target.value || undefined })}
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
          <div>
            <select
              aria-label="Responsible"
              value={selected(responsibles, filter.resp)}
              onChange={(event) => onChange({ ...filter, resp: event.target.value || undefined })}
              className={SELECT}
            >
              <option value="">All responsibles</option>
              {responsibles.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              aria-label="Category"
              value={selected(categories, filter.category)}
              onChange={(event) =>
                onChange({ ...filter, category: event.target.value || undefined })
              }
              className={SELECT}
            >
              <option value="">All categories</option>
              {categories.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
