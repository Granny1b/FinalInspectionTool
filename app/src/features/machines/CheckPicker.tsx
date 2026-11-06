import clsx from 'clsx';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import { useId } from 'react';
import type { CheckChoice } from './model';

type Props = {
  choices: CheckChoice[];
  /** Template ids ticked. */
  value: ReadonlySet<string>;
  onChange: (value: Set<string>) => void;
};

/**
 * The checks a new machine gets: a checkbox per published quality check of its model, in their
 * order, and its final inspection; all ticked to start with. "Select none" / "Select all" flips
 * them at once.
 */
export function CheckPicker({ choices, value, onChange }: Props) {
  const titleId = useId();
  const hintId = useId();
  const all = choices.length > 0 && choices.every((choice) => value.has(choice.templateId));
  const toggle = (templateId: string, checked: boolean) => {
    const next = new Set(value);
    if (checked) next.add(templateId);
    else next.delete(templateId);
    onChange(next);
  };
  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={hintId}
      className="min-w-0 rounded-lg border border-ink-200 bg-surface"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-ink-200 px-5 pt-3.5 pb-3.5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-sm font-semibold text-ink-900">
            Checks
          </h2>
          <p id={hintId} className="mt-0.5 text-xs text-ink-500">
            Each ticked check is copied for this machine as it is published now. Later changes to
            its template don’t reach the machine unless an admin updates it.
          </p>
        </div>
        {choices.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange(all ? new Set() : new Set(choices.map((choice) => choice.templateId)))
            }
            className="-mx-2 -my-1 h-8 shrink-0 rounded-md px-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {all ? 'Select none' : 'Select all'}
          </button>
        )}
      </div>
      {choices.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-500">
          This model has no published quality checks or final inspection yet. The machine can get
          them later, from its page.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {choices.map((choice, index) => {
            const Icon = choice.kind === 'final' ? ClipboardCheck : ShieldCheck;
            const final = choice.kind === 'final';
            return (
              <li key={choice.templateId}>
                <label
                  className={clsx(
                    'flex min-h-12 cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors hover:bg-ink-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-brand-600 pointer-coarse:min-h-14',
                    final && index > 0 && 'border-t border-ink-200',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={value.has(choice.templateId)}
                    onChange={(event) => toggle(choice.templateId, event.target.checked)}
                    className="size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
                  />
                  <Icon
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                    className="shrink-0 text-ink-400"
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium wrap-break-word text-ink-900">
                    {final ? choice.title : `Quality check – ${choice.title}`}
                  </span>
                  <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                    Rev {choice.revision}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
