import { FOLLOW_UP_STATUS_LABELS, type FollowUpRequest, type FollowUpStatus } from '@modig/shared';
import clsx from 'clsx';
import { CircleCheck, CircleDot, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useCurrentUser } from '../../lib/useMe';
import { FollowUpDialog } from './FollowUpDialog';

/** A deviation as its follow-up actions need it. */
export type FollowUpTarget = {
  /** "QC-2026-0004 · D-03" */
  deviationId: string;
  description: string;
  status: FollowUpStatus;
  action: string;
  closedOn: string;
  closedBy: string;
};

type Props = {
  target: FollowUpTarget;
  /** Being saved: the buttons wait. */
  pending: boolean;
  onChange: (request: FollowUpRequest) => void;
  className?: string;
};

/**
 * Close… for an open deviation; Edit and Reopen for a closed one (reopening asks first). The
 * deviation's ID is in each button's name for a screen reader, which hears them out of the row.
 */
export function FollowUpActions({ target, pending, onChange, className }: Props) {
  const me = useCurrentUser();
  const [dialog, setDialog] = useState<'close' | 'reopen' | null>(null);
  const forId = <span className="sr-only"> {target.deviationId}</span>;
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
      {pending && (
        <span role="status" className="inline-flex items-center gap-1.5 text-xs text-ink-500">
          <LoaderCircle size={14} aria-hidden="true" className="animate-spin" />
          Saving…
        </span>
      )}
      {target.status === 'open' ? (
        <Button variant="secondary" disabled={pending} onClick={() => setDialog('close')}>
          Close…{forId}
        </Button>
      ) : (
        <>
          <Button variant="ghost" disabled={pending} onClick={() => setDialog('close')}>
            Edit{forId}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setDialog('reopen')}>
            Reopen…{forId}
          </Button>
        </>
      )}
      {dialog === 'close' && (
        <FollowUpDialog
          deviationId={target.deviationId}
          description={target.description}
          current={target}
          me={me.name || me.email}
          onSubmit={onChange}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reopen' && (
        <ConfirmDialog
          title={`Reopen ${target.deviationId}?`}
          message="It counts as open again. What was done stays; the closing date and name are cleared."
          confirmLabel="Reopen"
          confirmVariant="primary"
          onConfirm={() => {
            setDialog(null);
            onChange({ status: 'open' });
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

const PILLS: Record<FollowUpStatus, { tone: string; icon: typeof CircleDot }> = {
  open: { tone: 'bg-brand-50 text-brand-700 ring-brand-200', icon: CircleDot },
  closed: { tone: 'bg-ok-bg text-ok-fg ring-ok-border', icon: CircleCheck },
};

/** "Open" or "Closed", in words with an icon, never by colour alone. */
export function StatusPill({ status }: { status: FollowUpStatus }) {
  const { tone, icon: Icon } = PILLS[status];
  return (
    <span
      className={clsx(
        'inline-flex h-6 items-center gap-1 rounded-full pr-2.5 pl-2 text-xs font-semibold whitespace-nowrap ring-1 ring-inset',
        tone,
      )}
    >
      <Icon size={13} aria-hidden="true" />
      {FOLLOW_UP_STATUS_LABELS[status]}
    </span>
  );
}
