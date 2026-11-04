import clsx from 'clsx';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { INPUT } from '../../components/Field';
import {
  addModel,
  fieldId,
  removeModel,
  renameModel,
  setModelCode,
  type ModelRow,
} from './settingsForm';

type Props = {
  models: ModelRow[];
  /** Problems by field id (after a Save attempt). */
  errors: ReadonlyMap<string, string>;
  onChange: (models: ModelRow[]) => void;
};

/** After a change, where the keyboard focus goes. */
type FocusTarget = { key: string; part: 'name' | 'remove' } | 'add';

/**
 * The machine models templates and inspections are made for: a name and a short code each. A new
 * model's code is suggested from its name and can be changed until it is saved; after that it is
 * fixed, because templates, inspections and the deviation records carry it. Removing a saved model
 * asks first.
 */
export function MachineModelsEditor({ models, errors, onChange }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const rootRef = useRef<HTMLFieldSetElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<FocusTarget | null>(null);
  const [confirming, setConfirming] = useState<ModelRow | null>(null);
  const listError = errors.get(fieldId.models);

  useLayoutEffect(() => {
    const target = focusAfter.current;
    focusAfter.current = null;
    if (!target) return;
    if (target === 'add') return addRef.current?.focus();
    const selector =
      target.part === 'name'
        ? `[id="${CSS.escape(fieldId.modelName(target.key))}"]`
        : `[data-model="${CSS.escape(target.key)}"] [data-action="remove"]`;
    rootRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [models]);

  function add() {
    const { models: next, key } = addModel(models);
    focusAfter.current = { key, part: 'name' };
    onChange(next);
  }

  function remove(row: ModelRow) {
    const index = models.findIndex((candidate) => candidate.key === row.key);
    const neighbour = models[index + 1] ?? models[index - 1];
    focusAfter.current = neighbour ? { key: neighbour.key, part: 'remove' } : 'add';
    onChange(removeModel(models, row.key));
  }

  return (
    <fieldset
      ref={rootRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="min-w-0"
    >
      <h3 id={titleId} className="text-sm font-semibold text-ink-900">
        Machine models
      </h3>
      <p id={descriptionId} className="mt-0.5 text-xs text-ink-500">
        Each template is made for one model. A new model’s code is suggested from its name; once
        saved, the code stays, because templates, inspections and deviation records use it.
      </p>
      {listError && (
        <p
          id={fieldId.models}
          tabIndex={-1}
          className="mt-2 text-xs font-medium text-nok-fg outline-none"
        >
          {listError}
        </p>
      )}

      {models.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-ink-300 px-3 py-4 text-center text-sm text-ink-500">
          No machine models: templates can’t be made until there is one.
        </p>
      ) : (
        <div className="mt-3 rounded-md border border-ink-200">
          <div
            aria-hidden="true"
            className="hidden grid-cols-[minmax(0,1fr)_10rem_2.25rem] gap-2 border-b border-ink-100 bg-ink-50 px-3 py-1.5 text-[0.6875rem] font-medium tracking-wide text-ink-500 uppercase sm:grid"
          >
            <span>Name</span>
            <span>Code</span>
          </div>
          <ul className="divide-y divide-ink-100">
            {models.map((row, index) => (
              <ModelLine
                key={row.key}
                row={row}
                number={index + 1}
                errors={errors}
                onName={(name) => onChange(renameModel(models, row.key, name))}
                onCode={(code) => onChange(setModelCode(models, row.key, code))}
                onRemove={() => (row.saved ? setConfirming(row) : remove(row))}
              />
            ))}
          </ul>
        </div>
      )}

      <Button ref={addRef} variant="secondary" className="mt-3" onClick={add}>
        <Plus size={16} aria-hidden="true" />
        Add model
      </Button>

      {confirming && (
        <ConfirmDialog
          title={`Remove ${confirming.name.trim() || confirming.code}?`}
          message={
            <>
              New templates can’t be made for it. Templates and inspections that already use it keep
              the model code {confirming.code}, and show the code where its name was. The model is
              removed when you save.
            </>
          }
          confirmLabel="Remove"
          onConfirm={() => {
            setConfirming(null);
            remove(confirming);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </fieldset>
  );
}

type LineProps = {
  row: ModelRow;
  number: number;
  errors: ReadonlyMap<string, string>;
  onName: (name: string) => void;
  onCode: (code: string) => void;
  onRemove: () => void;
};

function ModelLine({ row, number, errors, onName, onCode, onRemove }: LineProps) {
  const nameId = fieldId.modelName(row.key);
  const codeId = fieldId.modelCode(row.key);
  const nameError = errors.get(nameId);
  const codeError = errors.get(codeId);
  const label = row.name.trim() || `model ${number}`;
  return (
    <li
      data-model={row.key}
      className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-start gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_10rem_2.25rem]"
    >
      <div className="min-w-0">
        <input
          id={nameId}
          aria-label={`Name, model ${number}`}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
          maxLength={100}
          autoComplete="off"
          placeholder="Name, e.g. RigiMill MG"
          value={row.name}
          onChange={(event) => onName(event.target.value)}
          className={clsx(INPUT, 'h-9')}
        />
        {nameError && (
          <p id={`${nameId}-error`} className="mt-1 text-xs font-medium text-nok-fg">
            {nameError}
          </p>
        )}
      </div>
      <div className="col-start-1 row-start-2 min-w-0 sm:col-start-2 sm:row-start-1">
        {row.saved ? (
          <p
            title="Saved codes can’t be changed"
            className="flex h-9 items-center gap-1.5 px-1 font-mono text-sm text-ink-800"
          >
            <span className="sr-only">Code, model {number}: </span>
            {row.code}
            <Lock size={13} aria-hidden="true" className="text-ink-400" />
            <span className="sr-only">(fixed)</span>
          </p>
        ) : (
          <>
            <input
              id={codeId}
              aria-label={`Code, model ${number}`}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={`${codeId}-hint${codeError ? ` ${codeId}-error` : ''}`}
              maxLength={32}
              autoComplete="off"
              spellCheck={false}
              placeholder="Code"
              value={row.code}
              onChange={(event) => onCode(event.target.value)}
              className={clsx(INPUT, 'h-9 font-mono')}
            />
            <p id={`${codeId}-hint`} className="mt-1 text-xs text-ink-500">
              Letters and digits
            </p>
            {codeError && (
              <p id={`${codeId}-error`} className="mt-1 text-xs font-medium text-nok-fg">
                {codeError}
              </p>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        data-action="remove"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        title="Remove"
        className="col-start-2 row-start-1 flex size-9 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-nok-bg hover:text-nok-fg sm:col-start-3"
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </li>
  );
}
