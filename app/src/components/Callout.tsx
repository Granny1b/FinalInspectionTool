import clsx from 'clsx';
import { CircleAlert, CircleCheck, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const TONES: Record<'error' | 'success', { box: string; icon: LucideIcon }> = {
  error: { box: 'border-nok-border bg-nok-bg text-nok-fg', icon: CircleAlert },
  success: { box: 'border-ok-border bg-ok-bg text-ok-fg', icon: CircleCheck },
};

type Props = {
  tone: keyof typeof TONES;
  /** `alert` interrupts a screen reader; `status` waits for a pause. */
  role: 'alert' | 'status';
  children: ReactNode;
  /** Buttons at the end of the line. */
  actions?: ReactNode;
  onDismiss?: () => void;
};

/** A one-line message across the page: a conflict, a failed save, a successful publish. */
export function Callout({ tone, role, children, actions, onDismiss }: Props) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div
      role={role}
      className={clsx(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3',
        box,
      )}
    >
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      <div className="min-w-0 flex-1 text-sm text-ink-900">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-my-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-900/5 hover:text-ink-900"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
