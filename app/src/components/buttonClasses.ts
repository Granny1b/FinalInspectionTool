import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-xs hover:bg-brand-700',
  secondary:
    'border border-ink-200 bg-surface text-ink-800 shadow-xs hover:border-ink-300 hover:bg-ink-50',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
};

/** The button look: `Button`, `ButtonLink` and other elements that act as buttons (a menu's trigger). */
export function buttonClasses(variant: ButtonVariant, className?: string): string {
  return clsx(
    'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    className,
  );
}
