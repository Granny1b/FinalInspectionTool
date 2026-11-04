import clsx from 'clsx';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { resolveTheme, useSystemDark, useThemeChoice, type ThemeChoice } from '../lib/theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/**
 * System / Light / Dark as a segmented control: native radio buttons, so it is one Tab stop and
 * the arrow keys pick. The choice applies at once and is kept in this browser (lib/theme.ts).
 */
export function ThemeToggle() {
  const [choice, setChoice] = useThemeChoice();
  const systemDark = useSystemDark();
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Theme</legend>
      <div className="grid grid-cols-3 gap-0.5 rounded-md bg-ink-100 p-0.5">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const checked = value === choice;
          return (
            <label
              key={value}
              // Says what System gives right now, as the choice itself can't show it.
              title={
                value === 'system'
                  ? `Follow the system setting (${resolveTheme('system', systemDark)} now)`
                  : undefined
              }
              className={clsx(
                'relative inline-flex h-7 min-w-0 cursor-pointer items-center justify-center gap-1 rounded text-xs font-medium transition-colors pointer-coarse:h-9',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand-600',
                checked
                  ? 'bg-surface text-ink-900 shadow-xs ring-1 ring-ink-200'
                  : 'text-ink-500 hover:text-ink-900',
              )}
            >
              <input
                type="radio"
                name={name}
                value={value}
                checked={checked}
                onChange={() => setChoice(value)}
                className="sr-only"
              />
              <Icon size={13} aria-hidden="true" />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
