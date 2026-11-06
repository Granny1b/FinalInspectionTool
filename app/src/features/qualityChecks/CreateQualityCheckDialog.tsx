import { LoaderCircle } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../lib/api';
import { qualityCheckHref, useCreateTemplate } from '../templates/queries';
import { NameField } from './NameField';

type Props = {
  /** The machine's final inspection template. */
  parentId: string;
  machineName: string;
  /** The machine's other quality checks. */
  taken: readonly { name: string }[];
  onClose: () => void;
};

/** Asks a new quality check's name, creates its empty draft and opens it. */
export function CreateQualityCheckDialog({ parentId, machineName, taken, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const create = useCreateTemplate();
  const [name, setName] = useState('');
  const close = () => dialogRef.current?.close();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { kind: 'quality', parentId, name },
      {
        onSuccess: (created) => navigate(qualityCheckHref(parentId, created.detail.draft.id)),
      },
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title="New quality check"
      description={`An in-process check along the build of ${machineName}. It starts as an empty draft: fill in its front page, add sections and rows, then publish it.`}
      onClose={onClose}
      busy={create.isPending}
    >
      <form onSubmit={submit} className="mt-6 space-y-5">
        <NameField name={name} taken={taken} onChange={setName} />
        {create.isError && (
          <p role="alert" className="text-sm font-medium text-nok-fg">
            {errorMessage(create.error)}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {create.isPending && (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            )}
            {create.isPending ? 'Creating…' : 'Create quality check'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
