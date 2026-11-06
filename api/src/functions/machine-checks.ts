/**
 * A machine's checks (shared/src/machines.ts): starting one, its own checklist, bringing it up to
 * a newer revision of its template, and which machine an inspection belongs to.
 *
 *   POST /api/inspections/{id}/start            inspector  StartCheckRequest → Inspection + ETag
 *   PUT  /api/inspections/{id}/checklist        admin      If-Match, ChecklistInput
 *                                                          → Inspection + ETag
 *   POST /api/inspections/{id}/template-update  admin      If-Match, TemplateUpdateRequest
 *                                                          → Inspection + ETag
 *   PUT  /api/inspections/{id}/machine          admin      If-Match, MachineLinkRequest
 *                                                          → Inspection + ETag
 */
import { app, type InvocationContext } from '@azure/functions';
import {
  ChecklistInputSchema,
  INSPECTION_NOUNS,
  MachineLinkRequestSchema,
  mergeChecklists,
  resultIdsOf,
  snapshotTemplate,
  StartCheckRequestSchema,
  swedishDay,
  TemplateUpdateRequestSchema,
  type Inspection,
  type Section,
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
import {
  changeInspection,
  inspectionNotFound,
  loadInspection,
  nextInspectionNumber,
  syncSettled,
  writeInspection,
  type StoredInspection,
} from '../lib/inspections';
import { loadMachine, machineNotFound, withMachineFront } from '../lib/machines';
import { duplicateIds, loadRevision } from '../lib/templates';

/**
 * Starts a machine's check: it gets the next number of its series and is in progress, with the
 * machine's Machine ID and serial number, today's date and the person starting it as Checked by
 * (unless given). No If-Match: starting changes nothing anyone typed, and starting one that is
 * already started (someone was quicker, or a retry) answers with it as it is.
 */
export const startCheck = endpoint({ role: 'inspector' }, async (req, _context, user) => {
  const id = idParam(req);
  const body = await readJsonBody(req, StartCheckRequestSchema);
  const current = await loadInspection(id);
  if (!current) throw inspectionNotFound();
  if (current.data.state !== 'not_started') {
    return json(200, current.data, etagHeader(current.etag));
  }
  const machine = current.data.machineRef ? await loadMachine(current.data.machineRef) : null;
  // Taken once, before the write: a write that has to be tried again keeps this number.
  const number = await nextInspectionNumber(current.data.kind);
  const now = new Date();
  const stored = await changeInspection(id, (inspection) => {
    if (inspection.state !== 'not_started') return null;
    const front = machine
      ? {
          ...inspection.front,
          machineName: machine.data.machineName,
          serialNumber: machine.data.serialNumber,
        }
      : inspection.front;
    return {
      ...inspection,
      number,
      state: 'in_progress',
      front: {
        ...front,
        date: body.date ?? swedishDay(now),
        participants: body.participants ?? [user.name || user.email],
      },
      updatedAt: now.toISOString(),
      updatedBy: user.email,
    };
  });
  if (!stored) throw inspectionNotFound();
  // Nothing to sync: a check that just started has no deviations.
  return json(200, stored.data, etagHeader(stored.etag));
});

/**
 * Saves a machine's check's own checklist (admins): rows and sections added, changed, moved or
 * removed for this machine only. A row removed takes its result with it (the page asks first).
 * Started checks' deviation rows follow (their refs and texts may have changed).
 */
export const saveChecklist = endpoint({ role: 'admin' }, async (req, context, user) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const { sections } = await readJsonBody(req, ChecklistInputSchema);
  checkIds(sections);
  const current = await loadEditable(id, ifMatch);
  const changed: Inspection = {
    ...current.data,
    templateSnapshot: { ...current.data.templateSnapshot, sections },
    results: resultsOf(current.data, sections),
    updatedAt: new Date().toISOString(),
    updatedBy: user.email,
  };
  return commit(changed, ifMatch, context);
});

/**
 * Brings a machine's check up to revision `revision` of its template (admins): a three-way merge
 * of the revision it is based on, that revision and the check's own checklist
 * (checklistMerge.ts), with the choices made in the preview. Its results stay on their rows; a row
 * the merge removes takes its result with it. Afterwards the check is based on `revision`.
 */
export const updateToTemplate = endpoint({ role: 'admin' }, async (req, context, user) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const request = await readJsonBody(req, TemplateUpdateRequestSchema);
  const current = await loadEditable(id, ifMatch);
  const { templateId, templateRevision } = current.data;
  if (request.revision <= templateRevision) {
    throw new ConflictError(`This check is already based on revision ${templateRevision}.`);
  }
  const [base, theirs] = await Promise.all([
    loadRevision(templateId, templateRevision),
    loadRevision(templateId, request.revision),
  ]);
  if (!theirs) throw new NotFoundError(`Its template has no revision ${request.revision}.`);
  if (!base) {
    throw new ConflictError(
      `Revision ${templateRevision} of its template, which this check is based on, can’t be read.`,
    );
  }
  const { checklist } = mergeChecklists({
    base: snapshotTemplate(base),
    theirs: snapshotTemplate(theirs),
    ours: current.data.templateSnapshot,
    resultIds: resultIdsOf(current.data.results),
    choices: { takeTemplate: request.takeTemplate, removeRows: request.removeRows },
  });
  const changed: Inspection = {
    ...current.data,
    templateRevision: request.revision,
    templateSnapshot: checklist,
    results: resultsOf(current.data, checklist.sections),
    updatedAt: new Date().toISOString(),
    updatedBy: user.email,
  };
  return commit(changed, ifMatch, context);
});

/**
 * Links an inspection to a machine of its model, or unlinks it (admins). One that is not finalised
 * takes the machine's Machine ID and serial number, as its checks do; a finalised one keeps the
 * front page it was finalised with. A check that is not started belongs to its machine and can't
 * be moved.
 */
export const linkMachine = endpoint({ role: 'admin' }, async (req, context, user) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const { machineRef } = await readJsonBody(req, MachineLinkRequestSchema);
  const current = await loadInspection(id);
  if (!current) throw inspectionNotFound();
  if (current.etag !== ifMatch) throw new PreconditionFailedError();
  if (current.data.state === 'not_started') {
    throw new ConflictError('A check that is not started belongs to its machine.');
  }
  if (machineRef === (current.data.machineRef ?? null)) {
    return json(200, current.data, etagHeader(current.etag));
  }
  const now = new Date().toISOString();
  let changed: Inspection;
  if (machineRef === null) {
    const { machineRef: _unlinked, ...rest } = current.data;
    changed = { ...rest, updatedAt: now, updatedBy: user.email };
  } else {
    const machine = await loadMachine(machineRef);
    if (!machine) throw machineNotFound();
    if (machine.data.modelCode !== current.data.front.modelCode) {
      throw new BadRequestError(
        `${machine.data.machineName} is of another model than this ${INSPECTION_NOUNS[current.data.kind]}.`,
      );
    }
    changed = {
      ...(withMachineFront(current.data, machine.data, user.email) ?? current.data),
      machineRef,
      updatedAt: now,
      updatedBy: user.email,
    };
  }
  return commit(changed, ifMatch, context);
});

/**
 * A machine's check whose checklist may change: it exists, is the version the admin looked at,
 * belongs to a machine and is not finalised.
 */
async function loadEditable(id: string, ifMatch: string): Promise<StoredInspection> {
  const current = await loadInspection(id);
  if (!current) throw inspectionNotFound();
  if (current.etag !== ifMatch) throw new PreconditionFailedError();
  const noun = INSPECTION_NOUNS[current.data.kind];
  if (!current.data.machineRef) {
    throw new ConflictError(
      `Only a machine’s checks have a checklist of their own: link this ${noun} to a machine first.`,
    );
  }
  if (current.data.state === 'finalised') {
    throw new ConflictError(`This ${noun} is finalised – an admin must reopen it.`);
  }
  return current;
}

/** The results of the rows still in the checklist. */
function resultsOf(inspection: Inspection, sections: readonly Section[]): Inspection['results'] {
  const itemIds = new Set(sections.flatMap((section) => section.items.map((item) => item.id)));
  return Object.fromEntries(
    Object.entries(inspection.results).filter(([itemId]) => itemIds.has(itemId)),
  );
}

/** Section and row ids must be unique: results and KPIs key on row ids. */
function checkIds(sections: readonly Section[]): void {
  const duplicates = duplicateIds(sections);
  if (duplicates.length > 0) {
    throw new BadRequestError(`Each section and row needs its own id: ${duplicates.join(', ')}.`);
  }
}

/**
 * Writes the change over the version read; a started check's deviation rows follow. No row may
 * take an extra deviation's id: they share the deviation table's RowKeys.
 */
async function commit(changed: Inspection, ifMatch: string, context: InvocationContext) {
  const extras = new Set(changed.extraDeviations.map((extra) => extra.id));
  const clash = changed.templateSnapshot.sections
    .flatMap((section) => section.items)
    .find((item) => extras.has(item.id));
  if (clash)
    throw new BadRequestError(`A row can't have the id of an extra deviation: ${clash.id}.`);
  const etag = await writeInspection(changed, { ifMatch });
  if (changed.state === 'in_progress') {
    await syncSettled(changed, etag, context).catch((error: unknown) => {
      context.warn(`Changed inspection ${changed.id}; syncing its deviations failed`, error);
    });
  }
  return json(200, changed, etagHeader(etag));
}

app.http('inspectionStart', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'inspections/{id}/start',
  handler: startCheck,
});

app.http('inspectionChecklist', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'inspections/{id}/checklist',
  handler: saveChecklist,
});

app.http('inspectionTemplateUpdate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'inspections/{id}/template-update',
  handler: updateToTemplate,
});

app.http('inspectionMachine', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'inspections/{id}/machine',
  handler: linkMachine,
});
