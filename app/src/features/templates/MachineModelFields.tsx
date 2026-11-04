import clsx from 'clsx';
import { Field, INPUT } from '../../components/Field';
import {
  modelProblems,
  NEW_MODEL,
  withModelName,
  type ModelChoice,
  type ModelContext,
} from './modelChoice';

type Props = {
  choice: ModelChoice;
  context: ModelContext;
  onChange: (choice: ModelChoice) => void;
};

/**
 * The machine model of a new template: a model without a template, or "New machine model…" with
 * its name and code (suggested from the name), added to the settings with the template.
 */
export function MachineModelFields({ choice, context, onChange }: Props) {
  const isNew = choice.selected === NEW_MODEL;
  // Taken or malformed values show at once; empty fields just keep Create disabled.
  const problems = modelProblems(choice, context, { required: false });
  return (
    <>
      <Field
        label="Machine model"
        hint={
          isNew
            ? 'A model launched since: it is added to the machine models in Settings.'
            : 'Each machine model has one template.'
        }
      >
        {(control) => (
          <select
            {...control}
            value={choice.selected}
            onChange={(event) => onChange({ ...choice, selected: event.target.value })}
            className={clsx(INPUT, 'h-9')}
          >
            {context.free.map((model) => (
              <option key={model.code} value={model.code}>
                {model.name} ({model.code})
              </option>
            ))}
            <option value={NEW_MODEL}>New machine model…</option>
          </select>
        )}
      </Field>
      {isNew && (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <Field label="Model name" error={problems.name}>
            {(control) => (
              <input
                {...control}
                required
                maxLength={100}
                autoComplete="off"
                placeholder="RigiMill MG"
                value={choice.name}
                onChange={(event) => onChange(withModelName(choice, event.target.value, context))}
                className={clsx(INPUT, 'h-9')}
              />
            )}
          </Field>
          <Field
            label="Model code"
            hint={problems.code ? undefined : 'Letters and digits.'}
            error={problems.code}
          >
            {(control) => (
              <input
                {...control}
                required
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                placeholder="RMMG"
                value={choice.code}
                onChange={(event) =>
                  onChange({ ...choice, code: event.target.value, codeEdited: true })
                }
                className={clsx(INPUT, 'h-9 tabular-nums')}
              />
            )}
          </Field>
        </div>
      )}
    </>
  );
}
