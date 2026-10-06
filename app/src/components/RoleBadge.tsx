import { hasRole } from '@modig/shared';
import clsx from 'clsx';

/** Shows the user's most powerful app role. */
export function RoleBadge({ roles }: { roles: readonly string[] }) {
  const isAdmin = hasRole(roles, 'admin');
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        isAdmin ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-ink-100 text-ink-600 ring-ink-200',
      )}
    >
      {isAdmin ? 'Admin' : 'Inspector'}
    </span>
  );
}
