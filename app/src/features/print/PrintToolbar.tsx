import clsx from 'clsx';
import { Printer } from 'lucide-react';
import { useId } from 'react';
import { BackLink } from '../../components/BackLink';
import { Button } from '../../components/Button';
import { DEVIATIONS_PER_PAGE, PRINT_MODES, type DeviationsPerPage, type PrintMode } from './model';

const MODE_LABELS: Record<PrintMode, string> = { blank: 'Blank checklist', report: 'Report' };

export type Choice<T> = { value: T; onChange: (value: T) => void };

type Props = {
  /** What is printed: "FI-2026-0042 · RigiMill MG – Volvo Skövde". */
  subject: string;
  back: { to: string; label: string };
  /** Inspections switch between the blank checklist and the report. */
  mode?: Choice<PrintMode>;
  /** A report's deviation cards: 2 or 4 to a page. */
  deviationsPerPage?: Choice<DeviationsPerPage>;
  /** Until the document is complete, Print would miss a photo or the font. */
  ready: boolean;
};

/** Above the preview, never printed: the way back, the layout, and Print with the settings to use. */
export function PrintToolbar({ subject, back, mode, deviationsPerPage, ready }: Props) {
  const hintId = useId();
  return (
    <header className="sticky top-0 z-10 border-b border-ink-200 bg-surface print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-3 sm:px-6">
        <BackLink to={back.to} label={back.label} />
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-base font-semibold text-ink-900">Print preview</h1>
          <p className="truncate text-xs text-ink-500">{subject}</p>
        </div>
        {mode && (
          <Segmented
            label="What to print"
            options={PRINT_MODES.map((value) => ({ value, label: MODE_LABELS[value] }))}
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
        <Button onClick={() => window.print()} disabled={!ready} aria-describedby={hintId}>
          <Printer size={16} aria-hidden="true" />
          {ready ? 'Print / Save PDF' : 'Preparing…'}
        </Button>
      </div>
      <p
        id={hintId}
        className="mx-auto max-w-7xl px-4 pt-1.5 pb-2.5 text-right text-xs text-ink-500 sm:px-6"
      >
        Chrome/Edge → Save as PDF · Margins: Default · Scale: 100 % · Headers and footers: off
      </p>
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
function Segmented<T extends string | number>({
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
            className={clsx(
              'h-8 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
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
