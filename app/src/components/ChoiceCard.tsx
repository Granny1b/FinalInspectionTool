import { useId, type ReactNode } from 'react';

export type ChoiceOption = { value: string; label: string; detail: ReactNode };

type Props = {
  name: string;
  title: string;
  hint: ReactNode;
  error: string | undefined;
  options: ChoiceOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** The first (or chosen) option takes the focus when the card appears. */
  autoFocus?: boolean;
  /** Under the options, inside the card (a link to make what is missing). */
  footer?: ReactNode;
};

/**
 * A card of radio options: its legend is the card's heading, the hint under it, then one option
 * per line or two, each a large target. Arrow keys move between them. The New machine page picks
 * its model with it, the start pages their machine.
 */
export function ChoiceCard({
  name,
  title,
  hint,
  error,
  options,
  value,
  onChange,
  autoFocus = true,
  footer,
}: Props) {
  const hintId = useId();
  const errorId = useId();
  return (
    // The card header every card has (title, one line under it, a divider), made of the group's
    // own legend and hint: the legend names the radio group and holds the card's heading. A
    // floated legend is laid out like any block inside the fieldset rather than on its border.
    <fieldset
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      className="min-w-0 rounded-lg border border-ink-200 bg-surface"
    >
      <legend className="float-left w-full px-5 pt-3.5">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      </legend>
      <p
        id={hintId}
        className="clear-left border-b border-ink-200 px-5 pt-0.5 pb-3.5 text-xs text-ink-500"
      >
        {hint}
      </p>
      <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option, index) => (
          <label
            key={option.value}
            // The focus ring goes round the whole card rather than as a square round the radio,
            // over its border, so a checked card shows one frame rather than two.
            className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-ink-200 px-4 py-3 transition-colors hover:border-ink-300 hover:bg-ink-50 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-1 has-focus-visible:outline-brand-600"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              autoFocus={autoFocus && (value ? value === option.value : index === 0)}
              aria-invalid={error ? true : undefined}
              className="mt-0.5 size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium wrap-break-word text-ink-900">
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="-mt-3 px-5 pb-5 text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}
      {footer && <div className="-mt-2 px-5 pb-5">{footer}</div>}
    </fieldset>
  );
}
