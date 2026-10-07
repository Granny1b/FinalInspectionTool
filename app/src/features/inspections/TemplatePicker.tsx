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
    <fieldset
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      className="rounded-lg border border-ink-200 bg-surface p-5"
    >
      <legend className="float-left text-sm font-semibold text-ink-900">Checklist</legend>
      <p id={hintId} className="clear-left pt-1 text-xs text-ink-500">
        The inspection keeps its own copy of the latest published revision: later changes to the
        template don’t affect it.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {templates.map((template, index) => (
          <label
            key={template.id}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 px-4 py-3 transition-colors hover:border-ink-300 hover:bg-ink-50 has-checked:border-brand-600 has-checked:bg-brand-50"
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
              className="mt-0.5 size-4 shrink-0 accent-brand-600"
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
        <p id={errorId} className="mt-2 text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}
    </fieldset>
  );
}
