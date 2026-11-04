import clsx from 'clsx';
import { LayoutGrid, List, type LucideIcon } from 'lucide-react';
import type { TemplateView } from './listView';

const VIEWS: { view: TemplateView; label: string; icon: LucideIcon }[] = [
  { view: 'list', label: 'List', icon: List },
  { view: 'cards', label: 'Cards', icon: LayoutGrid },
];

/**
 * List / Cards: a segmented control of two toggle buttons, the chosen one pressed. The app's one
 * segmented look (theme toggle, print toolbar, checklist status): an inset track, and the chosen
 * segment raised on it, which the dark theme shows as a lighter step rather than a shadow.
 */
export function ViewSwitch({
  view,
  onChange,
}: {
  view: TemplateView;
  onChange: (view: TemplateView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show templates as"
      className="inline-flex gap-0.5 rounded-lg bg-ink-100 p-0.5 ring-1 ring-ink-200 ring-inset"
    >
      {VIEWS.map(({ view: option, label, icon: Icon }) => {
        const pressed = option === view;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(option)}
            className={clsx(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-offset-0 pointer-coarse:h-10',
              pressed
                ? 'bg-raised text-ink-900 shadow-xs ring-1 ring-ink-200'
                : 'text-ink-600 hover:bg-raised/60 hover:text-ink-900',
            )}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
