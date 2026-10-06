/**
 * Templates (brief §5.2, §8): list and create templates, read and save a template's draft.
 * Publishing and published revisions are in template-revisions.ts.
 *
 *   GET  /api/templates       inspector  TemplateSummary[]
 *   POST /api/templates       admin      CreateTemplateRequest → 201 TemplateDetail + ETag
 *   GET  /api/templates/{id}  admin      TemplateDetail + ETag
 *   PUT  /api/templates/{id}  admin      If-Match, TemplateDraftInput
 *                                        → SaveTemplateResponse + ETag
 */
import { app } from '@azure/functions';
import {
  blobNames,
  CONTAINERS,
  CreateTemplateRequestSchema,
  DEFAULT_SPARE_ROWS_PER_SECTION,
  hasUnpublishedChanges,
  newId,
  TemplateDraftInputSchema,
  type SaveTemplateResponse,
  type Template,
  type TemplateDetail,
} from '@modig/shared';
import {
  BadRequestError,
  ConflictError,
  endpoint,
  etagHeader,
  idParam,
  json,
  PreconditionFailedError,
  readJsonBody,
  requireIfMatch,
} from '../lib/http';
import { loadSettings } from '../lib/settings';
import { writeJson } from '../lib/storage';
import {
  duplicateIds,
  findTemplateForModel,
  loadDetail,
  loadLatestPublished,
  loadSummaries,
  loadTemplate,
  nextRevision,
  templateNotFound,
} from '../lib/templates';

export const listTemplates = endpoint({ role: 'inspector' }, async () =>
  json(200, await loadSummaries()),
);

export const createTemplate = endpoint({ role: 'admin' }, async (req, _context, user) => {
  const { name, modelCode } = await readJsonBody(req, CreateTemplateRequestSchema);
  await checkModel(modelCode);
  const draft: Template = {
    id: newId(),
    name,
    modelCode,
    revision: 1,
    status: 'draft',
    printSettings: { spareRowsPerSection: DEFAULT_SPARE_ROWS_PER_SECTION },
    // The editor starts from an empty state with "+ Add section".
    sections: [],
    updatedAt: new Date().toISOString(),
    updatedBy: user.email,
  };
  const etag = await writeJson(CONTAINERS.templates, blobNames.templateDraft(draft.id), draft, {
    ifNoneMatch: '*',
  });
  const detail: TemplateDetail = { draft, revisions: [], hasUnpublishedChanges: true };
  return json(201, detail, etagHeader(etag));
});

export const getTemplate = endpoint({ role: 'admin' }, async (req) => {
  const found = await loadDetail(idParam(req));
  if (!found) throw templateNotFound();
  return json(200, found.detail, etagHeader(found.etag));
});

/** Autosave of the draft. Only the editable fields come from the client; the rest is ours. */
export const saveTemplate = endpoint({ role: 'admin' }, async (req, _context, user) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const input = await readJsonBody(req, TemplateDraftInputSchema);
  const duplicates = duplicateIds(input.sections);
  if (duplicates.length > 0) {
    throw new BadRequestError(`Each section and row needs its own id: ${duplicates.join(', ')}.`);
  }

  const current = await loadTemplate(id);
  if (!current) throw templateNotFound();
  // Checked here as well as by the write, so a stale editor gets the 412, not a model error.
  if (current.etag !== ifMatch) throw new PreconditionFailedError();
  // An unchanged model is not re-checked: a model removed from the settings later must not make
  // its template unsaveable.
  if (input.modelCode !== current.draft.modelCode) await checkModel(input.modelCode, id);

  const draft: Template = {
    ...input,
    id,
    status: 'draft',
    revision: nextRevision(current.revisions),
    updatedAt: new Date().toISOString(),
    updatedBy: user.email,
  };
  const [etag, published] = await Promise.all([
    writeJson(CONTAINERS.templates, blobNames.templateDraft(id), draft, { ifMatch }),
    loadLatestPublished(current),
  ]);
  const saved: SaveTemplateResponse = {
    draft,
    hasUnpublishedChanges: hasUnpublishedChanges(draft, published),
  };
  return json(200, saved, etagHeader(etag));
});

/**
 * A template's model must be one of the settings' machine models, and no other template may use
 * it (brief §1: one template per model). Two admins creating a template for the same model at
 * the same instant could both pass; with a handful of admins that is accepted.
 */
async function checkModel(modelCode: string, templateId?: string): Promise<void> {
  const [settings, other] = await Promise.all([
    loadSettings(),
    findTemplateForModel(modelCode, templateId),
  ]);
  const model = settings?.machineModels.find((candidate) => candidate.code === modelCode);
  if (!model) throw new BadRequestError(`Unknown machine model "${modelCode}".`);
  if (other) {
    throw new ConflictError(
      `"${other.draft.name}" is already the template for ${model.name}: ` +
        'there is one template per machine model.',
    );
  }
}

// One function per route; the methods share it (keeps the registration count low).
app.http('templates', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'templates',
  handler: (req, context) => (req.method === 'POST' ? createTemplate : listTemplates)(req, context),
});

app.http('template', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'templates/{id}',
  handler: (req, context) => (req.method === 'PUT' ? saveTemplate : getTemplate)(req, context),
});
