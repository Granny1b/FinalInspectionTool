import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { useLeaveGuard } from './useLeaveGuard';

type LeaveProps = {
  guard: ReturnType<typeof useLeaveGuard>;
  conflict: boolean;
  /** "template", "inspection". */
  noun: string;
};

/** "Leave without saving?", when saving before following a link failed (useLeaveGuard). */
export function LeaveDialog({ guard, conflict, noun }: LeaveProps) {
  if (!guard.asking) return null;
  return (
    <ConfirmDialog
      title="Leave without saving?"
      message={
        conflict
          ? `Someone else changed this ${noun}, so your latest changes couldn’t be saved. They are lost if you leave.`
          : 'Your latest changes couldn’t be saved yet. They are lost if you leave now.'
      }
      confirmLabel="Leave"
      onConfirm={guard.leave}
      onCancel={guard.stay}
    />
  );
}
