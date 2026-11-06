import type { MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { INPUT } from '../../components/Field';
import { STATUS_CHOICES, type LogFilter } from './model';

type Choice = { value: string; label: string };

type Props = {
  filter: LogFilter;
  /** Models with deviations of this kind, by name. */
  models: MachineModel[];
  responsibles: Choice[];
  categories: Choice[];
  onChange: (filter: LogFilter) => void;
};

/** INPUT is full width: each menu is sized by a wrapper, a line of its own on a phone. */
const SELECT = clsx(INPUT, 'h-9');

/**
 * Open | Closed | All, then the search and the model, responsible and category menus, in one row
 * above what they filter (as the inspections list's), kept in the address.
 */
export function LogFilters({ filter, models, responsibles, categories, onChange }: Props) {
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
        <div className="relative w-full @min-[34rem]:w-auto @min-[34rem]:min-w-56 @min-[34rem]:flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
          />
          <input
            type="search"
            aria-label="Search deviations"
            placeholder="Machine ID, S/N, number or text"
            autoComplete="off"
            spellCheck={false}
            value={filter.q}
            onChange={(event) => onChange({ ...filter, q: event.target.value })}
            className={clsx(INPUT, 'h-9 pl-9')}
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
