import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { AriaRole, ReactNode } from 'react';

type Props = {
  icon: LucideIcon;
  /** Brand for an empty list, NOK red for a failed request. */
  tone: 'brand' | 'nok';
  title: string;
  /** One line under the title. */
  hint: string;
  action?: ReactNode;
  role?: AriaRole;
};

const TONES = {
  brand: 'bg-brand-50 text-brand-600 ring-brand-100',
  nok: 'bg-nok-bg text-nok-fg ring-nok-border',
};

/**
 * The card in a page's content slot when there is nothing to show: EmptyState and LoadError.
 * One shell, so the card keeps its height and its icon its shape when one replaces the other
 * (an error, then the empty list after Try again); only the tone differs.
 */
export function StateCard({ icon: Icon, tone, title, hint, action, role }: Props) {
  return (
    <section
      role={role}
      className="rounded-lg border border-ink-200 bg-surface px-6 py-14 text-center"
    >
      <div
        className={clsx(
          'mx-auto flex size-11 items-center justify-center rounded-xl ring-1',
          TONES[tone],
        )}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-ink-900">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-balance text-ink-500">{hint}</p>
      {action && <div className="mt-6 flex justify-center gap-2">{action}</div>}
    </section>
  );
}
