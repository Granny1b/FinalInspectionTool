import clsx from 'clsx';
import { CONTENT_FRAME, CONTENT_OFFSET, SIDEBAR_FRAME } from './layout';
import { Logo } from './Logo';

/** Skeleton of the shell shown while /api/me loads, laid out exactly like the real one. */
export function LoadingShell() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className={SIDEBAR_FRAME}>
        <div className="flex h-16 shrink-0 items-center border-b border-ink-100 px-5">
          <Logo className="h-8" />
        </div>
        <div className="space-y-2 px-3 py-5">
          <Bone className="h-9" />
          <Bone className="h-9 w-4/5" />
        </div>
        <div className="mt-auto border-t border-ink-200 p-5">
          <Bone className="h-10" />
        </div>
      </div>
      <div className="flex h-14 items-center border-b border-ink-200 bg-surface px-4 lg:hidden">
        <Logo className="h-7" />
      </div>
      <div className={CONTENT_OFFSET}>
        <div className={CONTENT_FRAME}>
          <Bone className="h-8 w-48" />
          <Bone className="mt-3 h-4 w-80 max-w-full" />
          <Bone className="mt-10 h-64" />
        </div>
      </div>
    </div>
  );
}

function Bone({ className }: { className: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-ink-200/70', className)} />;
}
