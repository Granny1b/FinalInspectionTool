import clsx from 'clsx';
import { LoaderCircle } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, INPUT } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { MachineModelFields } from './MachineModelFields';
import {
  defaultTemplateName,
  initialChoice,
  modelLabel,
  resolvedModel,
  type ModelChoice,
  type ModelContext,
} from './modelChoice';
import { useCreateTemplate } from './queries';

type Props = {
  /** The settings' models, which have a template and which don't (one per model, brief §1). */
  models: ModelContext;
  onClose: () => void;
};

/**
 * Picks a model (or names a new one) and a name, creates an empty draft and opens it in the
 * editor.
 */
export function CreateTemplateDialog({ models, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const create = useCreateTemplate();
  const [choice, setChoice] = useState<ModelChoice>(() => initialChoice(models));
  const [name, setName] = useState(() => defaultTemplateName(modelLabel(choice, models)));
  // The name follows the model until the user types their own.
  const [nameEdited, setNameEdited] = useState(false);
  const close = () => dialogRef.current?.close();
  const model = resolvedModel(choice, models);

  function changeModel(next: ModelChoice) {
    setChoice(next);
    if (!nameEdited) setName(defaultTemplateName(modelLabel(next, models)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!model) return;
    const { modelName: _name, ...fields } = model;
    create.mutate(
      { name: name.trim(), ...fields },
      { onSuccess: (created) => navigate(`/templates/${created.detail.draft.id}`) },
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
        <MachineModelFields choice={choice} context={models} onChange={changeModel} />
        <TemplateNameField
          value={name}
          onChange={(value) => {
            setName(value);
            setNameEdited(true);
          }}
        />

        {create.isError && (
          <p role="alert" className="text-sm font-medium text-nok-fg">
            {errorMessage(create.error)}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || !name.trim() || !model}>
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

/** The new template's name (also in Import JSON). */
export function TemplateNameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Template name">
      {(control) => (
        <input
          {...control}
          required
          maxLength={200}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={clsx(INPUT, 'h-9')}
        />
      )}
    </Field>
  );
}
