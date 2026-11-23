import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, INPUT } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { MachineModelFields } from '../templates/MachineModelFields';
import {
  initialChoice,
  resolvedModel,
  type ModelChoice,
  type ModelContext,
} from '../templates/modelChoice';
import { assemblyHref, useCreateTemplate } from '../templates/queries';
import { ASSEMBLY_MODEL_HINT } from './models';

type Props = {
  models: ModelContext;
  onClose: () => void;
};

/** Asks a new assembly instruction's machine model and name, creates its empty draft and opens it. */
export function CreateAssemblyDialog({ models, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const create = useCreateTemplate();
  const [choice, setChoice] = useState<ModelChoice>(() => initialChoice(models));
  const [name, setName] = useState('');
  const model = resolvedModel(choice, models);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!model || !name.trim()) return;
    const { modelName: _name, ...fields } = model;
    create.mutate(
      { kind: 'assembly', name: name.trim(), ...fields },
      { onSuccess: (created) => navigate(assemblyHref(created.detail.draft.id)) },
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title="New assembly instruction"
      description="The build of a machine as tasks of steps. It starts as an empty draft: add tasks and steps, then publish it."
      onClose={onClose}
      busy={create.isPending}
    >
      <form onSubmit={submit} className="mt-6 space-y-5">
        <MachineModelFields
          choice={choice}
          context={models}
          onChange={setChoice}
          existingHint={ASSEMBLY_MODEL_HINT}
        />
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
          <Button type="submit" disabled={create.isPending || !name.trim() || !model}>
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
