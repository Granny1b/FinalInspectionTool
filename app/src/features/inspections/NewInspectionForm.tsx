import {
  CreateInspectionRequestSchema,
  type CreateInspectionRequest,
  type InspectionFrontInput,
  type MachineModel,
  type TemplateSummary,
} from '@modig/shared';
import { LoaderCircle } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { errorMessage } from '../../lib/api';
import { modelName } from '../../lib/useSettings';
import { FrontPageFrame } from '../templates/FrontPage';
import { useTemplateRevision } from '../templates/queries';
import { localDate } from './dates';
import { FrontPageFields } from './FrontPageFields';
import { FRONT_FIELD_IDS } from './issues';
import { inspectionsListHref } from './listFilter';
import { MachinePhotoField } from './MachinePhoto';
import { useCreateInspection } from './queries';
import { TemplatePicker } from './TemplatePicker';

type Props = {
  /** Templates with a published revision. */
  templates: TemplateSummary[];
  models: MachineModel[] | undefined;
  defaultLocation: string;
};

type Errors = { template?: string; machineName?: string; serialNumber?: string };

/**
 * Brief §1 step 2: pick the machine model's checklist, fill in the front page, create. The
 * inspection then opens, ready to print and transcribe.
 */
export function NewInspectionForm({ templates, models, defaultLocation }: Props) {
  const navigate = useNavigate();
  const create = useCreateInspection();
  // With a single checklist there is nothing to choose; with several, picking one is deliberate.
  const [templateId, setTemplateId] = useState<string | null>(
    templates.length === 1 ? (templates[0]?.id ?? null) : null,
  );
  const [front, setFront] = useState<InspectionFrontInput>(() => ({
    machineName: '',
    serialNumber: '',
    participants: [],
    location: defaultLocation,
    date: localDate(),
  }));
  const [uploading, setUploading] = useState(false);
  // Errors show after the first attempt to create, then follow the fields as they are fixed.
  const [submitted, setSubmitted] = useState(false);

  const template = templates.find((candidate) => candidate.id === templateId);
  const revision = useTemplateRevision(templateId ?? '', template?.publishedRevision ?? null);
  const request = buildRequest(templateId, front);
  const errors = submitted ? errorsOf(request) : {};

  const update = useCallback(
    (patch: Partial<InspectionFrontInput>) => setFront((current) => ({ ...current, ...patch })),
    [],
  );
  const trackUpload = useCallback((upload: Promise<void>) => {
    setUploading(true);
    const done = () => setUploading(false);
    upload.then(done, done);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const found = errorsOf(request);
    const first = found.template
      ? document.querySelector<HTMLInputElement>('input[name="template"]')
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
      onSuccess: (created) => navigate(`/inspections/${created.inspection.id}`),
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <TemplatePicker
        templates={templates}
        models={models}
        value={templateId}
        error={errors.template}
        onChange={setTemplateId}
      />
      <FrontPageFrame revisionLabel={`Rev: ${template?.publishedRevision ?? '–'}`}>
        <MachinePhotoField
          imageId={front.photoId}
          defaultImageId={revision.data?.coverImageId}
          onChange={(photoId) => update({ photoId })}
          onUpload={trackUpload}
        />
        <FrontPageFields
          front={front}
          modelLabel={
            template
              ? modelName(
                  models,
                  revision.data?.modelCode ?? template.publishedModelCode ?? template.modelCode,
                )
              : 'From the checklist'
          }
          errors={errors}
          onChange={update}
        />
      </FrontPageFrame>

      {create.isError && (
        <p role="alert" className="text-sm font-medium text-nok-fg">
          {errorMessage(create.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <ButtonLink to={inspectionsListHref()} variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={create.isPending || uploading}>
          {(create.isPending || uploading) && (
            <LoaderCircle size={16} aria-hidden="true" className="animate-spin" />
          )}
          {create.isPending ? 'Creating…' : uploading ? 'Uploading photo…' : 'Create inspection'}
        </Button>
      </div>
    </form>
  );
}

/** The request as typed (trimmed by the schema), or null until a checklist is picked. */
function buildRequest(
  templateId: string | null,
  front: InspectionFrontInput,
): CreateInspectionRequest | null {
  if (!templateId) return null;
  return {
    templateId,
    // No photo of its own: the server uses the template's cover photo.
    front: { ...front, location: front.location.trim() },
  };
}

/** The create rules from the shared schema, by field. */
function errorsOf(request: CreateInspectionRequest | null): Errors {
  if (!request) return { template: 'Pick the checklist for this machine.' };
  const parsed = CreateInspectionRequestSchema.safeParse(request);
  if (parsed.success) return {};
  const errors: Errors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[1];
    if (field === 'machineName' || field === 'serialNumber') errors[field] ??= issue.message;
  }
  return errors;
}
