import clsx from 'clsx';
import {
  CONTENT_FRAME,
  CONTENT_OFFSET,
  MOBILE_BAR,
  NAV_ITEM_HEIGHT,
  SIDEBAR_FRAME,
  USER_PANEL,
  USER_PANEL_ROW,
} from './layout';
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
          <Logo className="h-10" />
        </div>
        <div className="flex-1 px-3 py-5">
          {/* The sidebar's three groups (Final inspection, Quality check, Setup), each a label
              over its link, spaced as they are (Sidebar's GROUP_GAP). */}
          {['w-28', 'w-24', 'w-12'].map((label, index) => (
            <div key={label} className={clsx('space-y-2', index > 0 && 'mt-5')}>
              <Bone className={clsx('mx-3 mb-3 h-2.5', label)} />
              <Bone className={clsx(NAV_ITEM_HEIGHT, index === 1 ? 'w-4/5' : undefined)} />
            </div>
          ))}
        </div>
        {/* The user panel's rows at their real heights (Sidebar's UserPanel), so nothing moves
            when it loads: the user, their role and Sign out, and the theme control. */}
        <div className={USER_PANEL}>
          <div className="flex items-center gap-3 px-2 py-1.5">
            <Bone round className="size-9 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Bone className="h-3 w-28" />
              <Bone className="h-2.5 w-36 max-w-full" />
            </div>
          </div>
          <div
            className={clsx(
              'mt-2 flex items-center justify-between gap-2 pr-1 pl-2',
              USER_PANEL_ROW,
            )}
          >
            <Bone round className="h-5 w-14" />
            <Bone className="h-3 w-16" />
          </div>
          <div className="mt-3 px-2 pb-1">
            <Bone className="h-8 pointer-coarse:h-10" />
          </div>
        </div>
      </div>
      <div className={MOBILE_BAR}>
        {/* Where the menu button will be, so the logo doesn't jump when the shell loads. */}
        <div className="size-10" />
        <Logo className="h-9" />
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

/** `round` for an avatar or a badge. */
function Bone({ className, round }: { className: string; round?: boolean }) {
  return (
    <div
      className={clsx(
        'animate-pulse bg-ink-200/70',
        round ? 'rounded-full' : 'rounded-md',
        className,
      )}
    />
  );
}
