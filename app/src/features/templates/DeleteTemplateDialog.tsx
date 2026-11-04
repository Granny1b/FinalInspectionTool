import { LoaderCircle } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../lib/api';

type Props = {
  /** The template's name as the editor shows it. */
  name: string;
  /** Published revisions that go with it. */
  revisions: number;
  busy: boolean;
  /** The failed delete's reason, if it failed. */
  error: unknown;
  onDelete: () => void;
  onClose: () => void;
};

/** Asks before a template is deleted for good; inspections made from it are kept. */
export function DeleteTemplateDialog({ name, revisions, busy, error, onDelete, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const history =
    revisions === 0
      ? 'Its draft'
      : `Its draft and ${revisions === 1 ? 'its published revision' : `all ${revisions} published revisions`}`;
  return (
    <Dialog
      dialogRef={dialogRef}
      title={`Delete “${name}”?`}
      description={
        <>
          {history} will be deleted; this can’t be undone. Inspections already made from it are
          kept, with their checklists, reports and deviations.
        </>
      }
      onClose={onClose}
      busy={busy}
    >
      {error !== null && (
        <p role="alert" className="mt-4 text-sm font-medium text-nok-fg">
          {errorMessage(error)}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        {/* First, so showModal() focuses the safe choice. */}
        <Button variant="secondary" onClick={() => dialogRef.current?.close()} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onDelete} disabled={busy}>
          {busy && <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />}
          {busy ? 'Deleting…' : 'Delete template'}
        </Button>
      </div>
    </Dialog>
  );
}
