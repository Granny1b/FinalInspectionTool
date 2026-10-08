import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { useLeaveGuard } from './useLeaveGuard';

type LeaveProps = {
  guard: ReturnType<typeof useLeaveGuard>;
  conflict: boolean;
  /** "template", "inspection". */
  noun: string;
};

/**
 * "Leave without saving?", when an open editor has changes or saving before following a link
 * failed (useLeaveGuard).
 */
export function LeaveDialog({ guard, conflict, noun }: LeaveProps) {
  if (!guard.question) return null;
  return (
    <ConfirmDialog
      title="Leave without saving?"
      message={
        guard.question === 'editor'
          ? 'The open editor has changes that aren’t saved yet. They are lost if you leave now.'
          : conflict
            ? `Someone else changed this ${noun}, so your latest changes couldn’t be saved. They are lost if you leave.`
            : 'Your latest changes couldn’t be saved yet. They are lost if you leave now.'
      }
      confirmLabel="Leave"
      onConfirm={guard.leave}
      onCancel={guard.stay}
    />
  );
}
