import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, INPUT } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { assemblyEditorHref, useCreateTemplate } from '../templates/queries';
import type { AssemblyMachine } from './models';

type Props = {
  /** The machine template it is made under: its model is the instruction's. */
  machine: AssemblyMachine;
  onClose: () => void;
};

/** Asks a new assembly instruction's name, creates its empty draft for the model and opens it. */
export function CreateAssemblyDialog({ machine, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const create = useCreateTemplate();
  const [name, setName] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { kind: 'assembly', name: name.trim(), modelCode: machine.modelCode },
      {
        onSuccess: (created) =>
          navigate(assemblyEditorHref(machine.templateId, created.detail.draft.id)),
      },
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title="New assembly instruction"
      description={`The build of ${machine.modelName} as tasks of steps. It starts as an empty draft: add tasks and steps, then publish it.`}
      onClose={onClose}
      busy={create.isPending}
    >
      <form onSubmit={submit} className="mt-6 space-y-5">
        <Field label="Name" hint="What this build is called, such as “HHV-3 24-Tools scheme”.">
          {(control) => (
            <input
              {...control}
              required
              maxLength={200}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
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
          <Button
            variant="secondary"
            onClick={() => dialogRef.current?.close()}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {create.isPending && (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            )}
            {create.isPending ? 'Creating…' : 'Create instruction'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
