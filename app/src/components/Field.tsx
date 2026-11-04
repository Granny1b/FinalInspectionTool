import { useId, type ReactNode } from 'react';

/**
 * Text inputs, selects and textareas. The border is ink-500 at 80 % (about 3.4:1 on white), so
 * the field's outline meets WCAG 1.4.11's 3:1 for identifying a control. In the dark theme that
 * would be 4.8:1, a bright box round every field; ink-400 there (3.75:1 on the surface, 3.2:1 on
 * a dialog) gives the outline the same weight as in the light theme.
 *
 * The dark hover comes after the focus and error borders in the CSS, so they are restated for
 * the dark theme: a field that is focused or invalid keeps that border under the pointer.
 */
export const INPUT =
  'block w-full rounded-md border border-ink-500/80 bg-surface px-3 text-sm text-ink-900 shadow-xs transition-colors placeholder:text-ink-500 hover:border-ink-600 focus-visible:border-brand-600 focus-visible:outline-1 focus-visible:outline-offset-0 disabled:bg-ink-50 disabled:text-ink-500 aria-invalid:border-nok-fg aria-invalid:outline-nok-fg dark:border-ink-400 dark:hover:border-ink-500 dark:focus-visible:border-brand-600 dark:aria-invalid:border-nok-fg';

/** What a control needs to be tied to its label, hint and error. */
export type ControlProps = {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
};

type Props = {
  /** Only when something else must find the control by id; generated otherwise. */
  id?: string;
  label: string;
  /** One line under the control. */
  hint?: ReactNode;
  error?: string;
  children: (control: ControlProps) => ReactNode;
};

/** A labelled form control with an optional hint and error message. */
export function Field({ id: fixedId, label, hint, error, children }: Props) {
  const generatedId = useId();
  const id = fixedId ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ');
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      <div className="mt-1.5">
        {children({
          id,
          'aria-describedby': describedBy || undefined,
          'aria-invalid': error ? true : undefined,
        })}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}
    </div>
  );
}
