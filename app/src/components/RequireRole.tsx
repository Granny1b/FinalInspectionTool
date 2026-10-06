import { hasRole, type Role } from '@modig/shared';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { Outlet } from 'react-router';
import { useCurrentUser } from '../lib/useMe';
import { ButtonLink } from './Button';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';

const ROLE_NAMES: Record<Role, string> = { admin: 'Admins', inspector: 'Inspectors' };

/**
 * Route guard for pages meant for one role. This only shapes the UI — the API checks the role
 * again on every request.
 */
export function RequireRole({ role }: { role: Role }) {
  const me = useCurrentUser();
  if (hasRole(me.roles, role)) return <Outlet />;

  return (
    <>
      <PageHeader title={`${ROLE_NAMES[role]} only`} description="You don't have access to this page." />
      <EmptyState
        icon={LockKeyhole}
        title={`This page is for Quality ${ROLE_NAMES[role].toLowerCase()}`}
        hint="If you need it for your work, ask a Quality admin to change your role."
        action={
          <ButtonLink to="/inspections" variant="secondary">
            <ArrowLeft size={16} />
            Back to inspections
          </ButtonLink>
        }
      />
    </>
  );
}
