import clsx from 'clsx';

/**
 * The official Modig logo, public/modig-logo.png (2937×908; width/height below keep that ratio).
 * The dark theme shows modig-logo-dark.png instead: the same file with the black wordmark made
 * white, so it reads on a dark surface; the swoosh keeps its blues.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/modig-logo.png"
        alt="Modig Machine Tool"
        width={291}
        height={90}
        className={clsx('w-auto dark:hidden', className)}
      />
      <img
        src="/modig-logo-dark.png"
        alt="Modig Machine Tool"
        width={291}
        height={90}
        className={clsx('hidden w-auto dark:inline', className)}
      />
    </>
  );
}
