import { MAX_ROW_HOURS, parseHours } from '@modig/shared';
import clsx from 'clsx';
import { useState } from 'react';

type Props = {
  /** "1.a" */
  rowRef: string;
  hours: number | undefined;
  /** A number of hours (one decimal), or undefined once the field is emptied. */
  onChange: (hours: number | undefined) => void;
};

/**
 * The time a row's check takes, in hours with one decimal: "0.5" or "0,5" (a Swedish keyboard's
 * comma). Every number typed counts at once; something that isn't one is marked and, on leaving,
 * the field shows the last time again.
 */
export function TimeField({ rowRef, hours, onChange }: Props) {
  // What is being typed; null shows `hours`.
  const [text, setText] = useState<string | null>(null);
  const parsed = text === null ? hours : parseHours(text, MAX_ROW_HOURS);
  const invalid = parsed === null;
  return (
    <div className="flex items-center gap-1.5">
      {/* The input's name says it too: "Row 1.a time in hours". */}
      <span aria-hidden="true" className="text-xs text-ink-500">
        Time
      </span>
      <div className="relative">
        <input
          aria-label={`Row ${rowRef} time in hours`}
          aria-invalid={invalid ? true : undefined}
          inputMode="decimal"
          autoComplete="off"
          maxLength={6}
          placeholder="0.0"
          value={text ?? (hours === undefined ? '' : hours.toFixed(1))}
          onChange={(event) => {
            const typed = event.target.value;
            setText(typed);
            const next = parseHours(typed, MAX_ROW_HOURS);
            if (next !== null && next !== hours) onChange(next);
          }}
          onBlur={() => setText(null)}
          className={clsx(
            'h-8 w-16 rounded-md border border-ink-500/80 bg-surface pr-5 pl-2 text-right text-sm text-ink-900 tabular-nums shadow-xs transition-colors placeholder:text-ink-400 hover:border-ink-600 focus-visible:border-brand-600 focus-visible:outline-1 focus-visible:outline-offset-0 dark:border-ink-400 dark:hover:border-ink-500',
            'aria-invalid:border-nok-fg aria-invalid:outline-nok-fg dark:aria-invalid:border-nok-fg',
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-ink-500"
        >
          h
        </span>
      </div>
    </div>
  );
}
