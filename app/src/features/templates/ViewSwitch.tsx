import clsx from 'clsx';
import { LayoutGrid, List, type LucideIcon } from 'lucide-react';
import type { TemplateView } from './listView';

const VIEWS: { view: TemplateView; label: string; icon: LucideIcon }[] = [
  { view: 'list', label: 'List', icon: List },
  { view: 'cards', label: 'Cards', icon: LayoutGrid },
];

/** List / Cards: a segmented control of two toggle buttons, the chosen one pressed. */
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
      className="inline-flex h-9 rounded-md border border-ink-200 bg-ink-100 p-0.5 shadow-xs"
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
              'inline-flex items-center gap-1.5 rounded-[0.3125rem] px-2.5 text-sm font-medium transition-colors focus-visible:outline-offset-0',
              pressed
                ? 'bg-surface text-ink-900 shadow-xs ring-1 ring-ink-200'
                : 'text-ink-600 hover:text-ink-900',
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
