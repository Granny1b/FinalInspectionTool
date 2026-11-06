import {
  StartQualityCheckRequestSchema,
  type MachineModel,
  type StartQualityCheckRequest,
  type TemplateSummary,
} from '@modig/shared';
import { LoaderCircle } from 'lucide-react';
import { useCallback, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../../components/Button';
import { errorMessage } from '../../../lib/api';
import { useCurrentUser } from '../../../lib/useMe';
import { FrontPageFrame } from '../../templates/FrontPage';
import { useTemplateRevision } from '../../templates/queries';
import { localDate } from '../dates';
import { FRONT_FIELD_IDS } from '../issues';
import { inspectionHref, inspectionsListHref } from '../listFilter';
import { useCreateInspection } from '../queries';
import {
  QualityCheckFrontFields,
  QualityStandardDetails,
  type QualityCheckFrontInput,
} from './QualityCheckFront';
import { checkCountText, publishedTitle, startChoices } from './startChoices';

type Props = {
  /** Every template and quality check (the list the API gives). */
  templates: TemplateSummary[];
  models: MachineModel[] | undefined;
};

type Errors = { machine?: string; check?: string; machineName?: string; serialNumber?: string };

/**
 * Start a quality check: pick the machine (models with a published quality check), then which of
 * its quality checks, then fill in the Machine ID, serial number and date (and who checks it, the
 * signed-in user to start with). Creating it gives it the next QC- number and opens it.
 */
export function StartQualityCheckForm({ templates, models }: Props) {
  const navigate = useNavigate();
  const create = useCreateInspection();
  const me = useCurrentUser();
  const machines = useMemo(() => startChoices(templates, models), [templates, models]);
  // One machine, or one check of the chosen machine: nothing to choose.
  const [modelCode, setModelCode] = useState<string | null>(
    machines.length === 1 ? (machines[0]?.modelCode ?? null) : null,
  );
  const machine = machines.find((candidate) => candidate.modelCode === modelCode);
  const [checkId, setCheckId] = useState<string | null>(
    machine?.checks.length === 1 ? (machine.checks[0]?.id ?? null) : null,
  );
  const check = machine?.checks.find((candidate) => candidate.id === checkId);
  const revision = useTemplateRevision(check?.id ?? '', check?.publishedRevision ?? null);
  const [front, setFront] = useState<QualityCheckFrontInput>(() => ({
    machineName: '',
    serialNumber: '',
    participants: [me.name || me.email],
    date: localDate(),
  }));
  // Errors show after the first attempt to start, then follow the fields as they are fixed.
  const [submitted, setSubmitted] = useState(false);
  const request = check ? { templateId: check.id, front } : null;
  const errors = submitted ? errorsOf(modelCode, request) : {};

  const update = useCallback(
    (patch: Partial<QualityCheckFrontInput>) => setFront((current) => ({ ...current, ...patch })),
    [],
  );

  function pickMachine(code: string) {
    setModelCode(code);
    const checks = machines.find((candidate) => candidate.modelCode === code)?.checks ?? [];
    setCheckId(checks.length === 1 ? (checks[0]?.id ?? null) : null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const found = errorsOf(modelCode, request);
    const first = found.machine
      ? document.querySelector<HTMLInputElement>('input[name="machine"]')
      : found.check
        ? document.querySelector<HTMLInputElement>('input[name="check"]')
        : found.machineName
          ? document.getElementById(FRONT_FIELD_IDS.machineName)
          : found.serialNumber
            ? document.getElementById(FRONT_FIELD_IDS.serialNumber)
            : null;
    if (first) {
      first.focus();
      return;
    }
    if (!request) return;
    create.mutate(request, {
      onSuccess: (created) =>
        navigate(inspectionHref('quality', created.inspection.id), { replace: true }),
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <ChoiceCard
        name="machine"
        title="Machine"
        hint="The machine models with a published quality check."
        error={errors.machine}
        options={machines.map((candidate) => ({
          value: candidate.modelCode,
          label: candidate.name,
          detail: checkCountText(candidate.checks.length),
        }))}
        value={modelCode}
        onChange={pickMachine}
      />
      {machine && (
        <ChoiceCard
          // A new list for each machine: the first of them takes the focus.
          key={machine.modelCode}
          name="check"
          title="Quality check"
          hint="The check keeps its own copy of the latest published revision: later changes to the quality check don’t affect it."
          error={errors.check}
          options={machine.checks.map((candidate) => ({
            value: candidate.id,
            label: publishedTitle(candidate),
            detail: `Rev ${candidate.publishedRevision}`,
          }))}
          value={checkId}
          onChange={setCheckId}
          autoFocus={machines.length > 1 || machine.checks.length > 1}
        />
      )}
      <FrontPageFrame revisionLabel={`Rev: ${check?.publishedRevision ?? '–'}`} layout="fields">
        <QualityCheckFrontFields
          front={front}
          modelLabel={machine?.name ?? 'From the quality check'}
          errors={errors}
          onChange={update}
        />
        {check && (
          <QualityStandardDetails
            standard={{
              title: publishedTitle(check),
              front: revision.data?.quality,
              revision: check.publishedRevision ?? 1,
            }}
          />
        )}
      </FrontPageFrame>

      {create.isError && (
        <p role="alert" className="text-sm font-medium text-nok-fg">
          {errorMessage(create.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <ButtonLink to={inspectionsListHref('quality')} variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && (
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
          )}
          {create.isPending ? 'Starting…' : 'Start quality check'}
        </Button>
      </div>
    </form>
  );
}

/** What is missing, by field: the machine, the quality check, then the shared schema's rules. */
function errorsOf(modelCode: string | null, request: StartQualityCheckRequest | null): Errors {
  if (!modelCode) return { machine: 'Pick the machine.' };
  if (!request) return { check: 'Pick the quality check.' };
  const parsed = StartQualityCheckRequestSchema.safeParse(request);
  if (parsed.success) return {};
  const errors: Errors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[1];
    if (field === 'machineName' || field === 'serialNumber') errors[field] ??= issue.message;
  }
  return errors;
}

type ChoiceCardProps = {
  name: string;
  title: string;
  hint: ReactNode;
  error: string | undefined;
  options: { value: string; label: string; detail: string }[];
  value: string | null;
  onChange: (value: string) => void;
  /** The first (or chosen) option takes the focus when the card appears. */
  autoFocus?: boolean;
};

/**
 * A card of radio options, as the new inspection's checklist picker: its legend is the card's
 * heading, the hint under it, then one option per line or two, each a large target. Arrow keys
 * move between them.
 */
function ChoiceCard({
  name,
  title,
  hint,
  error,
  options,
  value,
  onChange,
  autoFocus = true,
}: ChoiceCardProps) {
  const hintId = useId();
  const errorId = useId();
  return (
    <fieldset
      aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      className="min-w-0 rounded-lg border border-ink-200 bg-surface"
    >
      <legend className="float-left w-full px-5 pt-3.5">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      </legend>
      <p
        id={hintId}
        className="clear-left border-b border-ink-200 px-5 pt-0.5 pb-3.5 text-xs text-ink-500"
      >
        {hint}
      </p>
      <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option, index) => (
          <label
            key={option.value}
            className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border border-ink-200 px-4 py-3 transition-colors hover:border-ink-300 hover:bg-ink-50 has-checked:border-brand-600 has-checked:bg-brand-50 has-focus-visible:outline-2 has-focus-visible:-outline-offset-1 has-focus-visible:outline-brand-600"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              autoFocus={autoFocus && (value ? value === option.value : index === 0)}
              aria-invalid={error ? true : undefined}
              className="mt-0.5 size-4 shrink-0 accent-brand-600 focus-visible:outline-none"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium wrap-break-word text-ink-900">
                {option.label}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="-mt-3 px-5 pb-5 text-xs font-medium text-nok-fg">
          {error}
        </p>
      )}
    </fieldset>
  );
}
