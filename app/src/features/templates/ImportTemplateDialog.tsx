import type { TemplateExport } from '@modig/shared';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../lib/api';
import { TemplateNameField } from './CreateTemplateDialog';
import { MachineModelFields } from './MachineModelFields';
import {
  defaultTemplateName,
  initialChoice,
  modelLabel,
  resolvedModel,
  type ModelChoice,
  type ModelContext,
} from './modelChoice';
import { useImportTemplate } from './queries';

type Props = {
  /** A file that passed the checks (transfer.ts), and what it was called. */
  file: TemplateExport;
  fileName: string;
  models: ModelContext;
  onClose: () => void;
};

/**
 * Import JSON: the file's checklist becomes a new, unpublished draft for a model without a
 * template (or a new model) under the name chosen here. Opens it in the editor, after saying how
 * many images were left out when there were any.
 */
export function ImportTemplateDialog({ file, fileName, models, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const importing = useImportTemplate();
  const { template } = file;
  const [choice, setChoice] = useState<ModelChoice>(() =>
    initialChoice(models, { code: template.modelCode, name: template.modelName }),
  );
  // The file's name, unless it has none: then the name follows the model, as in New template.
  const [name, setName] = useState(
    () => template.name.trim() || defaultTemplateName(modelLabel(choice, models)),
  );
  const [nameEdited, setNameEdited] = useState(Boolean(template.name.trim()));
  const [imported, setImported] = useState<{ id: string; droppedImages: number } | null>(null);
  const close = () => dialogRef.current?.close();
  const model = resolvedModel(choice, models);
  const rows = template.sections.reduce((count, section) => count + section.items.length, 0);

  function changeModel(next: ModelChoice) {
    setChoice(next);
    if (!nameEdited) setName(defaultTemplateName(modelLabel(next, models)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!model) return;
    const { modelName: _name, ...fields } = model;
    importing.mutate(
      { name: name.trim(), ...fields, file },
      {
        onSuccess: ({ loaded, droppedImages }) => {
          const id = loaded.detail.draft.id;
          if (droppedImages === 0) void navigate(`/templates/${id}`);
          else setImported({ id, droppedImages });
        },
      },
    );
  }

  if (imported) {
    const images = imported.droppedImages === 1 ? 'One image' : `${imported.droppedImages} images`;
    return (
      <Dialog
        dialogRef={dialogRef}
        title="Template imported"
        description={
          <p className="flex items-start gap-2">
            <CircleCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ok-fg" />
            <span>
              {`It is a new draft. ${images} from the file ${
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
          <Button autoFocus onClick={() => void navigate(`/templates/${imported.id}`)}>
            Open template
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title="Import template"
      description={
        <>
          From “{fileName}”:{' '}
          {template.sections.length === 1 ? '1 section' : `${template.sections.length} sections`},{' '}
          {rows === 1 ? '1 row' : `${rows} rows`}. It becomes a new draft; images come along only if
          they are stored in this installation.
        </>
      }
      onClose={onClose}
      busy={importing.isPending}
    >
      <form onSubmit={submit} className="mt-6 space-y-5">
        <MachineModelFields choice={choice} context={models} onChange={changeModel} />
        <TemplateNameField
          value={name}
          onChange={(value) => {
            setName(value);
            setNameEdited(true);
          }}
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
          <Button type="submit" disabled={importing.isPending || !name.trim() || !model}>
            {importing.isPending && (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            )}
            {importing.isPending ? 'Importing…' : 'Import template'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
