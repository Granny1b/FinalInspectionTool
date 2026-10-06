import clsx from 'clsx';
import type { ReactNode } from 'react';

const TONES = {
  neutral: 'bg-ink-100 text-ink-600 ring-ink-200',
  /** Published. */
  ok: 'bg-ok-bg text-ok-fg ring-ok-border',
  /** Something for an admin to act on, e.g. unpublished changes. */
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
} as const;

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/** "Rev 2" for a published template, else "Not published". */
export function PublishedBadge({ revision }: { revision: number | null }) {
  return revision === null ? <Badge>Not published</Badge> : <Badge tone="ok">Rev {revision}</Badge>;
}
