/**
 * Templates (brief §5.2, §8): list, create, import and delete templates, read and save a
 * template's draft. Publishing and published revisions are in template-revisions.ts.
 *
 *   GET    /api/templates         inspector  TemplateSummary[]
 *   POST   /api/templates         admin      CreateTemplateRequest → 201 TemplateDetail + ETag
 *   POST   /api/templates/import  admin      ImportTemplateRequest
 *                                            → 201 ImportTemplateResponse + ETag
 *   GET    /api/templates/{id}    admin      TemplateDetail + ETag
 *   PUT    /api/templates/{id}    admin      If-Match, TemplateDraftInput
 *                                            → SaveTemplateResponse + ETag
 *   DELETE /api/templates/{id}    admin      If-Match → 204
 */
import { app } from '@azure/functions';
import {
  blobNames,
  checklistIds,
  CONTAINERS,
  CreateTemplateRequestSchema,
  DEFAULT_SPARE_ROWS_PER_SECTION,
  hasUnpublishedChanges,
  ImportTemplateRequestSchema,
  newId,
  newModelConflict,
  TemplateDraftInputSchema,
  templateImageIds,
  TemplateSchema,
  withAvailableImages,
  withNewIds,
  type ImportTemplateResponse,
  type MachineModel,
  type SaveTemplateResponse,
  type Section,
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
import { loadSettings, updateSettings } from '../lib/settings';
import { writeJson } from '../lib/storage';
import {
  deleteTemplate as deleteStoredTemplate,
  duplicateIds,
  findTemplateForModel,
  loadDetail,
  loadLatestPublished,
  loadSummaries,
  loadTemplate,
  nextRevision,
  storedImages,
  templateNotFound,
  usedChecklistIds,
} from '../lib/templates';

export const listTemplates = endpoint({ role: 'inspector' }, async () =>
  json(200, await loadSummaries()),
);

export const createTemplate = endpoint({ role: 'admin' }, async (req, _context, user) => {
  const { name, modelCode, newModel } = await readJsonBody(req, CreateTemplateRequestSchema);
  await prepareModel(modelCode, newModel, user.email);
  const { draft, etag } = await writeNewDraft({
    name,
    modelCode,
    printSettings: { spareRowsPerSection: DEFAULT_SPARE_ROWS_PER_SECTION },
    // The editor starts from an empty state with "+ Add section".
    sections: [],
    updatedBy: user.email,
  });
  const detail: TemplateDetail = { draft, revisions: [], hasUnpublishedChanges: true };
  return json(201, detail, etagHeader(etag));
});

/**
 * A new draft from a template file. Its section and row ids are kept when no template uses any
 * of them (re-importing an exported template keeps its checkpoints' history in Insights);
 * otherwise every section and row gets a new one. Images this installation doesn't have are left
 * out, and the answer says how many.
 */
export const importTemplate = endpoint({ role: 'admin' }, async (req, _context, user) => {
  const { name, modelCode, newModel, file } = await readJsonBody(req, ImportTemplateRequestSchema);
  const { coverImageId, printSettings, sections } = file.template;
  checkIds(sections);

  const [used, stored] = await Promise.all([
    usedChecklistIds(),
    storedImages(templateImageIds(file.template)),
  ]);
  const idsFree = checklistIds(sections).every((id) => !used.has(id));
  const { template: checklist, dropped } = withAvailableImages(
    { coverImageId, sections: idsFree ? sections : withNewIds(sections) },
    stored,
  );

  // Last, so a refused import never adds a machine model.
  await prepareModel(modelCode, newModel, user.email);
  const { draft, etag } = await writeNewDraft({
    name,
    modelCode,
    ...(checklist.coverImageId && { coverImageId: checklist.coverImageId }),
    printSettings,
    sections: checklist.sections,
    updatedBy: user.email,
  });
  const imported: ImportTemplateResponse = {
    draft,
    revisions: [],
    hasUnpublishedChanges: true,
    droppedImages: dropped,
  };
  return json(201, imported, etagHeader(etag));
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
  checkIds(input.sections);

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
 * Deletes the draft and every published revision; If-Match is the draft the admin is looking at,
 * so nobody's newer save is deleted unseen. Inspections, their deviation rows and all images stay.
 */
export const deleteTemplate = endpoint({ role: 'admin' }, async (req, context) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const current = await loadTemplate(id);
  if (!current) throw templateNotFound();
  // As for saves: an outdated page sees the conflict, before anything is deleted.
  if (current.etag !== ifMatch) throw new PreconditionFailedError();
  await deleteStoredTemplate(id, ifMatch, context);
  return { status: 204 };
});

/** Ids must be unique: among sections, and among all rows (results and KPIs key on row ids). */
function checkIds(sections: readonly Section[]): void {
  const duplicates = duplicateIds(sections);
  if (duplicates.length > 0) {
    throw new BadRequestError(`Each section and row needs its own id: ${duplicates.join(', ')}.`);
  }
}

/** Writes a new template's draft (revision 1, never published) and returns it with its ETag. */
async function writeNewDraft(
  content: Omit<Template, 'id' | 'revision' | 'status' | 'updatedAt'>,
): Promise<{ draft: Template; etag: string }> {
  // Parsed, so the stored draft and the answer have the keys in schema order, as reads do.
  const draft = TemplateSchema.parse({
    ...content,
    id: newId(),
    revision: 1,
    status: 'draft',
    updatedAt: new Date().toISOString(),
  });
  const etag = await writeJson(CONTAINERS.templates, blobNames.templateDraft(draft.id), draft, {
    ifNoneMatch: '*',
  });
  return { draft, etag };
}

/** The model a new template gets: one from the settings, or `newModel`, added to them first. */
async function prepareModel(
  modelCode: string,
  newModel: MachineModel | undefined,
  by: string,
): Promise<void> {
  if (!newModel) return checkModel(modelCode);
  // A template may already use the code without the settings having it (a model removed since).
  const other = await findTemplateForModel(modelCode);
  if (other) {
    throw new ConflictError(`"${other.draft.name}" already uses the model code ${modelCode}.`);
  }
  // Checked inside the conditional write, so an admin adding the same model meanwhile is a 409
  // here rather than a second template for their model.
  await updateSettings((settings) => {
    const conflict = newModelConflict(settings.machineModels, newModel);
    if (conflict) throw new ConflictError(conflict.message);
    return { ...settings, machineModels: [...settings.machineModels, newModel] };
  }, by);
}

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

app.http('templateImport', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'templates/import',
  handler: importTemplate,
});

app.http('template', {
  methods: ['GET', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'templates/{id}',
  handler: (req, context) =>
    (req.method === 'PUT' ? saveTemplate : req.method === 'DELETE' ? deleteTemplate : getTemplate)(
      req,
      context,
    ),
});
