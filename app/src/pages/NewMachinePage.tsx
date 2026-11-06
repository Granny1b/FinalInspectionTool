import {
  CreateMachineRequestSchema,
  type CreateMachineRequest,
  type TemplateSummary,
} from '@modig/shared';
import clsx from 'clsx';
import { Factory, LoaderCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BackLink } from '../components/BackLink';
import { Button, ButtonLink } from '../components/Button';
import { ChoiceCard } from '../components/ChoiceCard';
import { EmptyState } from '../components/EmptyState';
import { Field, INPUT } from '../components/Field';
import { PageHeader } from '../components/PageHeader';
import { LoadError, PageLoading } from '../components/PageStates';
import { MachineIdField } from '../features/inspections/FrontPageFields';
import { FRONT_FIELD_IDS } from '../features/inspections/issues';
import { CheckPicker } from '../features/machines/CheckPicker';
import {
  checkChoices,
  choicesText,
  machineHref,
  machineModels,
  type CheckChoice,
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
        title="No machine model has a template yet"
        hint="A machine gets copies of its model’s quality checks and final inspection. A Quality admin sets them up under Templates."
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
          description="Its model, its Machine ID and serial number, and the checks it gets."
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
  const [ticked, setTicked] = useState<Set<string>>(() => allOf(choices));
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
    setTicked(allOf(checkChoices(templates, code)));
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
        title="Machine model"
        hint="Its checks are copies of this model’s quality checks and final inspection."
        error={errors.model}
        options={models.map((model) => ({
          value: model.code,
          label: model.name,
          detail: choicesText(checkChoices(templates, model.code)),
        }))}
        value={modelCode}
        onChange={pickModel}
      />
      <section
        aria-labelledby="machine-fields"
        className="rounded-lg border border-ink-200 bg-surface"
      >
        <div className="border-b border-ink-200 px-5 pt-3.5 pb-3.5">
          <h2 id="machine-fields" className="text-sm font-semibold text-ink-900">
            Machine
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Its checks show them on their front pages; change them here on the machine.
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
      {modelCode && <CheckPicker choices={choices} value={ticked} onChange={setTicked} />}

      {create.isError && !taken && (
        <p role="alert" className="text-sm font-medium text-nok-fg">
          {errorMessage(create.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
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

function allOf(choices: readonly CheckChoice[]): Set<string> {
  return new Set(choices.map((choice) => choice.templateId));
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
