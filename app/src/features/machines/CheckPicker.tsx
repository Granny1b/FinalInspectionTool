import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { StepNumber } from '../../components/StepNumber';

/** One thing a new machine can get: a published instruction or check, by its template. */
export type PickerItem = { templateId: string; title: string; revision: number };

/** What a new machine can get of one kind, in the order of the build. */
export type PickerGroup = {
  label: string;
  icon: LucideIcon;
  items: PickerItem[];
  /** What to say when the model has none of this kind published. */
  empty: string;
};

type Props = {
  step: number;
  groups: PickerGroup[];
  /** Template ids ticked. */
  value: ReadonlySet<string>;
  onChange: (value: Set<string>) => void;
};

/**
 * What a new machine gets, in the order of its build: its assembly instructions, its quality
 * checks and its final inspection, a checkbox each, all ticked to start with. "Select none" /
 * "Select all" flips them at once.
 */
export function CheckPicker({ step, groups, value, onChange }: Props) {
  const titleId = useId();
  const hintId = useId();
  const ids = groups.flatMap((group) => group.items.map((item) => item.templateId));
  const all = ids.length > 0 && ids.every((id) => value.has(id));
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
          <h2 id={titleId} className="flex items-center gap-2.5 text-sm font-semibold text-ink-900">
            <StepNumber step={step} />
            What the machine gets
          </h2>
          <p id={hintId} className="mt-0.5 pl-[2.125rem] text-xs text-ink-500">
            Everything ticked is copied for this machine as it is published now. More can be added
            later, on the machine’s page.
          </p>
        </div>
        {ids.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(all ? new Set() : new Set(ids))}
            className="-mx-2 -my-1 h-8 shrink-0 rounded-md px-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            {all ? 'Select none' : 'Select all'}
          </button>
        )}
      </div>
      <div className="divide-y divide-ink-200">
        {groups.map(({ label, icon: Icon, items, empty }) => (
          <fieldset key={label} className="min-w-0">
            <legend className="float-left flex w-full items-center gap-2 px-5 pt-3 pb-1 text-xs font-medium tracking-wide text-ink-500 uppercase">
              <Icon size={14} strokeWidth={1.75} aria-hidden="true" className="text-ink-400" />
              {label}
            </legend>
            {items.length === 0 ? (
              <p className="clear-left px-5 pt-1 pb-3 pl-[2.625rem] text-sm text-ink-500">
                {empty}
              </p>
            ) : (
              <ul className="clear-left pb-1.5">
                {items.map((item) => (
                  <li key={item.templateId}>
                    <label
                      className={clsx(
                        'flex min-h-11 cursor-pointer items-center gap-3 px-5 py-2 transition-colors hover:bg-ink-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-brand-600 pointer-coarse:min-h-14',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={value.has(item.templateId)}
                        onChange={(event) => toggle(item.templateId, event.target.checked)}
                        className="size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium wrap-break-word text-ink-900">
                        {item.title}
                      </span>
                      <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                        Rev {item.revision}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        ))}
      </div>
    </section>
  );
}
