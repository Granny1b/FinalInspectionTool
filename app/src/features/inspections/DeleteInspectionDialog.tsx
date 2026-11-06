import { INSPECTION_NOUNS, type InspectionKind } from '@modig/shared';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage, isConflict } from '../../lib/api';

type Props = {
  /** A final inspection or a quality check: the dialog says which. */
  kind?: InspectionKind;
  /** "FI-2026-0012" */
  number: string;
  /** The Machine ID as the page shows it; may be empty. */
  machine: string;
  finalised: boolean;
  busy: boolean;
  /** The failed delete's reason, if it failed. */
  error: unknown;
  onDelete: () => void;
  /** After a conflict: loads the inspection again (asking first if something is unsaved). */
  onReload: () => void;
  onClose: () => void;
};

/**
 * Asks before an admin deletes an inspection for good, and says what goes with it. If someone
 * else saved it in between (412), nothing was deleted: it says so and offers Reload instead.
 */
export function DeleteInspectionDialog({
  kind = 'final',
  number,
  machine,
  finalised,
  busy,
  error,
  onDelete,
  onReload,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = () => dialogRef.current?.close();
  const conflict = isConflict(error);
  const noun = INSPECTION_NOUNS[kind];
  // Reload takes the place of the button that had the focus: it takes the focus too.
  const reloadRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (conflict) reloadRef.current?.focus();
  }, [conflict]);
  return (
    <Dialog
      dialogRef={dialogRef}
      title={`Delete ${number}?`}
      description={
        <>
          {machine ? `The ${noun} of ${machine}` : `The ${noun}`}, its deviation photos and its
          deviation records will be deleted, and Insights stops counting it. This can’t be undone.
          {finalised &&
            kind === 'final' &&
            ' It is finalised, so its report may already have been sent.'}
        </>
      }
      onClose={onClose}
      busy={busy}
    >
      {error !== null && (
        <p role="alert" className="mt-4 text-sm font-medium text-nok-fg">
          {conflict
            ? `Someone else changed this ${noun} since you opened it, so nothing was deleted. Reload to see their changes, then delete it if you still want to.`
            : errorMessage(error)}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        {/* First, so showModal() focuses the safe choice. */}
        <Button variant="secondary" onClick={close} disabled={busy}>
          Cancel
        </Button>
        {conflict ? (
          <Button
            ref={reloadRef}
            onClick={() => {
              close();
              onReload();
            }}
          >
            <RefreshCw size={16} aria-hidden="true" />
            Reload
          </Button>
        ) : (
          // aria-disabled while deleting: a disabled button would drop the keyboard focus.
          <Button
            variant="danger"
            onClick={() => {
              if (!busy) onDelete();
            }}
            aria-disabled={busy || undefined}
            className="aria-disabled:opacity-50"
          >
            {busy && <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />}
            {busy ? 'Deleting…' : `Delete ${noun}`}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
