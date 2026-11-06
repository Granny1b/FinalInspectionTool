import {
  UpdateMachineRequestSchema,
  type InspectionSummary,
  type Machine,
  type MachineCheck,
} from '@modig/shared';
import clsx from 'clsx';
import { LoaderCircle, Search } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Field, INPUT } from '../../components/Field';
import { ApiRequestError, errorMessage, isConflict } from '../../lib/api';
import { formatCalendarDate } from '../inspections/dates';
import { MachineIdField } from '../inspections/FrontPageFields';
import { FRONT_FIELD_IDS } from '../inspections/issues';
import { useTemplates } from '../templates/queries';
import { modelName, useSettings } from '../../lib/useSettings';
import { checkChoices } from './model';
import { useAddCheck, useLinkInspection, useMachines, useUpdateMachine } from './queries';

type EditProps = {
  machine: Machine;
  etag: string;
  onReload: () => void;
  onClose: () => void;
};

/**
 * The Machine ID and serial number. Its checks that are not finalised get them on their front
 * pages; finalised ones keep what they were finalised with.
 */
export function EditMachineDialog({ machine, etag, onReload, onClose }: EditProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const update = useUpdateMachine(machine.id);
  const [machineName, setMachineName] = useState(machine.machineName);
  const [serialNumber, setSerialNumber] = useState(machine.serialNumber);
  const [submitted, setSubmitted] = useState(false);
  const close = () => dialogRef.current?.close();
  const parsed = UpdateMachineRequestSchema.safeParse({ machineName, serialNumber });
  const errors: { machineName?: string; serialNumber?: string } = {};
  if (submitted && !parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'machineName' || field === 'serialNumber') errors[field] ??= issue.message;
    }
  }
  const taken =
    update.error instanceof ApiRequestError && update.error.status === 409
      ? update.error.message
      : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!parsed.success) return;
    update.mutate({ request: parsed.data, etag }, { onSuccess: close });
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title={`Edit ${machine.machineName}`}
      description="Its checks that are not finalised show the new Machine ID and serial number. Finalised ones keep what they were finalised with."
      onClose={onClose}
      busy={update.isPending}
    >
      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        <MachineIdField
          value={machineName}
          error={errors.machineName ?? taken}
          onChange={setMachineName}
        />
        <Field id={FRONT_FIELD_IDS.serialNumber} label="Serial number" error={errors.serialNumber}>
          {(control) => (
            <input
              {...control}
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
              value={serialNumber}
              onChange={(event) => setSerialNumber(event.target.value)}
              className={clsx(INPUT, 'h-9')}
            />
          )}
        </Field>
        {update.isError && !taken && (
          <p role="alert" className="text-sm font-medium text-nok-fg">
            {errorMessage(update.error)}{' '}
            {isConflict(update.error) && (
              <button
                type="button"
                onClick={() => {
                  close();
                  onReload();
                }}
                className="font-semibold underline underline-offset-2"
              >
                Reload
              </button>
            )}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={close} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            )}
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type AddProps = {
  machine: Machine;
  checks: readonly MachineCheck[];
  onAdded: (title: string) => void;
  onClose: () => void;
};

/**
 * Another check: one of the model's published checks the machine doesn't have (not ticked when it
 * was made, or published since), copied as it is published now.
 */
export function AddCheckDialog({ machine, checks, onAdded, onClose }: AddProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const templates = useTemplates();
  const add = useAddCheck(machine.id);
  const has = new Set(checks.map((check) => check.templateId));
  const choices = checkChoices(templates.data ?? [], machine.modelCode).filter(
    (choice) => !has.has(choice.templateId),
  );
  const [picked, setPicked] = useState<string | null>(null);
  const close = () => dialogRef.current?.close();
  const legendId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    const choice = choices.find((candidate) => candidate.templateId === picked);
    if (!choice) return;
    add.mutate(choice.templateId, {
      onSuccess: () => {
        onAdded(choice.kind === 'final' ? choice.title : `Quality check – ${choice.title}`);
        close();
      },
    });
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title="Add a check"
      description={`A copy of the check as it is published now, for ${machine.machineName} only.`}
      onClose={onClose}
      busy={add.isPending}
    >
      <form onSubmit={submit} className="mt-5">
        {templates.isPending ? (
          <p className="text-sm text-ink-500">Loading the checks…</p>
        ) : choices.length === 0 ? (
          <p className="text-sm text-ink-600">
            This machine has every published check of its model already.
          </p>
        ) : (
          <fieldset aria-labelledby={legendId}>
            <legend id={legendId} className="sr-only">
              Check
            </legend>
            <div className="space-y-2">
              {choices.map((choice, index) => (
                <label
                  key={choice.templateId}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-ink-200 px-4 py-2.5 transition-colors hover:bg-ink-50 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-1 has-focus-visible:outline-brand-600"
                >
                  <input
                    type="radio"
                    name="check"
                    checked={picked === choice.templateId}
                    onChange={() => setPicked(choice.templateId)}
                    autoFocus={index === 0}
                    className="size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium text-ink-900">
                    {choice.kind === 'final' ? choice.title : `Quality check – ${choice.title}`}
                  </span>
                  <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                    Rev {choice.revision}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {add.isError && (
          <p role="alert" className="mt-4 text-sm font-medium text-nok-fg">
            {errorMessage(add.error)}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={add.isPending}>
            Cancel
          </Button>
          {choices.length > 0 && (
            <Button type="submit" disabled={add.isPending || !picked}>
              {add.isPending && (
                <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
              )}
              {add.isPending ? 'Adding…' : 'Add check'}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}

type LinkProps = {
  machine: Machine;
  /** Started inspections of both kinds without a machine (the API's list). */
  unlinked: readonly InspectionSummary[];
  onLinked: (number: string) => void;
  onClose: () => void;
};

/**
 * Admins: link an inspection or quality check done before machines existed (or that the one-time
 * action couldn't match) to this machine. Only those of its model, newest first.
 */
export function LinkInspectionDialog({ machine, unlinked, onLinked, onClose }: LinkProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const link = useLinkInspection();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const close = () => dialogRef.current?.close();
  const words = query.toLocaleLowerCase('sv').split(/\s+/).filter(Boolean);
  const candidates = unlinked
    .filter((inspection) => inspection.modelCode === machine.modelCode)
    .filter((inspection) => {
      const text =
        `${inspection.number} ${inspection.machineName} ${inspection.serialNumber} ${inspection.templateName}`.toLocaleLowerCase(
          'sv',
        );
      return words.every((word) => text.includes(word));
    });

  function submit(event: FormEvent) {
    event.preventDefault();
    const inspection = candidates.find((candidate) => candidate.id === picked);
    if (!inspection) return;
    link.mutate(
      { id: inspection.id, machineRef: machine.id },
      {
        onSuccess: () => {
          onLinked(inspection.number);
          close();
        },
      },
    );
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title={`Link an inspection to ${machine.machineName}`}
      description="An inspection or quality check of this model that belongs to no machine. One in progress takes the machine’s Machine ID and serial number; a finalised one keeps its own."
      onClose={onClose}
      busy={link.isPending}
      className="w-[min(36rem,calc(100vw-2rem))]"
    >
      <form onSubmit={submit} className="mt-5">
        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
          />
          <input
            type="search"
            aria-label="Search inspections"
            placeholder="Number, Machine ID or S/N"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={clsx(INPUT, 'h-9 pl-9')}
          />
        </div>
        {candidates.length === 0 ? (
          <p className="mt-4 text-sm text-ink-600">
            {unlinked.some((inspection) => inspection.modelCode === machine.modelCode)
              ? 'None matches.'
              : 'Every inspection of this model belongs to a machine.'}
          </p>
        ) : (
          <fieldset className="mt-3 max-h-80 space-y-2 overflow-y-auto p-0.5">
            <legend className="sr-only">Inspection</legend>
            {candidates.map((inspection) => (
              <label
                key={inspection.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-200 px-4 py-2.5 transition-colors hover:bg-ink-50 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-1 has-focus-visible:outline-brand-600"
              >
                <input
                  type="radio"
                  name="inspection"
                  checked={picked === inspection.id}
                  onChange={() => setPicked(inspection.id)}
                  className="mt-0.5 size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
                />
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-ink-900">{inspection.number}</span>
                  <span className="text-ink-500">
                    {' '}
                    · {inspection.machineName || 'No Machine ID'}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    {inspection.kind === 'quality' ? `${inspection.templateName} · ` : ''}S/N{' '}
                    {inspection.serialNumber || '—'} · {formatCalendarDate(inspection.date)}
                    {inspection.state === 'finalised' ? ' · Finalised' : ' · In progress'}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        {link.isError && (
          <p role="alert" className="mt-4 text-sm font-medium text-nok-fg">
            {errorMessage(link.error)}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={link.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={link.isPending || !picked}>
            {link.isPending && (
              <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
            )}
            {link.isPending ? 'Linking…' : 'Link to machine'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type PickProps = {
  /** "inspection", "quality check". */
  noun: string;
  modelCode: string;
  /** Links it; rejects with what went wrong. */
  onPick: (machineRef: string) => Promise<void>;
  onClose: () => void;
};

/**
 * Admins, on an inspection or quality check that belongs to no machine: link it to a machine of
 * its model. One in progress takes the machine's Machine ID and serial number.
 */
export function PickMachineDialog({ noun, modelCode, onPick, onClose }: PickProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const machines = useMachines();
  const settings = useSettings();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const close = () => dialogRef.current?.close();
  const ofModel = (machines.data ?? []).filter((machine) => machine.modelCode === modelCode);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!picked) return;
    setBusy(true);
    setFailure(null);
    try {
      await onPick(picked);
      close();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      dialogRef={dialogRef}
      title="Link to a machine"
      description={`A machine of ${modelName(settings.data?.machineModels, modelCode)}. If this ${noun} is not finalised, it takes the machine’s Machine ID and serial number.`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={(event) => void submit(event)} className="mt-5">
        {machines.isPending ? (
          <p className="text-sm text-ink-500">Loading machines…</p>
        ) : ofModel.length === 0 ? (
          <p className="text-sm text-ink-600">There is no machine of this model yet.</p>
        ) : (
          <fieldset className="max-h-80 space-y-2 overflow-y-auto p-0.5">
            <legend className="sr-only">Machine</legend>
            {ofModel.map((machine, index) => (
              <label
                key={machine.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink-200 px-4 py-2.5 transition-colors hover:bg-ink-50 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-1 has-focus-visible:outline-brand-600"
              >
                <input
                  type="radio"
                  name="machine"
                  checked={picked === machine.id}
                  onChange={() => setPicked(machine.id)}
                  autoFocus={index === 0}
                  className="size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
                />
                <span className="min-w-0 flex-1 text-sm font-medium text-ink-900">
                  {machine.machineName}
                </span>
                <span className="shrink-0 text-xs text-ink-500">S/N {machine.serialNumber}</span>
              </label>
            ))}
          </fieldset>
        )}
        {failure && (
          <p role="alert" className="mt-4 text-sm font-medium text-nok-fg">
            {failure}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !picked}>
            {busy && <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />}
            {busy ? 'Linking…' : 'Link to machine'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
