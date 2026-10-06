import { hasRole, type Me } from '@modig/shared';
import clsx from 'clsx';
import {
  ChartColumn,
  ClipboardCheck,
  LayoutTemplate,
  LogOut,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';
import { NavLink } from 'react-router';
import { signOutUrl } from '../lib/auth';
import { Logo } from './Logo';
import { RoleBadge } from './RoleBadge';

type NavItem = { to: string; label: string; icon: LucideIcon };

const MAIN_NAV: NavItem[] = [
  { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
];
const ADMIN_NAV: NavItem[] = [
  { to: '/insights', label: 'Insights', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
];

type Props = {
  me: Me;
  /** Called when a nav link is clicked, so the mobile drawer can close. */
  onNavigate?: () => void;
  /** When given, a close button is shown (mobile drawer). */
  onClose?: () => void;
};

/** Logo, navigation and the signed-in user. Used by the desktop sidebar and the mobile drawer. */
export function Sidebar({ me, onNavigate, onClose }: Props) {
  const adminLabelId = useId();
  return (
    // A landmark, so the user panel (and Sign out) is reachable by landmark navigation too.
    <aside aria-label="Sidebar" className="flex h-full flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-ink-100 px-5">
        <Logo className="h-8" />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="-mr-2 flex size-10 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-5">
        <NavList items={MAIN_NAV} onNavigate={onNavigate} />
        {hasRole(me.roles, 'admin') && (
          <>
            {/* A list label, not a heading: the sidebar comes before the page's <h1>. */}
            <p
              id={adminLabelId}
              className="mt-7 mb-2 px-3 text-xs font-medium tracking-wide text-ink-500 uppercase"
            >
              Admin
            </p>
            <NavList items={ADMIN_NAV} onNavigate={onNavigate} labelledBy={adminLabelId} />
          </>
        )}
      </nav>

      <UserPanel me={me} />
    </aside>
  );
}

type NavListProps = { items: NavItem[]; onNavigate?: () => void; labelledBy?: string };

function NavList({ items, onNavigate, labelledBy }: NavListProps) {
  return (
    <ul className="space-y-0.5" aria-labelledby={labelledBy}>
      {items.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          {/* NavLink sets aria-current="page" on the active link. */}
          <NavLink
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  strokeWidth={1.75}
                  className={clsx(
                    isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600',
                  )}
                />
                {label}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function UserPanel({ me }: { me: Me }) {
  // The API may only know the email (SWA passes no name claim); don't show it twice.
  const displayName = me.name || me.email;
  return (
    <div className="border-t border-ink-200 p-3">
      <div className="flex items-center gap-3 px-2 py-1.5">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800"
        >
          {initials(displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-900" title={displayName}>
            {displayName}
          </p>
          {me.email !== displayName && (
            <p className="truncate text-xs text-ink-500" title={me.email}>
              {me.email}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 pr-1 pl-2">
        <RoleBadge roles={me.roles} />
        <a
          href={signOutUrl()}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <LogOut size={14} />
          Sign out
        </a>
      </div>
    </div>
  );
}

/** "Sam Andersson" → "SA", "sam.andersson@modig.se" → "SA". */
function initials(name: string): string {
  const local = name.split('@')[0] ?? name;
  const words = local.split(/[\s._-]+/).filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || '?'
  );
}
