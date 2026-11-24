import { formatMinutes, type Machine, type MachineAssemblySummary } from '@modig/shared';
import clsx from 'clsx';
import { CircleCheck, LoaderCircle, Plus, Trash2, Wrench } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ActionMenu } from '../../components/ActionMenu';
import { Button } from '../../components/Button';
import { buttonClasses } from '../../components/buttonClasses';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { INPUT } from '../../components/Field';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Badge } from '../templates/Badge';
import { assemblyInstructions, useTemplates } from '../templates/queries';
import { percentText } from './percent';
import { ProgressBar } from './Progress';
import {
  machineAssemblyHref,
  useAddMachineAssembly,
  useMachineAssemblies,
  useRemoveMachineAssembly,
} from './queries';

type Props = {
  machine: Machine;
  isAdmin: boolean;
  /** The section's id, for the page's overview to jump to. */
  id?: string;
};

/**
 * The machine's assembly instructions on its page: each with how far its sign-off has come (green
 * once every step is signed), and Add instruction to bind another of the model's. Admins remove
 * one, with its sign-offs.
 */
export function MachineAssemblySection({ machine, isAdmin, id }: Props) {
  const titleId = useId();
  const assemblies = useMachineAssemblies(machine.id);
  const templates = useTemplates();
  const remove = useRemoveMachineAssembly(machine.id);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MachineAssemblySummary | null>(null);
  const list = assemblies.data ?? [];
  // The model's published instructions the machine doesn't have yet.
  const available = assemblyInstructions(templates.data ?? []).filter(
    (instruction) =>
      instruction.publishedRevision !== null &&
      instruction.publishedModelCode === machine.modelCode &&
      !list.some((assembly) => assembly.templateId === instruction.id),
  );

  return (
    <section id={id} aria-labelledby={titleId} className="scroll-mt-24">
      <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-base font-semibold text-ink-900">
          Assembly
        </h2>
        {available.length > 0 && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={16} aria-hidden="true" />
            Add instruction
          </Button>
        )}
      </div>
      {assemblies.isPending ? (
        <p className="flex items-center gap-2 px-1 py-3 text-sm text-ink-500">
          <LoaderCircle size={14} aria-hidden="true" className="animate-spin" />
          Loading…
        </p>
      ) : assemblies.isError ? (
        <p role="alert" className="text-sm font-medium text-nok-fg">
          The assembly instructions could not be loaded. {errorMessage(assemblies.error)}
        </p>
      ) : list.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-ink-300 px-4 py-3.5 text-sm text-ink-500">
          <Wrench size={16} aria-hidden="true" className="shrink-0 text-ink-400" />
          {available.length > 0
            ? 'No assembly instruction on this machine yet. Add one with Add instruction.'
            : 'No assembly instruction on this machine, and none is published for its model yet.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((assembly) => (
            <AssemblyCard
              key={assembly.id}
              assembly={assembly}
              isAdmin={isAdmin}
              onRemove={() => {
                remove.reset();
                setRemoving(assembly);
              }}
            />
          ))}
        </ul>
      )}
      {remove.isError && (
        <p role="alert" className="mt-2 text-sm font-medium text-nok-fg">
          It could not be removed. {errorMessage(remove.error)}
        </p>
      )}

      {adding && (
        <AddDialog
          machine={machine}
          instructions={available.map(({ id, name }) => ({ id, name }))}
          onClose={() => setAdding(false)}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove “${removing.name}”?`}
          message={
            removing.signed > 0
              ? `It is taken off ${machine.machineName} with its ${removing.signed} sign-off${removing.signed === 1 ? '' : 's'}, for good. The instruction itself is not affected.`
              : `It is taken off ${machine.machineName}. The instruction itself is not affected, and can be added again.`
          }
          confirmLabel="Remove"
          onConfirm={() => {
            const { id } = removing;
            setRemoving(null);
            remove.mutate(id);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </section>
  );
}

function AssemblyCard({
  assembly,
  isAdmin,
  onRemove,
}: {
  assembly: MachineAssemblySummary;
  isAdmin: boolean;
  onRemove: () => void;
}) {
  const done = assembly.steps > 0 && assembly.signed === assembly.steps;
  const newer =
    assembly.latestRevision !== null && assembly.latestRevision > assembly.templateRevision;
  return (
    <li
      className={clsx(
        'relative flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border p-4 outline-brand-600 transition-colors has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2',
        done ? 'border-ok-border bg-ok-bg' : 'border-ink-200 bg-surface hover:border-ink-300',
      )}
    >
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-[0.9375rem] font-semibold wrap-break-word text-ink-900">
            {/* The title's link covers the card. */}
            <Link
              to={machineAssemblyHref(assembly.machineRef, assembly.id)}
              className="outline-none after:absolute after:inset-0"
            >
              {assembly.name || 'Untitled assembly instruction'}
            </Link>
          </h3>
          {done ? (
            <Badge tone="ok">
              <CircleCheck size={12} aria-hidden="true" className="mr-1" />
              Completed
            </Badge>
          ) : assembly.signed > 0 ? (
            <Badge tone="brand">In progress</Badge>
          ) : (
            <Badge>Not started</Badge>
          )}
          {newer && <Badge tone="brand">Rev {assembly.latestRevision} available</Badge>}
        </div>
        <p className="mt-1 text-xs text-ink-500 tabular-nums">
          Rev {assembly.templateRevision} · {assembly.tasksDone} of {assembly.tasks} tasks ·{' '}
          {assembly.signed} of {assembly.steps} steps signed
          {assembly.minutes > 0 &&
            ` · ${formatMinutes(assembly.minutesSigned)} of ${formatMinutes(assembly.minutes)}`}
          {assembly.lastSignedAt && ` · last signed ${formatDate(assembly.lastSignedAt)}`}
        </p>
      </div>
      <div className="flex min-w-48 flex-1 basis-48 items-center gap-3">
        <ProgressBar signed={assembly.signed} steps={assembly.steps} className="flex-1" />
        <span
          className={clsx(
            'w-10 text-right text-sm font-semibold tabular-nums',
            done ? 'text-ok-fg' : 'text-ink-700',
          )}
        >
          {percentText(assembly.signed, assembly.steps)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* The card is the link; this only shows it. */}
        <span aria-hidden="true" className={buttonClasses(done ? 'secondary' : 'primary', 'h-9')}>
          {done ? 'Open' : assembly.signed > 0 ? 'Continue' : 'Start'}
        </span>
        {isAdmin && (
          // Above the title's link, which covers the card.
          <div className="relative z-10">
            <ActionMenu
              label={`Actions for ${assembly.name}`}
              items={[
                { label: 'Remove from machine', icon: Trash2, danger: true, onSelect: onRemove },
              ]}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function AddDialog({
  machine,
  instructions,
  onClose,
}: {
  machine: Machine;
  instructions: { id: string; name: string }[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const add = useAddMachineAssembly(machine.id);
  const [templateId, setTemplateId] = useState(instructions[0]?.id ?? '');
  const selectId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!templateId) return;
    add.mutate(templateId, { onSuccess: () => dialogRef.current?.close() });
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title="Add assembly instruction"
      description={`${machine.machineName} gets its own copy of the instruction as it is published now. Its steps are then signed off on the machine as they are done.`}
      onClose={onClose}
      busy={add.isPending}
    >
      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor={selectId} className="block text-sm font-medium text-ink-800">
            Instruction
          </label>
          <select
            id={selectId}
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className={clsx(INPUT, 'mt-1.5 h-9')}
          >
            {instructions.map(({ id, name }) => (
              <option key={id} value={id}>
                {name || 'Untitled assembly instruction'}
              </option>
            ))}
          </select>
        </div>
        {add.isError && (
          <p role="alert" className="text-sm font-medium text-nok-fg">
            {errorMessage(add.error)}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="secondary"
            onClick={() => dialogRef.current?.close()}
            disabled={add.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={add.isPending || !templateId}>
            {add.isPending && (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            )}
            {add.isPending ? 'Adding…' : 'Add to machine'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
