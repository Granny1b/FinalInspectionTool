import type { QualityCheckExport } from '@modig/shared';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../lib/api';
import { qualityCheckHref, useImportTemplate } from '../templates/queries';
import { PositionFields } from './PositionFields';

type Props = {
  /** A file that passed the checks (transfer.ts), and what it was called. */
  file: QualityCheckExport;
  fileName: string;
  /** The machine it is imported on: its final inspection template. */
  parentId: string;
  machineName: string;
  /** The machine's other quality checks. */
  taken: readonly { position: string; title: string }[];
  onClose: () => void;
};

/**
 * Import JSON on a machine's Quality checks tab: the file's quality check becomes a new,
 * unpublished draft of this machine, under the position and operation chosen here (the file's to
 * start with). Opens it in the editor, after saying how many pictures were left out when there
 * were any.
 */
export function ImportQualityCheckDialog({
  file,
  fileName,
  parentId,
  machineName,
  taken,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const importing = useImportTemplate();
  const { quality, sections } = file.qualityCheck;
  const [title, setTitle] = useState({
    position: quality.position,
    operation: quality.operation,
  });
  const [imported, setImported] = useState<{ id: string; droppedImages: number } | null>(null);
  const close = () => dialogRef.current?.close();
  const rows = sections.reduce((count, section) => count + section.items.length, 0);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.position.trim()) return;
    importing.mutate(
      { kind: 'quality', parentId, ...title, file },
      {
        onSuccess: ({ loaded, droppedImages }) => {
          const id = loaded.detail.draft.id;
          if (droppedImages === 0) void navigate(qualityCheckHref(parentId, id));
          else setImported({ id, droppedImages });
        },
      },
    );
  }

  if (imported) {
    const pictures =
      imported.droppedImages === 1 ? 'One picture' : `${imported.droppedImages} pictures`;
    return (
      <Dialog
        dialogRef={dialogRef}
        title="Quality check imported"
        description={
          <p className="flex items-start gap-2">
            <CircleCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ok-fg" />
            <span>
              {`It is a new draft. ${pictures} from the file ${
                imported.droppedImages === 1 ? 'was' : 'were'
              } left out: ${
                imported.droppedImages === 1 ? 'it is' : 'they are'
              } not stored in this installation. Add them again in the editor if you need them.`}
            </span>
          </p>
        }
        onClose={onClose}
      >
        <div className="mt-6 flex justify-end">
          <Button autoFocus onClick={() => void navigate(qualityCheckHref(parentId, imported.id))}>
            Open quality check
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title="Import quality check"
      description={
        <>
          From “{fileName}”: {sections.length === 1 ? '1 section' : `${sections.length} sections`},{' '}
          {rows === 1 ? '1 row' : `${rows} rows`}. It becomes a new draft for {machineName};
          pictures come along only if they are stored in this installation.
        </>
      }
      onClose={onClose}
      busy={importing.isPending}
    >
      <form onSubmit={submit} className="mt-6 space-y-5">
        <PositionFields
          {...title}
          taken={taken}
          onChange={(patch) => setTitle((current) => ({ ...current, ...patch }))}
        />
        {importing.isError && (
          <p role="alert" className="text-sm font-medium text-nok-fg">
            {errorMessage(importing.error)}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={close} disabled={importing.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={importing.isPending || !title.position.trim()}>
            {importing.isPending && (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            )}
            {importing.isPending ? 'Importing…' : 'Import quality check'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
