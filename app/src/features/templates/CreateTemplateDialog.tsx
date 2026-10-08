import type { MachineModel } from '@modig/shared';
import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, INPUT } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { useCreateTemplate } from './queries';

type Props = {
  /** Models that don't have a template yet (one template per model, brief §1). */
  models: MachineModel[];
  onClose: () => void;
};

/** Same pattern as the seeded "Final inspection – RigiMill MG". */
const defaultName = (model: MachineModel | undefined) =>
  model ? `Final inspection – ${model.name}` : '';

/** Picks a model and a name, creates an empty draft and opens it in the editor. */
export function CreateTemplateDialog({ models, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const create = useCreateTemplate();
  const [modelCode, setModelCode] = useState(models[0]?.code ?? '');
  const [name, setName] = useState(defaultName(models[0]));
  // The name follows the model until the user types their own.
  const [nameEdited, setNameEdited] = useState(false);
  const close = () => dialogRef.current?.close();

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      { name: name.trim(), modelCode },
      { onSuccess: (created) => navigate(`/templates/${created.detail.draft.id}`) },
    );
  }

  if (models.length === 0) {
    return (
      <Dialog
        dialogRef={dialogRef}
        title="Every machine model has a template"
        description="There is one template per machine model. Open the model's template to change its checklist."
        onClose={onClose}
      >
        <div className="mt-6 flex justify-end">
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title="New template"
      description="It starts as an empty draft. Add sections and rows, then publish it."
      onClose={onClose}
      busy={create.isPending}
    >
      <form onSubmit={submit} className="mt-6 space-y-5">
        <Field label="Machine model" hint="Each machine model has one template.">
          {(control) => (
            <select
              {...control}
              value={modelCode}
              onChange={(event) => {
                setModelCode(event.target.value);
                if (!nameEdited) {
                  setName(defaultName(models.find((model) => model.code === event.target.value)));
                }
              }}
              className={clsx(INPUT, 'h-9')}
            >
              {models.map((model) => (
                <option key={model.code} value={model.code}>
                  {model.name} ({model.code})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Template name">
          {(control) => (
            <input
              {...control}
              required
              maxLength={200}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setNameEdited(true);
              }}
              className={clsx(INPUT, 'h-9')}
            />
          )}
        </Field>

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
            {create.isPending ? 'Creating…' : 'Create template'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
