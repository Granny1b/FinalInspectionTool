import clsx from 'clsx';
import { ArrowDown, ArrowUp, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../../components/Button';
import { INPUT } from '../../components/Field';
import {
  addEntry,
  addProblem,
  fieldId,
  moveEntry,
  removeEntry,
  renameEntry,
  type ListName,
  type ListRow,
} from './settingsForm';

type Props = {
  list: ListName;
  title: string;
  /** One line under the title: what the list is for. */
  description: string;
  /** "Responsible", "Category": names an entry's field ("Responsible 2"). */
  entryLabel: string;
  rows: ListRow[];
  /** Problems by field id (after a Save attempt). */
  errors: ReadonlyMap<string, string>;
  onChange: (rows: ListRow[]) => void;
};

/** After a change, where the keyboard focus goes: a row's button, or the field to add. */
type FocusTarget = { key: string; action: 'up' | 'down' | 'remove' } | 'add';

/**
 * One of the settings' pick lists, in the order its select offers them: entries are renamed in
 * place, moved up and down, removed, and added at the end. The keyboard focus stays on the button
 * that was used (an entry moved to the top keeps it on its "up" button, then inert), and a
 * removed entry hands it to the next one.
 */
export function ListEditor({
  list,
  title,
  description,
  entryLabel,
  rows,
  errors,
  onChange,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const addErrorId = useId();
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const focusAfter = useRef<FocusTarget | null>(null);
  const listError = errors.get(fieldId.list(list));

  useLayoutEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (!target) return;
    if (target === 'add') return addRef.current?.focus();
    rootRef.current
      ?.querySelector<HTMLElement>(
        `[data-entry="${CSS.escape(target.key)}"] [data-action="${target.action}"]`,
      )
      ?.focus();
  }, [rows]);

  const nameOf = (row: ListRow, index: number) => row.value.trim() || `${entryLabel} ${index + 1}`;

  function add() {
    const problem = addProblem(rows, draft);
    setAddError(problem);
    if (problem) return addRef.current?.focus();
    onChange(addEntry(rows, draft));
    setAnnouncement(`Added ${draft.trim()}.`);
    setDraft('');
  }

  function move(row: ListRow, index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= rows.length) return;
    focusAfter.current = { key: row.key, action: by < 0 ? 'up' : 'down' };
    onChange(moveEntry(rows, row.key, by));
    setAnnouncement(`${nameOf(row, index)} moved to place ${to + 1} of ${rows.length}.`);
  }

  function remove(row: ListRow, index: number) {
    const neighbour = rows[index + 1] ?? rows[index - 1];
    focusAfter.current = neighbour ? { key: neighbour.key, action: 'remove' } : 'add';
    onChange(removeEntry(rows, row.key));
    setAnnouncement(`Removed ${nameOf(row, index)}.`);
  }

  return (
    <fieldset
      ref={rootRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="min-w-0"
    >
      {/* A heading rather than a <legend>, which can't be laid out like the other headings. */}
      <h4 id={titleId} className="text-sm font-semibold text-ink-900">
        {title}
      </h4>
      <p id={descriptionId} className="mt-0.5 text-xs text-ink-500">
        {description}
      </p>
      {listError && (
        <p
          id={fieldId.list(list)}
          tabIndex={-1}
          className="mt-2 text-xs font-medium text-nok-fg outline-none"
        >
          {listError}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-ink-300 px-3 py-4 text-center text-sm text-ink-500">
          The list is empty, so there is nothing to pick.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-ink-100 rounded-md border border-ink-200">
          {rows.map((row, index) => {
            const id = fieldId.entry(row.key);
            const error = errors.get(id);
            const name = nameOf(row, index);
            return (
              <li key={row.key} data-entry={row.key} className="px-2 py-1.5">
                <div className="flex items-center gap-1">
                  {/* Not on a phone: the field needs the width more ("Damage & scratches" was
                      cut off), and the order shows anyway. */}
                  <span
                    aria-hidden="true"
                    className="hidden w-6 shrink-0 text-right text-xs text-ink-500 tabular-nums sm:block"
                  >
                    {index + 1}
                  </span>
                  <input
                    id={id}
                    aria-label={`${entryLabel} ${index + 1}`}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${id}-error` : undefined}
                    maxLength={100}
                    autoComplete="off"
                    value={row.value}
                    onChange={(event) => onChange(renameEntry(rows, row.key, event.target.value))}
                    className={clsx(INPUT, 'h-9 min-w-0 flex-1 sm:ml-1')}
                  />
                  <IconButton
                    icon={ArrowUp}
                    label={`Move ${name} up`}
                    action="up"
                    inert={index === 0}
                    onClick={() => move(row, index, -1)}
                  />
                  <IconButton
                    icon={ArrowDown}
                    label={`Move ${name} down`}
                    action="down"
                    inert={index === rows.length - 1}
                    onClick={() => move(row, index, 1)}
                  />
                  <IconButton
                    icon={Trash2}
                    label={`Remove ${name}`}
                    action="remove"
                    danger
                    onClick={() => remove(row, index)}
                  />
                </div>
                {error && (
                  <p id={`${id}-error`} className="mt-1 text-xs font-medium text-nok-fg sm:ml-8">
                    {error}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-3 flex gap-2">
        <input
          ref={addRef}
          aria-label={`New ${entryLabel.toLowerCase()}`}
          aria-invalid={addError ? true : undefined}
          aria-describedby={addError ? addErrorId : undefined}
          placeholder={`New ${entryLabel.toLowerCase()}`}
          maxLength={100}
          autoComplete="off"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setAddError(null);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            // Enter adds the name, as the Add button does.
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            add();
          }}
          className={clsx(INPUT, 'h-9 min-w-0 flex-1')}
        />
        <Button variant="secondary" onClick={add}>
          <Plus size={16} aria-hidden="true" />
          Add
        </Button>
      </div>
      {addError && (
        <p id={addErrorId} className="mt-1.5 text-xs font-medium text-nok-fg">
          {addError}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </fieldset>
  );
}

type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  action: 'up' | 'down' | 'remove';
  /** At the end of the list: shown and focusable, but does nothing (aria-disabled keeps the focus). */
  inert?: boolean;
  danger?: boolean;
  onClick: () => void;
};

function IconButton({ icon: Icon, label, action, inert, danger, onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      data-action={action}
      aria-label={label}
      title={label}
      aria-disabled={inert || undefined}
      onClick={() => {
        if (!inert) onClick();
      }}
      className={clsx(
        'flex size-9 shrink-0 items-center justify-center rounded-md text-ink-500 transition-colors pointer-coarse:size-11',
        'aria-disabled:cursor-default aria-disabled:opacity-40',
        !inert &&
          (danger ? 'hover:bg-nok-bg hover:text-nok-fg' : 'hover:bg-ink-100 hover:text-ink-900'),
      )}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
