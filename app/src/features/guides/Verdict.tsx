import { GUIDE_VERDICT_LABELS, GUIDE_VERDICTS, type GuideVerdict } from '@modig/shared';
import clsx from 'clsx';
import { useId } from 'react';
import { VERDICT_ICONS, VERDICT_TONES } from './verdicts';

/** A guide image's verdict as a badge: ✓ Good, ✗ Bad or ⓘ Info. */
export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: GuideVerdict;
  className?: string;
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
      {GUIDE_VERDICT_LABELS[verdict]}
    </span>
  );
}

type PickerProps = {
  value: GuideVerdict;
  onChange: (verdict: GuideVerdict) => void;
  /** The group's accessible name, e.g. "Verdict, image 2". */
  label: string;
};

/**
 * Good / Bad / Info as a segmented control: native radio buttons, so it is one Tab stop and the
 * arrow keys pick (the selected segment takes the verdict's colour, with its symbol and word).
 */
export function VerdictPicker({ value, onChange, label }: PickerProps) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-ink-100 p-0.5 ring-1 ring-ink-200 ring-inset">
        {GUIDE_VERDICTS.map((verdict) => {
          const Icon = VERDICT_ICONS[verdict];
          const checked = verdict === value;
          return (
            <label
              key={verdict}
              className={clsx(
                'relative inline-flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1 rounded-md text-xs transition-colors pointer-coarse:h-10',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand-600',
                checked
                  ? clsx('font-semibold shadow-xs ring-1 ring-inset', VERDICT_TONES[verdict])
                  : 'text-ink-600 hover:bg-surface hover:text-ink-900',
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
              <Icon size={13} strokeWidth={checked ? 3 : 2} aria-hidden="true" />
              {GUIDE_VERDICT_LABELS[verdict]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
