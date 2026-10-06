import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import { Outlet, ScrollRestoration } from 'react-router';
import { ApiRequestError } from '../lib/api';
import { signOutUrl } from '../lib/auth';
import { useMe } from '../lib/useMe';
import { Button } from './Button';
import { ErrorScreen } from './ErrorScreen';
import { CONTENT_FRAME, CONTENT_OFFSET, SIDEBAR_FRAME } from './layout';
import { LoadingShell } from './LoadingShell';
import { MobileNav } from './MobileNav';
import { Sidebar } from './Sidebar';

/** Root layout: loads the signed-in user, then renders sidebar + page. */
export function AppShell() {
  const me = useMe();

  if (me.isPending) return <LoadingShell />;
  if (me.isError) {
    const retrying = me.isFetching;
    return (
      <ErrorScreen
        title="We couldn't load your account"
        message={
          me.error instanceof ApiRequestError
            ? me.error.message
            : 'Check your network connection and try again.'
        }
        actions={
          <>
            <Button className="w-full" onClick={() => void me.refetch()}>
              <RefreshCw size={16} className={clsx(retrying && 'animate-spin')} />
              {retrying ? 'Trying again…' : 'Try again'}
            </Button>
            <a href={signOutUrl()} className="text-sm text-ink-500 hover:text-ink-900">
              Sign out
            </a>
          </>
        }
      />
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
