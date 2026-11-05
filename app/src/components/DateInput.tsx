import clsx from 'clsx';
import { CalendarDays } from 'lucide-react';
import { useRef, useState, type AriaAttributes } from 'react';
import { parseTypedDate, withinBounds } from '../lib/isoDate';
import { INPUT } from './Field';

type Props = {
  /** "YYYY-MM-DD", or '' when there is none. */
  value: string;
  /**
   * A complete date within the bounds, "YYYY-MM-DD"; '' when a `clearable` field is emptied.
   * Never called while a date is half typed.
   */
  onChange: (date: string) => void;
  min?: string;
  max?: string;
  /** Emptying the field reports ''; otherwise it shows the last date again on leaving. */
  clearable?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
  /** The wrapper's width and other layout classes. */
  className?: string;
};

/**
 * A date field that always reads "2026-11-05", whatever the browser's language: a native date
 * input shows the operating system's format ("11/05/2026" on an American one). The date is
 * typed (also "20261105" or "2026/11/05") or picked from the browser's own calendar, opened by
 * the button through a native date input that is never shown.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  clearable = false,
  className,
  ...control
}: Props) {
  // What is being typed; null shows `value`. Leaving the field shows `value` again.
  const [text, setText] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  function openCalendar() {
    const input = picker.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      // No showPicker (older browsers): focusing the native input lets its own UI take over.
      input.focus();
    }
  }

  return (
    <div className={clsx('relative', className)}>
      <input
        {...control}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY-MM-DD"
        maxLength={10}
        value={text ?? value}
        onChange={(event) => {
          const typed = event.target.value;
          setText(typed);
          const date = parseTypedDate(typed);
          if (date && withinBounds(date, min, max)) onChange(date);
          else if (clearable && typed.trim() === '') onChange('');
        }}
        onBlur={() => setText(null)}
        className={clsx(INPUT, 'h-9 pr-10 tabular-nums')}
      />
      <button
        type="button"
        onClick={openCalendar}
        aria-label="Open calendar"
        title="Open calendar"
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-ink-500 hover:text-ink-900"
      >
        <CalendarDays size={16} aria-hidden="true" />
      </button>
      {/* The browser's calendar, anchored under the field; never seen or reached by Tab. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const date = event.target.value;
          if (date && withinBounds(date, min, max)) onChange(date);
          setText(null);
        }}
        className="pointer-events-none absolute bottom-0 left-0 h-px w-full opacity-0"
      />
    </div>
  );
}
