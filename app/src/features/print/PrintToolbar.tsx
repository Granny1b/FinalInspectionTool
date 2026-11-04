import clsx from 'clsx';
import { Printer } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { BackLink } from '../../components/BackLink';
import { Button } from '../../components/Button';
import {
  DEVIATIONS_PER_PAGE,
  PRINT_MODE_LABELS,
  PRINT_MODES,
  type DeviationsPerPage,
  type PrintMode,
} from './model';

export type Choice<T> = { value: T; onChange: (value: T) => void };

type Props = {
  /** What is printed: "FI-2026-0042 · RigiMill MG – Volvo Skövde". */
  subject: string;
  back: { to: string; label: string };
  /** Inspections switch between the blank checklist and the report. */
  mode?: Choice<PrintMode>;
  /** A report's deviation cards: 2 or 4 to a page. */
  deviationsPerPage?: Choice<DeviationsPerPage>;
  /** "Include reference images"; `available` is false when no row has any. */
  appendix: Choice<boolean> & { available: boolean };
  /** Until the document is complete, Print would miss a photo or the font. */
  ready: boolean;
  /** More ways out, before Print: the Word export. */
  children?: ReactNode;
};

/**
 * Above the preview, never printed. First the way back, what is printed and the ways out (Word,
 * Print); under them the layout's choices, with the settings Print needs on the right. Each part
 * wraps within itself, so a choice never lands among the buttons.
 */
export function PrintToolbar({
  subject,
  back,
  mode,
  deviationsPerPage,
  appendix,
  ready,
  children,
}: Props) {
  const hintId = useId();
  return (
    // Sticky from 640 px up; on a phone its wrapped rows would cover half the screen.
    <header className="border-b border-ink-200 bg-surface sm:sticky sm:top-0 sm:z-10 print:hidden">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <BackLink to={back.to} label={back.label} />
          <div className="min-w-0 flex-1 basis-48">
            <h1 className="text-base font-semibold text-ink-900">Print preview</h1>
            <p className="truncate text-xs text-ink-500">{subject}</p>
          </div>
          {/* Right-aligned, also when they wrap onto a line of their own. */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {children}
            <Button onClick={() => window.print()} disabled={!ready} aria-describedby={hintId}>
              <Printer size={16} aria-hidden="true" />
              {ready ? 'Print / Save PDF' : 'Preparing…'}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          {mode && (
            <Segmented
              label="What to print"
              options={PRINT_MODES.map((value) => ({ value, label: PRINT_MODE_LABELS[value] }))}
              {...mode}
            />
          )}
          {deviationsPerPage && (
            <Segmented
              label="Deviations"
              showLabel
              options={DEVIATIONS_PER_PAGE.map((value) => ({ value, label: `${value} per page` }))}
              {...deviationsPerPage}
            />
          )}
          <AppendixToggle {...appendix} />
          <p id={hintId} className="ml-auto text-right text-xs text-ink-500">
            Chrome/Edge → Save as PDF · Margins: Default · Scale: 100 % · Headers and footers: off
          </p>
        </div>
      </div>
    </header>
  );
}

type SegmentedProps<T> = Choice<T> & {
  /** The group's name, shown in front of it with `showLabel`. */
  label: string;
  showLabel?: boolean;
  options: { value: T; label: string }[];
};

/** A few toggle buttons of which one is pressed. */
export function Segmented<T extends string | number>({
  label,
  showLabel = false,
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  const labelId = useId();
  return (
    <div className="flex items-center gap-2">
      {showLabel && (
        <span id={labelId} className="text-sm text-ink-600">
          {label}
        </span>
      )}
      <div
        role="group"
        aria-label={showLabel ? undefined : label}
        aria-labelledby={showLabel ? labelId : undefined}
        className="inline-flex rounded-lg bg-ink-100 p-1"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            // Taller under a finger: the tablet in the workshop.
            className={clsx(
              'h-8 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors pointer-coarse:h-10',
              option.value === value
                ? 'bg-surface text-ink-900 shadow-xs ring-1 ring-ink-200'
                : 'text-ink-600 hover:text-ink-900',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Include reference images": disabled, and saying why, when no row has any. */
function AppendixToggle({ value, onChange, available }: Choice<boolean> & { available: boolean }) {
  const noteId = useId();
  return (
    // The note under the label, lined up with its text, as a field's hint: the row of choices
    // stays one line on a desktop.
    <div>
      <label
        className={clsx(
          'flex items-center gap-2 text-sm whitespace-nowrap pointer-coarse:min-h-10',
          available ? 'text-ink-800' : 'text-ink-500',
        )}
      >
        <input
          type="checkbox"
          className="size-4 accent-brand-600"
          checked={available && value}
          disabled={!available}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={available ? undefined : noteId}
        />
        Include reference images
      </label>
      {!available && (
        <p id={noteId} className="pl-6 text-xs text-ink-500">
          No reference images in this checklist
        </p>
      )}
    </div>
  );
}
