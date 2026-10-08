import { Outlet } from 'react-router';
import { AccountError } from '../../components/AccountError';
import { useMe } from '../../lib/useMe';
import { PrintLoading } from './PrintStates';

/**
 * Layout of the print routes: no sidebar, so the page is just the preview, but like the app
 * shell it renders its pages only once the signed-in user (/api/me) has loaded.
 */
export function PrintShell() {
  const me = useMe();
  if (me.isPending) return <PrintLoading />;
  if (me.isError) {
    return (
      <AccountError error={me.error} retrying={me.isFetching} onRetry={() => void me.refetch()} />
    );
  }
  return <Outlet />;
}
