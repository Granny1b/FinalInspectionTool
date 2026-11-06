import { Keyboard } from 'lucide-react';
import { Fragment, type JSX } from 'react';

/** Keys and what they do on a focused row (brief §5.3), in the order of a transcription. */
const HINTS: { keys: string[]; label: string }[] = [
  { keys: ['1', 'O'], label: 'OK' },
  { keys: ['2', 'N'], label: 'NOK' },
  { keys: ['3', 'A'], label: 'N/A' },
  { keys: ['0'], label: 'Clear' },
  { keys: ['R'], label: 'Rest of section OK' },
  { keys: ['↓', 'J'], label: 'Down' },
  { keys: ['↑', 'K'], label: 'Up' },
  { keys: ['C'], label: 'Comment' },
  { keys: ['G'], label: 'Guide' },
  { keys: ['Tab'], label: 'Next field' },
  { keys: ['Enter'], label: 'Next row' },
  { keys: ['Esc'], label: 'Back to row' },
];

/**
 * The small shortcut hint bar; the page decides where it goes. Not on a touch phone, which has no
 * keys to press and where it took four lines above the sheet (a tablet keeps it: it may have a
 * keyboard). `G` opens a final inspection row's guide, a quality check row's pictures.
 */
export function ShortcutHints({ guide = 'Guide' }: { guide?: string }): JSX.Element {
  return (
    <div className="flex items-start gap-2 text-xs text-ink-500 max-sm:pointer-coarse:hidden">
      <Keyboard size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-400" />
      <ul aria-label="Keyboard shortcuts" className="flex flex-wrap gap-x-4 gap-y-1.5">
        {HINTS.map(({ keys, label: hint }) => {
          const label = keys[0] === 'G' ? guide : hint;
          return (
            <li key={label} className="inline-flex items-center gap-1">
              {keys.map((key, index) => (
                <Fragment key={key}>
                  {index > 0 && <span className="sr-only"> or </span>}
                  <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-ink-300 bg-surface px-1 font-sans text-[0.6875rem] font-medium text-ink-700 shadow-[0_1px_0_var(--color-ink-300)]">
                    {key}
                  </kbd>
                </Fragment>
              ))}
              <span className="ml-0.5">
                <span className="sr-only">: </span>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
