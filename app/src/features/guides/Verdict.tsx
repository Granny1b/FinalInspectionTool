import { GUIDE_VERDICT_LABELS, GUIDE_VERDICTS, type GuideVerdict } from '@modig/shared';
import clsx from 'clsx';
import { useId } from 'react';
import { VERDICT_ICONS, VERDICT_TONES } from './verdicts';

/** A guide image's verdict as a badge: ✓ Good, ✗ Bad or ⓘ Info (or a quality check's words). */
export function VerdictBadge({
  verdict,
  className,
  labels = GUIDE_VERDICT_LABELS,
}: {
  verdict: GuideVerdict;
  className?: string;
  labels?: Record<GuideVerdict, string>;
}) {
  const Icon = VERDICT_ICONS[verdict];
  return (
    <span
      data-verdict={verdict}
      className={clsx(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2.5 pl-2 text-xs font-semibold ring-1 ring-inset',
        VERDICT_TONES[verdict],
        className,
      )}
    >
      <Icon size={13} strokeWidth={3} aria-hidden="true" />
      {labels[verdict]}
    </span>
  );
}

type PickerProps = {
  value: GuideVerdict;
  onChange: (verdict: GuideVerdict) => void;
  /** The group's accessible name, e.g. "Verdict, image 2". */
  label: string;
  /** The verdicts' words: Good, Bad and Info unless given. */
  labels?: Record<GuideVerdict, string>;
  /** One under another, for words too long to share the tile's width (a quality check's). */
  stacked?: boolean;
};

/**
 * Good / Bad / Info as a segmented control: native radio buttons, so it is one Tab stop and the
 * arrow keys pick (the selected segment takes the verdict's colour, with its symbol and word).
 * The app's segmented control otherwise (track, height, raised hover), filling the width of its
 * image tile; in small type, as a third of an 11.5rem tile is too narrow for "✓ Good" in 14 px.
 */
export function VerdictPicker({
  value,
  onChange,
  label,
  labels = GUIDE_VERDICT_LABELS,
  stacked = false,
}: PickerProps) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div
        className={clsx(
          'grid gap-0.5 rounded-lg bg-ink-100 p-0.5 ring-1 ring-ink-200 ring-inset',
          stacked ? 'grid-cols-1' : 'grid-cols-3',
        )}
      >
        {GUIDE_VERDICTS.map((verdict) => {
          const Icon = VERDICT_ICONS[verdict];
          const checked = verdict === value;
          return (
            <label
              key={verdict}
              className={clsx(
                'relative inline-flex h-8 min-w-0 cursor-pointer items-center gap-1 rounded-md text-xs font-medium transition-colors pointer-coarse:h-10',
                stacked ? 'justify-start px-2' : 'justify-center px-1',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand-600',
                checked
                  ? clsx('font-semibold shadow-xs ring-1', VERDICT_TONES[verdict])
                  : 'text-ink-600 hover:bg-raised/60 hover:text-ink-900',
              )}
            >
              <input
                type="radio"
                name={name}
                value={verdict}
                checked={checked}
                onChange={() => onChange(verdict)}
                className="sr-only"
              />
              <Icon
                size={13}
                strokeWidth={checked ? 3 : 2}
                aria-hidden="true"
                className="shrink-0"
              />
              <span className="truncate">{labels[verdict]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
