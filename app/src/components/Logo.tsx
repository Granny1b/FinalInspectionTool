import clsx from 'clsx';

/** The Modig logo from public/modig-logo.svg (a placeholder the Quality team will replace). */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/modig-logo.svg"
      alt="Modig Machine Tool"
      width={140}
      height={40}
      className={clsx('w-auto', className)}
    />
  );
}
