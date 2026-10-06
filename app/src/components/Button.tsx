import clsx from 'clsx';
import type { ComponentProps } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-xs hover:bg-brand-700',
  secondary:
    'border border-ink-200 bg-surface text-ink-800 shadow-xs hover:border-ink-300 hover:bg-ink-50',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
};

function classes(variant: Variant, className?: string): string {
  return clsx(
    'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    className,
  );
}

/** Includes `ref` (React 19 passes it as a prop). */
type ButtonProps = ComponentProps<'button'> & { variant?: Variant };

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={classes(variant, className)} {...props} />;
}

/** An in-app link that looks like a button. */
export function ButtonLink({
  variant = 'primary',
  className,
  ...props
}: LinkProps & { variant?: Variant }) {
  return <Link className={classes(variant, className)} {...props} />;
}
