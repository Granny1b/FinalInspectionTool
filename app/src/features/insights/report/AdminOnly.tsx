import { hasRole } from '@modig/shared';
import { Outlet } from 'react-router';
import { RequireRole } from '../../../components/RequireRole';
import { useCurrentUser } from '../../../lib/useMe';
import { PrintMessage } from '../../print/PrintStates';

/**
 * Admins only, like Insights itself (the API checks again). A print route has no app shell, so
 * the app's "Admins only" page is set in the print routes' message column instead.
 */
export function AdminOnly() {
  const me = useCurrentUser();
  if (hasRole(me.roles, 'admin')) return <Outlet />;
  return (
    <PrintMessage>
      <RequireRole role="admin" />
    </PrintMessage>
  );
}
