import clsx from 'clsx';

const BLOCK = 'animate-pulse rounded-md bg-ink-200/70';

/**
 * The dashboard's shape while its first numbers load: the filter row, the four tiles and the
 * top 10 card, at their real sizes, so nothing jumps when they arrive. Later filter changes keep
 * the previous numbers on screen instead (dimmed), so this shows once.
 */
export function InsightsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <p role="status" className="sr-only">
        Loading insights…
      </p>
      <div aria-hidden="true" className="flex flex-wrap items-center gap-2">
        <div className={clsx(BLOCK, 'h-9 w-full sm:w-44')} />
        <div className={clsx(BLOCK, 'h-9 w-full sm:w-44')} />
        <div className={clsx(BLOCK, 'h-5 w-56 max-sm:hidden')} />
      </div>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:gap-6 xl:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div
            key={tile}
            className="rounded-lg border border-ink-200 bg-surface px-4 py-3 sm:px-5 sm:py-4"
          >
            <div className={clsx(BLOCK, 'h-4 w-24 max-w-full')} />
            <div className={clsx(BLOCK, 'mt-2.5 h-7 w-16 sm:h-8')} />
            <div className={clsx(BLOCK, 'mt-2 h-3 w-32 max-w-full')} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="rounded-lg border border-ink-200 bg-surface">
        <div className="border-b border-ink-200 px-5 py-3.5">
          <div className={clsx(BLOCK, 'h-4 w-48 max-w-full')} />
          <div className={clsx(BLOCK, 'mt-1.5 h-3 w-72 max-w-full')} />
        </div>
        <div className="space-y-5 p-5">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-start gap-4">
              <div className={clsx(BLOCK, 'h-4 w-4 shrink-0')} />
              <div className="min-w-0 flex-1">
                <div className={clsx(BLOCK, 'h-4 w-3/4')} />
                <div className={clsx(BLOCK, 'mt-1.5 h-3 w-1/4')} />
              </div>
              <div className={clsx(BLOCK, 'h-4 w-10 shrink-0 max-sm:hidden')} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
