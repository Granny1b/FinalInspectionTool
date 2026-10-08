import clsx from 'clsx';

/** The official Modig logo, public/modig-logo.png (2937×908; width/height below keep that ratio). */
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/modig-logo.png"
      alt="Modig Machine Tool"
      width={291}
      height={90}
      className={clsx('w-auto', className)}
    />
  );
}
