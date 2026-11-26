import {
  CreateMachineRequestSchema,
  type CreateMachineRequest,
  type TemplateSummary,
} from '@modig/shared';
import clsx from 'clsx';
import { ClipboardCheck, Factory, LoaderCircle, ShieldCheck, Wrench } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BackLink } from '../components/BackLink';
import { Button, ButtonLink } from '../components/Button';
import { ChoiceCard } from '../components/ChoiceCard';
import { EmptyState } from '../components/EmptyState';
import { Field, INPUT } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { StepNumber } from '../components/StepNumber';
import { LoadError, PageLoading } from '../components/PageStates';
import { MachineIdField } from '../features/inspections/FrontPageFields';
import { FRONT_FIELD_IDS } from '../features/inspections/issues';
import { CheckPicker } from '../features/machines/CheckPicker';
import {
  assemblyChoices,
  checkChoices,
  contentsText,
  machineHref,
  machineModels,
} from '../features/machines/model';
import { useCreateMachine } from '../features/machines/queries';
import { useTemplates } from '../features/templates/queries';
import { ApiRequestError, errorMessage } from '../lib/api';
import { useSettings } from '../lib/useSettings';

/**
 * `/machines/new` (inspectors and admins): the machine's model, its Machine ID and serial number,
 * and which of the model's published checks it gets, all ticked to start with. `?model=` picks
 * the model.
 */
export function NewMachinePage() {
  const templates = useTemplates();
  const settings = useSettings();

  let body;
  if (templates.isPending || settings.isPending) {
    body = <PageLoading label="Loading the machine models…" header={false} />;
  } else if (templates.isError) {
    body = (
      <LoadError
        title="We couldn't load the machine models"
        message={errorMessage(templates.error)}
        onRetry={() => void templates.refetch()}
        retrying={templates.isFetching}
      />
    );
  } else if (machineModels(templates.data, settings.data?.machineModels).length === 0) {
    body = (
      <EmptyState
        icon={Factory}
        title="Nothing is published for any machine model yet"
        hint="A machine gets copies of its model’s assembly instructions, quality checks and final inspection. An admin writes and publishes them under Assembly and Templates."
        action={
          <ButtonLink to="/templates" variant="secondary">
            Go to templates
          </ButtonLink>
        }
      />
    );
  } else {
    body = <NewMachineForm templates={templates.data} />;
  }

  return (
    <>
      <BackLink to="/machines" label="Machines" />
      <div className="mt-2">
        <PageHeader
          title="New machine"
          description="Three steps: pick the model, name the machine, and choose what it gets."
        />
      </div>
      {body}
    </>
  );
}

type Errors = { model?: string; machineName?: string; serialNumber?: string };

function NewMachineForm({ templates }: { templates: TemplateSummary[] }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const create = useCreateMachine();
  const [params] = useSearchParams();
  const models = machineModels(templates, settings.data?.machineModels);
  const [modelCode, setModelCode] = useState<string | null>(() => {
    const asked = params.get('model');
    if (asked && models.some((model) => model.code === asked)) return asked;
    return models.length === 1 ? (models[0]?.code ?? null) : null;
  });
  const choices = modelCode ? checkChoices(templates, modelCode) : [];
  // Where the settings hide Assembly, a new machine is not given instructions either.
  const showAssembly = settings.data?.showAssembly === true;
  const instructions = modelCode && showAssembly ? assemblyChoices(templates, modelCode) : [];
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(modelCode ? offered(templates, modelCode) : []),
  );
  const [machineName, setMachineName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  // Errors show after the first attempt, then follow the fields as they are fixed.
  const [submitted, setSubmitted] = useState(false);
  const request = modelCode
    ? {
        machineName,
        serialNumber,
        modelCode,
        // In the order offered.
        templateIds: choices
          .filter((choice) => ticked.has(choice.templateId))
          .map((choice) => choice.templateId),
        assemblyTemplateIds: instructions
          .filter((choice) => ticked.has(choice.templateId))
          .map((choice) => choice.templateId),
      }
    : null;
  const errors = submitted ? errorsOf(request) : {};
  // A Machine ID another machine has: said at the field, from the server's answer.
  const taken =
    create.error instanceof ApiRequestError && create.error.status === 409
      ? create.error.message
      : undefined;
  const machineError = errors.machineName ?? taken;

  function pickModel(code: string) {
    setModelCode(code);
    setTicked(new Set(offered(templates, code)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const found = errorsOf(request);
    const first = found.model
      ? document.querySelector<HTMLInputElement>('input[name="model"]')
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
      onSuccess: (created) => navigate(machineHref(created.detail.machine.id), { replace: true }),
      onError: (failure) => {
        if (failure instanceof ApiRequestError && failure.status === 409) {
          document.getElementById(FRONT_FIELD_IDS.machineName)?.focus();
        }
      },
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <ChoiceCard
        name="model"
        step={1}
        title="Machine model"
        hint="What is built. The machine gets this model’s assembly instructions and checks."
        error={errors.model}
        options={models.map((model) => ({
          value: model.code,
          label: model.name,
          detail: contentsText(
            assemblyChoices(templates, model.code).length,
            checkChoices(templates, model.code),
          ),
        }))}
        value={modelCode}
        onChange={pickModel}
      />
      <section
        aria-labelledby="machine-fields"
        className="rounded-lg border border-ink-200 bg-surface"
      >
        <div className="border-b border-ink-200 px-5 pt-3.5 pb-3.5">
          <h2
            id="machine-fields"
            className="flex items-center gap-2.5 text-sm font-semibold text-ink-900"
          >
            <StepNumber step={2} />
            The machine
          </h2>
          <p className="mt-0.5 pl-[2.125rem] text-xs text-ink-500">
            How this machine is known. Both are shown on its checks and reports, and can be changed
            later on the machine’s page.
          </p>
        </div>
        <div className="grid gap-x-4 gap-y-4 p-5 sm:grid-cols-2">
          <MachineIdField value={machineName} error={machineError} onChange={setMachineName} />
          <Field
            id={FRONT_FIELD_IDS.serialNumber}
            label="Serial number"
            error={errors.serialNumber}
          >
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
        </div>
      </section>
      {modelCode ? (
        <CheckPicker
          step={3}
          value={ticked}
          onChange={setTicked}
          groups={[
            ...(showAssembly
              ? [
                  {
                    label: 'Assembly',
                    icon: Wrench,
                    items: instructions,
                    empty: 'No assembly instruction is published for this model yet.',
                  },
                ]
              : []),
            {
              label: 'Quality checks',
              icon: ShieldCheck,
              items: choices.filter((choice) => choice.kind === 'quality'),
              empty: 'No quality check is published for this model yet.',
            },
            {
              label: 'Final inspection',
              icon: ClipboardCheck,
              items: choices.filter((choice) => choice.kind === 'final'),
              empty: 'The final inspection of this model is not published yet.',
            },
          ]}
        />
      ) : (
        <section className="rounded-lg border border-dashed border-ink-300 px-5 py-3.5">
          <h2 className="flex items-center gap-2.5 text-sm font-semibold text-ink-500">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-200 text-xs font-semibold text-ink-600 tabular-nums"
            >
              3
            </span>
            What the machine gets
          </h2>
          <p className="mt-0.5 pl-[2.125rem] text-xs text-ink-500">
            Pick the machine model first: its assembly instructions and checks are listed here.
          </p>
        </section>
      )}

      {create.isError && !taken && (
        <p role="alert" className="text-sm font-medium text-nok-fg">
          {errorMessage(create.error)}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        {request && (
          <p className="mr-auto min-w-0 text-sm text-ink-600">
            {gets(request.assemblyTemplateIds.length, request.templateIds.length)}
          </p>
        )}
        <ButtonLink to="/machines" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && (
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
          )}
          {create.isPending ? 'Creating…' : 'Create machine'}
        </Button>
      </div>
    </form>
  );
}

/** Everything a machine of the model can get: all of it is ticked to start with. */
function offered(templates: readonly TemplateSummary[], modelCode: string): string[] {
  return [...assemblyChoices(templates, modelCode), ...checkChoices(templates, modelCode)].map(
    (choice) => choice.templateId,
  );
}

/** "The machine gets 1 assembly instruction and 4 checks.", under the form. */
function gets(instructions: number, checks: number): string {
  const parts = [
    instructions > 0 && `${instructions} assembly instruction${instructions === 1 ? '' : 's'}`,
    checks > 0 && `${checks} check${checks === 1 ? '' : 's'}`,
  ].filter((part) => part !== false);
  return parts.length === 0
    ? 'Nothing is ticked: the machine starts empty.'
    : `The machine gets ${parts.join(' and ')}.`;
}

/** What is missing, by field: the model, then the shared schema's rules. */
function errorsOf(request: CreateMachineRequest | null): Errors {
  if (!request) return { model: 'Pick the machine model.' };
  const parsed = CreateMachineRequestSchema.safeParse(request);
  if (parsed.success) return {};
  const errors: Errors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'machineName' || field === 'serialNumber') errors[field] ??= issue.message;
  }
  return errors;
}
