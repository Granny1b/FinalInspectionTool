import type { MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { Check, Search, X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { INPUT } from '../../components/Field';
import { modelName } from '../../lib/useSettings';
import { matchingMachines, type MachineChoice } from './model';

/** What the box filters by: words typed, or one machine picked from its list (never both). */
export type MachineSearchValue = { query: string; machine: string };

type Props = {
  /** Every machine that can be picked, by Machine ID. */
  machines: readonly MachineChoice[];
  models: readonly MachineModel[] | undefined;
  value: MachineSearchValue;
  onChange: (value: MachineSearchValue) => void;
  /** The box's accessible name: "Search deviations". */
  label: string;
  placeholder: string;
};

/**
 * The search box of the lists, with every machine in a drop-down under it: typing searches as
 * before (numbers, Machine IDs, text) and narrows the machines shown; picking one shows only what
 * is linked to that machine, and the box then names it. Editing the name, or ×, goes back to
 * searching words. A combobox by the ARIA pattern: the arrow keys move in the list, Enter picks,
 * Escape closes it.
 */
export function MachineSearch({ machines, models, value, onChange, label, placeholder }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const picked = value.machine
    ? (machines.find((machine) => machine.id === value.machine) ?? null)
    : null;
  const text = value.machine ? (picked?.machineName ?? 'Unknown machine') : value.query;
  // With a machine picked the list shows them all, to pick another; otherwise those that match.
  const options = value.machine ? machines : matchingMachines(machines, value.query, models);
  const expanded = open && options.length > 0;

  function type(next: string) {
    onChange({ query: next, machine: '' });
    setOpen(true);
    // The best match is ready for Enter; nothing is while the box is empty.
    setActive(next.trim() ? 0 : -1);
  }

  function pick(machineId: string) {
    onChange({ query: '', machine: machineId });
    setOpen(false);
    setActive(-1);
  }

  function clear() {
    onChange({ query: '', machine: '' });
    setActive(-1);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!expanded) {
          setOpen(true);
          setActive(0);
        } else setActive((index) => Math.min(index + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (expanded) setActive((index) => Math.max(index - 1, 0));
        break;
      case 'Home':
      case 'End':
        if (expanded) {
          event.preventDefault();
          setActive(event.key === 'Home' ? 0 : options.length - 1);
        }
        break;
      case 'Enter': {
        const option = expanded ? options[active] : undefined;
        if (option) {
          event.preventDefault();
          pick(option.id);
        }
        break;
      }
      case 'Escape':
        if (expanded) {
          // Only the list closes, not a dialog or anything else listening.
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setActive(-1);
        }
        break;
      default:
        break;
    }
  }

  const activeOption = expanded ? options[active] : undefined;

  return (
    <div className="relative">
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(event) => type(event.target.value)}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        className={clsx(INPUT, 'h-9 pr-9 pl-9', picked && 'font-medium')}
      />
      {text && (
        <button
          type="button"
          aria-label={value.machine ? 'Show every machine' : 'Clear the search'}
          onClick={clear}
          className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-200 pointer-coarse:size-9"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
      {/* In the tree while closed, so aria-controls always points at it. */}
      <ul
        id={listId}
        role="listbox"
        aria-label="Machines"
        hidden={!expanded}
        // A press on the list keeps the focus in the box, so it doesn't close before the click.
        onMouseDown={(event) => event.preventDefault()}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-ink-200 bg-overlay p-1 text-sm text-ink-800 shadow-lg dark:border-ink-300"
      >
        {options.map((machine, index) => {
          const selected = machine.id === value.machine;
          return (
            <li
              key={machine.id}
              id={`${listId}-${machine.id}`}
              role="option"
              aria-selected={selected}
              onClick={() => pick(machine.id)}
              onMouseMove={() => setActive(index)}
              className={clsx(
                'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 pointer-coarse:py-2.5',
                index === active && 'bg-ink-100 dark:bg-ink-200',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium wrap-anywhere text-ink-900">
                  {machine.machineName}
                </span>
                <span className="block text-xs wrap-anywhere text-ink-500">
                  {modelName(models, machine.modelCode)}
                  {machine.serialNumber && ` · S/N ${machine.serialNumber}`}
                </span>
              </span>
              {selected && (
                <Check size={16} aria-hidden="true" className="shrink-0 text-brand-700" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
