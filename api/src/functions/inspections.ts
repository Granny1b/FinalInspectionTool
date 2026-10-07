/**
 * Inspections (brief §5.1, §5.3, §8): list and create inspections, read and save one. Finalise
 * and reopen are in inspection-state.ts.
 *
 *   GET  /api/inspections       inspector  InspectionSummary[], newest number first
 *   POST /api/inspections       inspector  CreateInspectionRequest → 201 Inspection + ETag
 *   GET  /api/inspections/{id}  inspector  Inspection + ETag
 *   PUT  /api/inspections/{id}  inspector  If-Match, InspectionDraftInput → Inspection + ETag
 */
import { app } from '@azure/functions';
import {
  CreateInspectionRequestSchema,
  InspectionDraftInputSchema,
  newId,
  snapshotTemplate,
  type Inspection,
  type InspectionDraftInput,
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
import {
  inspectionNotFound,
  loadInspection,
  loadSummaries,
  nextInspectionNumber,
  syncSettled,
  writeInspection,
} from '../lib/inspections';
import { loadLatestPublished, loadTemplate, templateNotFound } from '../lib/templates';

const FINALISED_MESSAGE = 'This inspection is finalised – an admin must reopen it.';

export const listInspections = endpoint({ role: 'inspector' }, async () =>
  json(200, await loadSummaries()),
);

/** Starts from a frozen copy of the template's latest published revision (brief §4). */
export const createInspection = endpoint({ role: 'inspector' }, async (req, _context, user) => {
  const { templateId, front } = await readJsonBody(req, CreateInspectionRequestSchema);
  const template = await loadTemplate(templateId);
  if (!template) throw templateNotFound();
  const revision = await loadLatestPublished(template);
  if (!revision) throw new ConflictError('Publish the template first.');

  // Taken last, so a refused request never uses up a number.
  const number = await nextInspectionNumber();
  const now = new Date().toISOString();
  const inspection: Inspection = {
    id: newId(),
    number,
    templateId,
    templateRevision: revision.revision,
    templateSnapshot: snapshotTemplate(revision),
    front: {
      ...front,
      modelCode: revision.modelCode,
      // Images never change, so the inspection can share the template's cover photo.
      photoId: front.photoId ?? revision.coverImageId,
    },
    results: {},
    extraDeviations: [],
    state: 'in_progress',
    createdAt: now,
    createdBy: user.email,
    updatedAt: now,
    updatedBy: user.email,
  };
  // Nothing to sync yet: a new inspection has no deviations.
  const etag = await writeInspection(inspection, { ifNoneMatch: '*' });
  return json(201, inspection, etagHeader(etag));
});

export const getInspection = endpoint({ role: 'inspector' }, async (req) => {
  const stored = await loadInspection(idParam(req));
  if (!stored) throw inspectionNotFound();
  return json(200, stored.data, etagHeader(stored.etag));
});

/**
 * Autosave. Only front page, results and extra deviations come from the client; the snapshot,
 * number, model and state never change here. The blob is written first and is the truth: if the
 * deviation sync fails after it, the save still succeeds and the next write syncs again. The sync
 * checks the blob afterwards, so a slow one can't undo a newer write's (`syncSettled`).
 */
export const saveInspection = endpoint({ role: 'inspector' }, async (req, context, user) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const input = await readJsonBody(req, InspectionDraftInputSchema);

  const current = await loadInspection(id);
  if (!current) throw inspectionNotFound();
  // Checked before anything else, so an outdated page always gets the conflict.
  if (current.etag !== ifMatch) throw new PreconditionFailedError();
  if (current.data.state === 'finalised') throw new ConflictError(FINALISED_MESSAGE);
  checkIds(current.data, input);

  const inspection: Inspection = {
    ...current.data,
    front: { ...input.front, modelCode: current.data.front.modelCode },
    results: input.results,
    extraDeviations: input.extraDeviations,
    updatedAt: new Date().toISOString(),
    updatedBy: user.email,
  };
  const etag = await writeInspection(inspection, { ifMatch });
  await syncSettled(inspection, etag, context).catch((error: unknown) => {
    context.warn(`Saved inspection ${id}; syncing its deviations failed`, error);
  });
  return json(200, inspection, etagHeader(etag));
});

/**
 * Results must belong to rows of the frozen checklist. Extra deviation ids share the deviation
 * table's RowKeys with those rows, so they must be unique and never equal a row id.
 */
function checkIds(inspection: Inspection, input: InspectionDraftInput): void {
  const itemIds = new Set(
    inspection.templateSnapshot.sections.flatMap((section) => section.items.map((item) => item.id)),
  );
  const unknown = Object.keys(input.results).filter((itemId) => !itemIds.has(itemId));
  if (unknown.length > 0) {
    throw new BadRequestError(`These rows are not in this inspection: ${unknown.join(', ')}.`);
  }
  const used = new Set(itemIds);
  const clashes = new Set<string>();
  for (const { id } of input.extraDeviations) {
    if (used.has(id)) clashes.add(id);
    used.add(id);
  }
  if (clashes.size > 0) {
    throw new BadRequestError(`Each extra deviation needs its own id: ${[...clashes].join(', ')}.`);
  }
}

// One function per route; the methods share it (keeps the registration count low).
app.http('inspections', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'inspections',
  handler: (req, context) =>
    (req.method === 'POST' ? createInspection : listInspections)(req, context),
});

app.http('inspection', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'inspections/{id}',
  handler: (req, context) => (req.method === 'PUT' ? saveInspection : getInspection)(req, context),
});
