import { hasRole, type Me } from '@modig/shared';
import clsx from 'clsx';
import {
  ChartColumn,
  ClipboardCheck,
  Factory,
  Flag,
  LayoutTemplate,
  ListChecks,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';
import { NavLink } from 'react-router';
import { useOpenChangeRequests } from '../features/changeRequests/queries';
import { useSettings } from '../lib/useSettings';
import { signOutUrl } from '../lib/auth';
import { NAV_ITEM_HEIGHT, USER_PANEL, USER_PANEL_ROW } from './layout';
import { Logo } from './Logo';
import { RoleBadge } from './RoleBadge';
import { ThemeToggle } from './ThemeToggle';

/** `count` is shown as a badge when above zero: something waiting there (open change requests). */
type NavItem = { to: string; label: string; icon: LucideIcon; count?: number };
type NavGroupItems = { label: string; items: NavItem[] };

/** First, without a group label: the machines being built, where their checks are started. */
const MACHINES_NAV: NavItem[] = [{ to: '/machines', label: 'Machines', icon: Factory }];

/**
 * What everyone sees, a group to a kind of work, in the order a machine goes through them: it is
 * assembled, checked along the build, and inspected before delivery. The checks each have the log
 * of their deviations. Then the templates the checks are made from.
 */
/** The group the settings can hide. */
const ASSEMBLY = 'Assembly';

const NAV_GROUPS: NavGroupItems[] = [
  // How the machines are built: the assembly instructions, read by everyone.
  { label: ASSEMBLY, items: [{ to: '/assembly', label: 'Instructions', icon: Wrench }] },
  {
    label: 'Quality check',
    items: [
      { to: '/quality-checks', label: 'Quality checks', icon: ShieldCheck },
      { to: '/deviations/quality', label: 'Deviations', icon: ListChecks },
    ],
  },
  {
    label: 'Final inspection',
    items: [
      { to: '/inspections', label: 'Inspections', icon: ClipboardCheck },
      { to: '/deviations/final', label: 'Deviations', icon: ListChecks },
    ],
  },
  { label: 'Setup', items: [{ to: '/templates', label: 'Templates', icon: LayoutTemplate }] },
];
const ADMIN_NAV: NavItem[] = [
  // Steps of assembly instructions that readers flagged as wrong, for the admins to fix.
  { to: '/change-requests', label: 'Change requests', icon: Flag },
  { to: '/insights', label: 'Insights', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
];

type Props = {
  me: Me;
  /** Called when a nav link is clicked, so the mobile drawer can close. */
  onNavigate?: () => void;
  /** When given, a close button is shown (mobile drawer). */
  onClose?: () => void;
  /** Opens the search over everything. */
  onSearch?: (() => void) | undefined;
};

/**
 * Logo, navigation, the signed-in user and the theme. Used by the desktop sidebar and the mobile
 * drawer, whose theme controls stay in step (one store, lib/theme.ts).
 */
export function Sidebar({ me, onNavigate, onClose, onSearch }: Props) {
  const isAdmin = hasRole(me.roles, 'admin');
  const open = useOpenChangeRequests(isAdmin).data ?? 0;
  const adminNav = ADMIN_NAV.map((item) =>
    item.to === '/change-requests' ? { ...item, count: open } : item,
  );
  // Assembly is in the menu when the settings say so (an admin's switch on the Settings page).
  // Not shown until they have loaded, so it never flashes by where it is switched off.
  const showAssembly = useSettings().data?.showAssembly === true;
  const groups = showAssembly ? NAV_GROUPS : NAV_GROUPS.filter(({ label }) => label !== ASSEMBLY);
  return (
    // A landmark, so the user panel (and Sign out) is reachable by landmark navigation too.
    <aside aria-label="Sidebar" className="flex h-full flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-ink-100 px-5">
        <Logo className="h-10" />
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

      {onSearch && (
        <div className="px-3 pt-4">
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              onSearch();
            }}
            aria-keyshortcuts="Control+K"
            className="flex h-9 w-full items-center gap-2.5 rounded-md border border-ink-200 bg-canvas px-3 text-sm text-ink-500 transition-colors hover:border-ink-300 hover:text-ink-800"
          >
            <Search size={15} aria-hidden="true" />
            Search
            <kbd className="ml-auto rounded border border-ink-200 bg-surface px-1.5 text-[0.6875rem] text-ink-500">
              Ctrl K
            </kbd>
          </button>
        </div>
      )}
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-5">
        <NavList items={MACHINES_NAV} onNavigate={onNavigate} label="Machines" />
        {groups.map(({ label, items }) => (
          <NavGroup
            key={label}
            label={label}
            items={items}
            onNavigate={onNavigate}
            className={GROUP_GAP}
          />
        ))}
        {isAdmin && (
          <NavGroup label="Admin" items={adminNav} onNavigate={onNavigate} className={GROUP_GAP} />
        )}
      </nav>

      <UserPanel me={me} />
    </aside>
  );
}

/** Between two groups: less than a group's own height, so four groups fit a 720 px laptop. */
const GROUP_GAP = 'mt-5';

type NavGroupProps = {
  label: string;
  items: NavItem[];
  onNavigate?: () => void;
  className?: string;
};

/** Links under a small label ("Final inspection", "Admin"), which names the list for screen readers. */
function NavGroup({ label, items, onNavigate, className }: NavGroupProps) {
  const labelId = useId();
  return (
    <div className={className}>
      {/* A list label, not a heading: the sidebar comes before the page's <h1>. */}
      <p
        id={labelId}
        className="mb-2 px-3 text-xs font-medium tracking-wide text-ink-500 uppercase"
      >
        {label}
      </p>
      <NavList items={items} onNavigate={onNavigate} labelledBy={labelId} />
    </div>
  );
}

type NavListProps = {
  items: NavItem[];
  onNavigate?: () => void;
  /** The id of the group's label; or, for a list without one shown, its name. */
  labelledBy?: string;
  label?: string;
};

function NavList({ items, onNavigate, labelledBy, label }: NavListProps) {
  return (
    <ul className="space-y-0.5" aria-labelledby={labelledBy} aria-label={label}>
      {items.map(({ to, label, icon: Icon, count = 0 }) => (
        <li key={to}>
          {/* NavLink sets aria-current="page" on the active link. */}
          <NavLink
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                NAV_ITEM_HEIGHT,
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
                {count > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-nok-solid px-1.5 text-xs font-semibold text-white tabular-nums">
                    {count}
                    <span className="sr-only"> open</span>
                  </span>
                )}
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
    // Laid out like its skeleton in LoadingShell: change both.
    <div className={USER_PANEL}>
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
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-md px-2 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900',
            USER_PANEL_ROW,
          )}
        >
          <LogOut size={14} />
          Sign out
        </a>
      </div>
      <div className="mt-3 px-2 pb-1">
        <ThemeToggle />
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
