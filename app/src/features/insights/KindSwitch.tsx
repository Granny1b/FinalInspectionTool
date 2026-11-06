import type { InspectionKind } from '@modig/shared';
import clsx from 'clsx';
import { ClipboardCheck, ShieldCheck, type LucideIcon } from 'lucide-react';

const KINDS: { kind: InspectionKind; label: string; icon: LucideIcon }[] = [
  { kind: 'final', label: 'Final inspections', icon: ClipboardCheck },
  { kind: 'quality', label: 'Quality checks', icon: ShieldCheck },
];

/**
 * Final inspections | Quality checks: which Insights shows. They are never counted together, so
 * this comes first, above every filter and number. The app's segmented control (as List / Cards
 * on Templates), a little larger: it decides everything under it.
 */
export function KindSwitch({
  kind,
  onChange,
}: {
  kind: InspectionKind;
  onChange: (kind: InspectionKind) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show insights of"
      className="inline-flex max-w-full gap-0.5 rounded-lg bg-ink-100 p-0.5 ring-1 ring-ink-200 ring-inset"
    >
      {KINDS.map(({ kind: option, label, icon: Icon }) => {
        const pressed = option === kind;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option)}
            className={clsx(
              'inline-flex h-9 min-w-0 items-center gap-2 rounded-md px-3.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-offset-0 pointer-coarse:h-11',
              pressed
                ? 'bg-raised text-ink-900 shadow-xs ring-1 ring-ink-200'
                : 'text-ink-600 hover:bg-raised/60 hover:text-ink-900',
            )}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
