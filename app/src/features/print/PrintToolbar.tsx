import clsx from 'clsx';
import { Printer } from 'lucide-react';
import { useId } from 'react';
import { BackLink } from '../../components/BackLink';
import { Button } from '../../components/Button';
import { PRINT_MODES, type PrintMode } from './model';

const MODE_LABELS: Record<PrintMode, string> = { blank: 'Blank checklist', report: 'Report' };

export type ModeSwitch = { mode: PrintMode; onChange: (mode: PrintMode) => void };

type Props = {
  /** What is printed: "FI-2026-0042 · RigiMill MG – Volvo Skövde". */
  subject: string;
  back: { to: string; label: string };
  /** Inspections switch between the blank checklist and the report. */
  modeSwitch?: ModeSwitch;
  /** Until the document is complete, Print would miss a photo or the font. */
  ready: boolean;
};

/** Above the preview, never printed: the way back, the mode, and Print with the settings to use. */
export function PrintToolbar({ subject, back, modeSwitch, ready }: Props) {
  const hintId = useId();
  return (
    <header className="sticky top-0 z-10 border-b border-ink-200 bg-surface print:hidden">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-3 sm:px-6">
        <BackLink to={back.to} label={back.label} />
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="text-base font-semibold text-ink-900">Print preview</h1>
          <p className="truncate text-xs text-ink-500">{subject}</p>
        </div>
        {modeSwitch && <ModeButtons {...modeSwitch} />}
        <Button onClick={() => window.print()} disabled={!ready} aria-describedby={hintId}>
          <Printer size={16} aria-hidden="true" />
          {ready ? 'Print / Save PDF' : 'Preparing…'}
        </Button>
      </div>
      <p
        id={hintId}
        className="mx-auto max-w-6xl px-4 pt-1.5 pb-2.5 text-right text-xs text-ink-500 sm:px-6"
      >
        Chrome/Edge → Save as PDF · Margins: Default · Scale: 100 % · Headers and footers: off
      </p>
    </header>
  );
}

function ModeButtons({ mode, onChange }: ModeSwitch) {
  return (
    <div role="group" aria-label="What to print" className="inline-flex rounded-lg bg-ink-100 p-1">
      {PRINT_MODES.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === mode}
          onClick={() => onChange(option)}
          className={clsx(
            'h-8 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors',
            option === mode
              ? 'bg-surface text-ink-900 shadow-xs ring-1 ring-ink-200'
              : 'text-ink-600 hover:text-ink-900',
          )}
        >
          {MODE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
