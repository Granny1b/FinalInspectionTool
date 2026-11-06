/**
 * Inspections (brief §5.1, §5.3, §8): list and create inspections, read, save and delete one.
 * Finalise and reopen are in inspection-state.ts. A quality check done on a machine is an
 * inspection of kind `quality`, made from a published quality check: every route takes both.
 *
 *   GET    /api/inspections       inspector  InspectionSummary[] (both kinds), newest number first
 *   POST   /api/inspections       inspector  CreateInspectionRequest, or StartQualityCheckRequest
 *                                            for a quality check → 201 Inspection + ETag
 *   GET    /api/inspections/{id}  inspector  Inspection + ETag
 *   PUT    /api/inspections/{id}  inspector  If-Match, InspectionDraftInput → Inspection + ETag
 *   DELETE /api/inspections/{id}  admin      If-Match → 204
 */
import { app } from '@azure/functions';
import {
  CreateInspectionRequestSchema,
  IdSchema,
  INSPECTION_NOUNS,
  InspectionDraftInputSchema,
  newId,
  snapshotTemplate,
  StartQualityCheckRequestSchema,
  type Inspection,
  type InspectionDraftInput,
  type InspectionFront,
  type InspectionKind,
  type Template,
} from '@modig/shared';
import { z } from 'zod';
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
  deleteInspection as deleteStoredInspection,
  inspectionNotFound,
  loadInspection,
  loadSummaries,
  nextInspectionNumber,
  syncSettled,
  writeInspection,
} from '../lib/inspections';
import { loadLatestPublished, loadTemplate, templateNotFound } from '../lib/templates';

const finalisedMessage = (kind: InspectionKind) =>
  `This ${INSPECTION_NOUNS[kind]} is finalised – an admin must reopen it.`;

export const listInspections = endpoint({ role: 'inspector' }, async () =>
  json(200, await loadSummaries()),
);

/** What every create body has; the rest depends on the template's kind. */
const CreateBodySchema = z.object({ templateId: IdSchema, front: z.unknown() });

/**
 * Starts from a frozen copy of the template's latest published revision (brief §4). A final
 * inspection template makes a final inspection (FI- number); a quality check makes a quality check
 * done on its machine (kind `quality`, QC- number), with the shorter front page of
 * StartQualityCheckRequest. The body is checked against the kind's request once the template is
 * known.
 */
export const createInspection = endpoint({ role: 'inspector' }, async (req, _context, user) => {
  const body = await readJsonBody(req, CreateBodySchema);
  const template = await loadTemplate(body.templateId);
  if (!template) throw templateNotFound();
  const kind = template.draft.kind;
  const front = createFront(kind, body);
  const revision = await loadLatestPublished(template);
  if (!revision) {
    throw new ConflictError(
      kind === 'quality' ? 'Publish the quality check first.' : 'Publish the template first.',
    );
  }

  // Taken last, so a refused request never uses up a number.
  const number = await nextInspectionNumber(kind);
  const now = new Date().toISOString();
  const inspection: Inspection = {
    id: newId(),
    kind,
    number,
    templateId: body.templateId,
    templateRevision: revision.revision,
    templateSnapshot: snapshotTemplate(revision),
    front: front(revision),
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

/**
 * The new inspection's front page from the request, checked against its kind's rules (400 with
 * the problems, as any invalid body). A final inspection takes the template's cover photo unless
 * it has one of its own; a quality check has no machine name, location or photo.
 */
function createFront(
  kind: InspectionKind,
  body: z.infer<typeof CreateBodySchema>,
): (revision: Template) => InspectionFront {
  if (kind === 'quality') {
    const { front } = parseBody(StartQualityCheckRequestSchema, body);
    return (revision) => ({
      machineName: '',
      modelCode: revision.modelCode,
      serialNumber: front.serialNumber,
      participants: front.participants,
      location: '',
      date: front.date,
    });
  }
  const { front } = parseBody(CreateInspectionRequestSchema, body);
  return (revision) => ({
    ...front,
    modelCode: revision.modelCode,
    // Images never change, so the inspection can share the template's cover photo.
    photoId: front.photoId ?? revision.coverImageId,
  });
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError('The request body is invalid.', result.error.issues);
  }
  return result.data;
}

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
  if (current.data.state === 'finalised') {
    throw new ConflictError(finalisedMessage(current.data.kind));
  }
  checkIds(current.data, input);

  const inspection: Inspection = {
    ...current.data,
    front: savedFront(current.data, input),
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
 * Deletes an inspection for good, in progress or finalised (mainly to clear out trial ones while
 * setting the app up). If-Match is the version the admin is looking at, so nobody's newer save is
 * deleted unseen. Its deviation rows and the photos only it uses go with it.
 */
export const deleteInspection = endpoint({ role: 'admin' }, async (req, context) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const current = await loadInspection(id);
  if (!current) throw inspectionNotFound();
  // As for saves: an outdated page sees the conflict, before anything is deleted.
  if (current.etag !== ifMatch) throw new PreconditionFailedError();
  await deleteStoredInspection(current.data, ifMatch, context);
  return { status: 204 };
});

/**
 * The front page as saved: the model never changes, and a quality check never gets the fields its
 * front page doesn't have (machine name, location, photo), whatever is sent.
 */
function savedFront(current: Inspection, input: InspectionDraftInput): InspectionFront {
  const { modelCode } = current.front;
  if (current.kind !== 'quality') return { ...input.front, modelCode };
  const { serialNumber, participants, date } = input.front;
  return { machineName: '', modelCode, serialNumber, participants, location: '', date };
}

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
  methods: ['GET', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'inspections/{id}',
  handler: (req, context) =>
    (req.method === 'PUT'
      ? saveInspection
      : req.method === 'DELETE'
        ? deleteInspection
        : getInspection)(req, context),
});
