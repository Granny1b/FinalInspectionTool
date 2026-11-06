/**
 * Templates (brief §5.2, §8): list, create, import and delete templates, read and save a
 * template's draft. Publishing and published revisions are in template-revisions.ts. A quality
 * check is a template too (`kind: 'quality'`, under its machine's final inspection template):
 * the same routes create, import, save and delete it.
 *
 *   GET    /api/templates         inspector  TemplateSummary[]
 *   POST   /api/templates         admin      CreateTemplateRequest | CreateQualityCheckRequest
 *                                            → 201 TemplateDetail + ETag
 *   POST   /api/templates/import  admin      ImportTemplateRequest | ImportQualityCheckRequest
 *                                            → 201 ImportTemplateResponse + ETag
 *   GET    /api/templates/{id}    admin      TemplateDetail + ETag
 *   PUT    /api/templates/{id}    admin      If-Match, TemplateDraftInput
 *                                            → SaveTemplateResponse + ETag
 *   DELETE /api/templates/{id}    admin      If-Match → 204 (a final inspection template's
 *                                            quality checks go with it)
 */
import { app } from '@azure/functions';
import {
  blobNames,
  checklistIds,
  CONTAINERS,
  CreateAnyTemplateRequestSchema,
  hasUnpublishedChanges,
  ImportAnyTemplateRequestSchema,
  newId,
  newModelConflict,
  newQualityFront,
  qualityCheckTitle,
  TemplateDraftInputSchema,
  templateImageIds,
  TemplateSchema,
  withAvailableImages,
  withNewIds,
  type ImportQualityCheckRequest,
  type ImportTemplateResponse,
  type MachineModel,
  type QualityFront,
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
  NotFoundError,
  PreconditionFailedError,
  readJsonBody,
  requireIfMatch,
} from '../lib/http';
import { loadSettings, updateSettings } from '../lib/settings';
import { writeJson } from '../lib/storage';
import {
  deleteQualityCheck,
  deleteTemplate as deleteStoredTemplate,
  duplicateIds,
  findTemplateForModel,
  loadAllTemplates,
  loadDetail,
  loadLatestPublished,
  loadQualityChecks,
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
  const body = await readJsonBody(req, CreateAnyTemplateRequestSchema);
  let created: { draft: Template; etag: string };
  if (body.kind === 'quality') {
    const machine = await loadMachine(body.parentId);
    created = await writeNewDraft({
      kind: 'quality',
      parentId: machine.id,
      modelCode: machine.draft.modelCode,
      // Filled in on its front page; who made it and when start as the admin and today.
      ...withQuality(
        newQualityFront({ ...body, madeBy: user.name, date: swedishDate.format(new Date()) }),
      ),
      // The editor starts from an empty state with "+ Add section".
      sections: [],
      updatedBy: user.email,
    });
  } else {
    const { name, modelCode, newModel } = body;
    await prepareModel(modelCode, newModel, user.email);
    created = await writeNewDraft({
      kind: 'final',
      name,
      modelCode,
      // The editor starts from an empty state with "+ Add section".
      sections: [],
      updatedBy: user.email,
    });
  }
  const { draft, etag } = created;
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
  const body = await readJsonBody(req, ImportAnyTemplateRequestSchema);
  if (body.kind === 'quality') return importQualityCheck(body, user.email);
  const { name, modelCode, newModel, file } = body;
  const { coverImageId, sections } = file.template;
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
    kind: 'final',
    name,
    modelCode,
    ...(checklist.coverImageId && { coverImageId: checklist.coverImageId }),
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

/**
 * A new quality check draft from a quality check file, under the machine it is imported on, with
 * the name the admin chose and the rest of the file's front page. Every section
 * and row gets a new id (a quality check's rows have no history yet), and images this
 * installation doesn't have are left out, as for a template.
 */
async function importQualityCheck(body: ImportQualityCheckRequest, by: string) {
  const { parentId, name, file } = body;
  const { quality, sections } = file.qualityCheck;
  const [machine, stored] = await Promise.all([
    loadMachine(parentId),
    storedImages(templateImageIds({ sections })),
  ]);
  const { template: checklist, dropped } = withAvailableImages(
    { sections: withNewIds(sections) },
    stored,
  );
  const { draft, etag } = await writeNewDraft({
    kind: 'quality',
    parentId: machine.id,
    modelCode: machine.draft.modelCode,
    ...withQuality({ ...quality, name }),
    sections: checklist.sections,
    updatedBy: by,
  });
  const imported: ImportTemplateResponse = {
    draft,
    revisions: [],
    hasUnpublishedChanges: true,
    droppedImages: dropped,
  };
  return json(201, imported, etagHeader(etag));
}

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
  const { kind, parentId } = current.draft;
  // An unchanged model is not re-checked: a model removed from the settings later must not make
  // its template unsaveable. A quality check keeps its machine's model.
  if (kind === 'final' && input.modelCode !== current.draft.modelCode) {
    await checkModel(input.modelCode, id);
  }

  const { quality, ...content } = input;
  const draft: Template = {
    id,
    kind,
    ...(kind === 'quality'
      ? {
          ...content,
          ...(parentId && { parentId }),
          modelCode: current.draft.modelCode,
          // Its name follows its front page; a front page left out stays as it was.
          ...withQuality(quality ?? current.draft.quality ?? newQualityFront(EMPTY_FRONT)),
        }
      : // A final inspection template has no front page of a quality check.
        content),
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
 * so nobody's newer save is deleted unseen. A final inspection template's quality checks go with
 * it, after it (best effort: the machine's template is already gone). Inspections, their
 * deviation rows and all images stay.
 */
export const deleteTemplate = endpoint({ role: 'admin' }, async (req, context) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const current = await loadTemplate(id);
  if (!current) throw templateNotFound();
  // As for saves: an outdated page sees the conflict, before anything is deleted.
  if (current.etag !== ifMatch) throw new PreconditionFailedError();
  await deleteStoredTemplate(id, ifMatch, context);
  if (current.draft.kind === 'final') {
    const checks = await loadQualityChecks(id).catch((error: unknown) => {
      context.warn(`Deleted template ${id}; listing its quality checks failed`, error);
      return [];
    });
    await Promise.all(checks.map((check) => deleteQualityCheck(check.id, context)));
  }
  return { status: 204 };
});

/** A quality check's front page with the title that follows from it ("Quality check – Pre start up"). */
function withQuality(quality: QualityFront): { name: string; quality: QualityFront } {
  return { name: qualityCheckTitle(quality), quality };
}

const EMPTY_FRONT = { name: '' };

/** "2026-11-05" in Sweden, where the checks are written. */
const swedishDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' });

/**
 * The machine a quality check belongs to: its final inspection template. 404 when it doesn't
 * exist, 400 when the id is a quality check's.
 */
async function loadMachine(parentId: string) {
  const machine = await loadTemplate(parentId);
  if (!machine) {
    throw new NotFoundError('The final inspection template of this machine does not exist.');
  }
  if (machine.draft.kind !== 'final') {
    throw new BadRequestError(
      "A quality check belongs to a machine's final inspection template, not to another quality check.",
    );
  }
  return machine;
}

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
  // A template may already use the code without the settings having it (a model removed since);
  // in any case, as for the settings' codes. Quality checks have their machine's code.
  const other = (await loadAllTemplates()).find(
    (template) =>
      template.draft.kind === 'final' &&
      template.draft.modelCode.toLowerCase() === modelCode.toLowerCase(),
  );
  if (other) {
    throw new ConflictError(
      `"${other.draft.name}" already uses the model code ${other.draft.modelCode}.`,
    );
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
