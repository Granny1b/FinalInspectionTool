import clsx from 'clsx';
import { Outlet, ScrollRestoration } from 'react-router';
import { useMe } from '../lib/useMe';
import { AccountError } from './AccountError';
import { CONTENT_FRAME, CONTENT_OFFSET, SIDEBAR_FRAME } from './layout';
import { LoadingShell } from './LoadingShell';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';

/** Root layout: loads the signed-in user, then renders sidebar + page. */
export function AppShell() {
  const me = useMe();

  if (me.isPending) return <LoadingShell />;
  if (me.isError) {
    return (
      <AccountError error={me.error} retrying={me.isFetching} onRetry={() => void me.refetch()} />
    );
  }

  return (
    <>
      {/* Parked above the viewport until focused; sr-only/not-sr-only would reset its padding. */}
      <a
        href="#main"
        className="fixed top-3 left-3 z-50 -translate-y-16 rounded-md bg-surface px-4 py-2 text-sm font-medium text-ink-900 shadow-md transition-transform focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to content
      </a>
      <div className={SIDEBAR_FRAME}>
        <Sidebar me={me.data} />
      </div>
      <MobileNav me={me.data} />
      <main id="main" tabIndex={-1} className={clsx(CONTENT_OFFSET, 'outline-none')}>
        <div className={CONTENT_FRAME}>
          <Outlet />
        </div>
      </main>
      <ScrollRestoration />
    </>
  );
}
