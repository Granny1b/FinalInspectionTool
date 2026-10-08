import type { ComponentProps } from 'react';
import { Link, type LinkProps } from 'react-router';
import { buttonClasses, type ButtonVariant } from './buttonClasses';

/** Includes `ref` (React 19 passes it as a prop). */
type ButtonProps = ComponentProps<'button'> & { variant?: ButtonVariant };

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}

/** An in-app link that looks like a button. */
export function ButtonLink({
  variant = 'primary',
  className,
  ...props
}: LinkProps & { variant?: ButtonVariant }) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}
