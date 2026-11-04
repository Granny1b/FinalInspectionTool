import type { MachineModel, TemplateSummary } from '@modig/shared';
import { useId } from 'react';
import { modelName } from '../../lib/useSettings';

type Props = {
  /** Templates with a published revision. */
  templates: TemplateSummary[];
  models: MachineModel[] | undefined;
  value: string | null;
  error: string | undefined;
  onChange: (templateId: string) => void;
};

/**
 * Which checklist the inspection follows: one radio per published template (one per machine
 * model), showing the revision it will copy. Arrow keys move between them.
 */
export function TemplatePicker({ templates, models, value, error, onChange }: Props) {
  const errorId = useId();
  const hintId = useId();
  return (
    // The card header every card has (title, one line under it, a divider), made of the group's
    // own legend and hint: the legend names the radio group and holds the card's heading. A
    // floated legend is laid out like any block inside the fieldset rather than on its border.
    <fieldset
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      className="min-w-0 rounded-lg border border-ink-200 bg-surface"
    >
      <legend className="float-left w-full px-5 pt-3.5">
        <h2 className="text-sm font-semibold text-ink-900">Checklist</h2>
      </legend>
      <p
        id={hintId}
        className="clear-left border-b border-ink-200 px-5 pt-0.5 pb-3.5 text-xs text-ink-500"
      >
        The inspection keeps its own copy of the latest published revision: later changes to the
        template don’t affect it.
      </p>
      <div className="grid gap-2 p-5 sm:grid-cols-2">
        {templates.map((template, index) => (
          <label
            key={template.id}
            // The focus ring goes round the whole card rather than as a square round the radio,
            // over its border, so a checked card shows one frame rather than two.
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 px-4 py-3 transition-colors hover:border-ink-300 hover:bg-ink-50 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-1 has-focus-visible:outline-brand-600"
          >
            <input
              type="radio"
              name="template"
              value={template.id}
              checked={value === template.id}
              onChange={() => onChange(template.id)}
              // The form starts here: the selected template, or the first one.
              autoFocus={value ? value === template.id : index === 0}
              aria-invalid={error ? true : undefined}
              className="mt-0.5 size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
            />
            <span className="min-w-0">
              {/* The published revision's model and name: an unpublished change doesn't count. */}
              <span className="block text-sm font-medium text-ink-900">
                {modelName(models, template.publishedModelCode ?? template.modelCode)}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                {template.publishedName ?? template.name} · Rev {template.publishedRevision}
              </span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="-mt-3 px-5 pb-5 text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}
    </fieldset>
  );
}
