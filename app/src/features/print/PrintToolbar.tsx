import clsx from 'clsx';
import { Printer } from 'lucide-react';
import { Fragment, useId, type ReactNode } from 'react';
import { BackLink } from '../../components/BackLink';
import { Button } from '../../components/Button';
import {
  DEVIATIONS_PER_PAGE,
  PRINT_MODE_LABELS,
  PRINT_MODES,
  type DeviationsPerPage,
  type PrintMode,
} from './model';
import {
  QUALITY_PRINT_MODE_LABELS,
  QUALITY_PRINT_MODES,
  type QualityPrintMode,
} from './quality/model';

export type Choice<T> = { value: T; onChange: (value: T) => void };

type Props = {
  /** What is printed: "FI-2026-0042 · RigiMill MG – Volvo Skövde"; cut short when long. */
  subject: string;
  /** After the subject and never cut, as it tells what is printed: "Draft – Rev 3". */
  revision?: string;
  back: { to: string; label: string };
  /** Inspections switch between the blank checklist and the report. */
  mode?: Choice<PrintMode>;
  /** Quality checks switch between the entire report and only its deviations. */
  qualityMode?: Choice<QualityPrintMode>;
  /** A report's deviation cards: 2 or 4 to a page. */
  deviationsPerPage?: Choice<DeviationsPerPage>;
  /** "Include reference images"; `available` is false when no row has any. */
  appendix?: Choice<boolean> & { available: boolean };
  /** Other documents' own layout choices, after the built-in ones (the Insights report's list). */
  choices?: ReactNode;
  /** Until the document is complete, Print would miss a photo or the font. */
  ready: boolean;
  /** More ways out, before Print: the Word export. */
  children?: ReactNode;
};

/** What Chrome's print dialog needs for a clean PDF, each kept whole when the hint wraps. */
const PDF_SETTINGS = [
  'Chrome/Edge → Save as PDF',
  'Margins: Default',
  'Scale: 100 %',
  'Headers and footers: off',
];

/**
 * Above the preview, never printed. First the way back, what is printed and the ways out (Word,
 * Print); under them the layout's choices, with the settings Print needs on the right. Each part
 * wraps within itself, so a choice never lands among the buttons. On a phone everything is
 * left-aligned, one item under the other.
 */
export function PrintToolbar({
  subject,
  revision,
  back,
  mode,
  qualityMode,
  deviationsPerPage,
  appendix,
  choices,
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
            <p className="flex min-w-0 text-xs text-ink-500">
              <span className="truncate">{subject}</span>
              {revision && <span className="shrink-0 whitespace-pre"> · {revision}</span>}
            </p>
          </div>
          {/* Right-aligned from 640 px, also when they wrap onto a line of their own. */}
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
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
          {qualityMode && (
            <Segmented
              label="What to print"
              options={QUALITY_PRINT_MODES.map((value) => ({
                value,
                label: QUALITY_PRINT_MODE_LABELS[value],
              }))}
              {...qualityMode}
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
          {appendix && <AppendixToggle {...appendix} />}
          {choices}
          {/* Each setting stays whole, its separator with it, so a wrapped line never starts
              with a dot or splits "Headers and footers: off". */}
          <p id={hintId} className="text-xs text-ink-500 sm:ml-auto sm:text-right">
            {PDF_SETTINGS.map((setting, index) => (
              <Fragment key={setting}>
                {index > 0 && ' '}
                <span className="whitespace-nowrap">
                  {setting}
                  {index < PDF_SETTINGS.length - 1 && ' ·'}
                </span>
              </Fragment>
            ))}
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

/**
 * A few toggle buttons of which one is pressed, drawn like every segmented control in the app:
 * the chosen segment raised on a quiet track.
 */
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
        <span id={labelId} className="text-xs font-medium text-ink-500">
          {label}
        </span>
      )}
      <div
        role="group"
        aria-label={showLabel ? undefined : label}
        aria-labelledby={showLabel ? labelId : undefined}
        className="inline-flex gap-0.5 rounded-lg bg-ink-100 p-0.5 ring-1 ring-ink-200 ring-inset"
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
                ? 'bg-raised text-ink-900 shadow-xs ring-1 ring-ink-200'
                : 'text-ink-600 hover:bg-raised/60 hover:text-ink-900',
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
