import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/**
 * A filled button that can't be used turns a quiet grey: faded to half, white text on a pale
 * cyan (or red) reads as loading or washed out rather than as unavailable.
 */
const FILLED_DISABLED = 'disabled:bg-ink-200 disabled:text-ink-500 disabled:shadow-none';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: clsx('bg-primary text-white shadow-xs hover:bg-primary-hover', FILLED_DISABLED),
  // In the dark theme a faint white wash rather than the surface colour, so it is a step lighter
  // than whatever it is on: on a dialog or menu (the overlay, lighter than the surface) a surface
  // fill would sink into it and read as a text field.
  secondary: clsx(
    'border border-ink-200 bg-surface text-ink-800 shadow-xs hover:border-ink-300 hover:bg-ink-50',
    'dark:bg-white/5 dark:hover:bg-white/10',
    'disabled:opacity-50',
  ),
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50',
  // The confirming button of a delete or remove: nok-solid carries white text in both themes,
  // where nok-fg is a light red in the dark one.
  danger: clsx('bg-nok-solid text-white shadow-xs hover:bg-nok-solid/90', FILLED_DISABLED),
};

/** The button look: `Button`, `ButtonLink` and other elements that act as buttons (a menu's trigger). */
export function buttonClasses(variant: ButtonVariant, className?: string): string {
  return clsx(
    'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none',
    VARIANTS[variant],
    className,
  );
}
