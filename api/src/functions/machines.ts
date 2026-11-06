/**
 * Machines (shared/src/machines.ts): the machines being built, each with its own copies of its
 * model's checks.
 *
 *   GET    /api/machines                   inspector  MachineSummary[]
 *   POST   /api/machines                   inspector  CreateMachineRequest
 *                                                     → 201 MachineDetail + ETag
 *   POST   /api/machines/from-inspections  admin      → MachinesFromInspectionsResult
 *   GET    /api/machines/{id}              inspector  MachineDetail + ETag
 *   PUT    /api/machines/{id}              admin      If-Match, UpdateMachineRequest
 *                                                     → MachineDetail + ETag
 *   DELETE /api/machines/{id}              admin      If-Match → 204 (409 once a check started)
 *   POST   /api/machines/{id}/checks       inspector  AddMachineCheckRequest
 *                                                     → 201 MachineDetail + ETag
 *
 * A machine's checks are inspections (`machineRef`); starting, editing and updating one go
 * through the inspection routes (machine-checks.ts).
 */
import { app, type InvocationContext } from '@azure/functions';
import {
  AddMachineCheckRequestSchema,
  CreateMachineRequestSchema,
  isStarted,
  machineNameTaken,
  machineProgress,
  newId,
  planMachinesFromInspections,
  UpdateMachineRequestSchema,
  type Inspection,
  type Machine,
  type MachineDetail,
  type MachinesFromInspectionsResult,
  type MachineSummary,
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
  changeInspection,
  deleteInspection,
  loadInspection,
  loadSummaries,
  syncSettled,
} from '../lib/inspections';
import {
  checksByMachine,
  checkTemplate,
  deleteMachineBlob,
  deviationCounts,
  loadMachine,
  loadMachines,
  machineChecks,
  machineNotFound,
  newMachineCheck,
  storeMachineCheck,
  updateChecksFront,
  withMachineFront,
  writeMachine,
} from '../lib/machines';
import { loadSettings } from '../lib/settings';
import { loadAllTemplates } from '../lib/templates';

/** Machine IDs, by name ("Magellan#2" before "Magellan#10"). */
const BY_NAME = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/**
 * Every machine with how far it has come: its checks of each kind (from the inspection list) and
 * its deviations open and closed (from the deviations table, as the deviation log counts them).
 */
export const listMachines = endpoint({ role: 'inspector' }, async (_req, context) => {
  const [machines, summaries, counts] = await Promise.all([
    loadMachines(),
    loadSummaries(),
    deviationCounts().catch((error: unknown) => {
      context.warn('The machines list could not count deviations', error);
      return new Map<string, { open: number; closed: number }>();
    }),
  ]);
  const checks = checksByMachine(summaries);
  const list = machines.map((machine): MachineSummary => {
    const own = checks.get(machine.id) ?? [];
    const deviations = { open: 0, closed: 0 };
    for (const check of own) {
      const count = counts.get(check.id);
      deviations.open += count?.open ?? 0;
      deviations.closed += count?.closed ?? 0;
    }
    return { ...machine, progress: machineProgress(own, deviations) };
  });
  return json(
    200,
    list.sort((a, b) => BY_NAME.compare(a.machineName, b.machineName) || a.id.localeCompare(b.id)),
  );
});

/**
 * A new machine with copies of the templates ticked for it, each not started. Everything is
 * checked before anything is written (a known model, a Machine ID no other machine has, each
 * template published and of the model); then the machine, then its checks. A check that fails to be written
 * is logged and left out: it can be added on the machine's page.
 */
export const createMachine = endpoint({ role: 'inspector' }, async (req, context, user) => {
  const body = await readJsonBody(req, CreateMachineRequestSchema);
  const [settings, machines, templates] = await Promise.all([
    loadSettings(),
    loadMachines(),
    loadAllTemplates(),
  ]);
  // A model of the settings, or one a final inspection template has (removed from the settings
  // since, as a model can be: its template, and so its checks, are still there).
  const known =
    settings?.machineModels.some((model) => model.code === body.modelCode) ||
    templates.some(
      (template) => template.draft.kind === 'final' && template.draft.modelCode === body.modelCode,
    );
  if (!known) throw new BadRequestError(`Unknown machine model "${body.modelCode}".`);
  const taken = machineNameTaken(machines, body.machineName);
  if (taken) throw new ConflictError(taken);
  const now = new Date().toISOString();
  const machine: Machine = {
    id: newId(),
    machineName: body.machineName,
    modelCode: body.modelCode,
    serialNumber: body.serialNumber,
    createdAt: now,
    createdBy: user.email,
    updatedAt: now,
    updatedBy: user.email,
  };
  const revisions = await Promise.all(body.templateIds.map((id) => checkTemplate(machine, id)));
  const etag = await writeMachine(machine, { ifNoneMatch: '*' });
  const written = await Promise.allSettled(
    revisions.map((revision) =>
      storeMachineCheck(newMachineCheck(machine, revision, settings, user.email)),
    ),
  );
  written.forEach((result, index) => {
    if (result.status === 'rejected') {
      context.warn(
        `Machine ${machine.id}: its copy of ${body.templateIds[index]} could not be written`,
        result.reason,
      );
    }
  });
  return json(201, await detail(machine, context), etagHeader(etag));
});

export const getMachine = endpoint({ role: 'inspector' }, async (req, context) => {
  const stored = await loadMachine(idParam(req));
  if (!stored) throw machineNotFound();
  return json(200, await detail(stored.data, context), etagHeader(stored.etag));
});

/**
 * A new Machine ID or serial number (admins). Its checks that are not finalised get them on their front
 * pages (and their deviation rows); finalised ones keep what they were finalised with.
 */
export const updateMachine = endpoint({ role: 'admin' }, async (req, context, user) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const body = await readJsonBody(req, UpdateMachineRequestSchema);
  const [stored, machines] = await Promise.all([loadMachine(id), loadMachines()]);
  if (!stored) throw machineNotFound();
  if (stored.etag !== ifMatch) throw new PreconditionFailedError();
  const taken = machineNameTaken(machines, body.machineName, id);
  if (taken) throw new ConflictError(taken);
  const machine: Machine = {
    ...stored.data,
    ...body,
    updatedAt: new Date().toISOString(),
    updatedBy: user.email,
  };
  const etag = await writeMachine(machine, { ifMatch });
  const checks = (await loadSummaries()).filter((check) => check.machineRef === id);
  await updateChecksFront(machine, checks, user.email, context);
  return json(200, await detail(machine, context), etagHeader(etag));
});

/**
 * Deletes a machine nobody has started a check on (a machine made by mistake), with its checks.
 * Once a check is started it holds work and a number: 409. The checks go first, each only while
 * it is still not started, then the machine, only while it is the version the admin looked at.
 */
export const deleteMachine = endpoint({ role: 'admin' }, async (req, context) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const stored = await loadMachine(id);
  if (!stored) throw machineNotFound();
  if (stored.etag !== ifMatch) throw new PreconditionFailedError();
  const checks = (await loadSummaries()).filter((check) => check.machineRef === id);
  if (checks.some(isStarted)) throw new ConflictError(STARTED_MESSAGE);
  for (const check of checks) {
    const current = await loadInspection(check.id);
    if (!current) continue;
    if (current.data.state !== 'not_started') throw new ConflictError(STARTED_MESSAGE);
    await deleteInspection(current.data, current.etag, context);
  }
  await deleteMachineBlob(id, ifMatch);
  return { status: 204 };
});

const STARTED_MESSAGE =
  'A check has been started on this machine, so it can’t be deleted. Delete its checks first, or keep it.';

/** Another check: one not ticked when the machine was made, or one published since. */
export const addMachineCheck = endpoint({ role: 'inspector' }, async (req, context, user) => {
  const id = idParam(req);
  const { templateId } = await readJsonBody(req, AddMachineCheckRequestSchema);
  const stored = await loadMachine(id);
  if (!stored) throw machineNotFound();
  const checks = (await loadSummaries()).filter((check) => check.machineRef === id);
  const existing = checks.find((check) => check.templateId === templateId);
  if (existing) {
    throw new ConflictError(`This machine already has “${existing.templateName}”.`);
  }
  const [revision, settings] = await Promise.all([
    checkTemplate(stored.data, templateId),
    loadSettings(),
  ]);
  await storeMachineCheck(newMachineCheck(stored.data, revision, settings, user.email));
  return json(201, await detail(stored.data, context), etagHeader(stored.etag));
});

/**
 * The one-time action for inspections done before machines existed (planMachinesFromInspections):
 * a machine for each Machine ID and model among them, and each linked to its machine. Linking
 * puts the machine's Machine ID and serial number on the front page of one that is not finalised.
 * Running it again only links what is new; anything that matches nothing stays as it was.
 */
export const machinesFromInspections = endpoint({ role: 'admin' }, async (_req, context, user) => {
  const [summaries, machines] = await Promise.all([loadSummaries(), loadMachines()]);
  const plan = planMachinesFromInspections(summaries, machines);
  const byId = new Map(machines.map((machine) => [machine.id, machine]));
  let created = 0;
  const links: { machine: Machine; inspectionIds: string[] }[] = [];
  for (const entry of plan.link) {
    const machine = byId.get(entry.machineId);
    if (machine) links.push({ machine, inspectionIds: entry.inspectionIds });
  }
  for (const { inspectionIds, ...fields } of plan.create) {
    const now = new Date().toISOString();
    const machine: Machine = {
      id: newId(),
      ...fields,
      createdAt: now,
      createdBy: user.email,
      updatedAt: now,
      updatedBy: user.email,
    };
    await writeMachine(machine, { ifNoneMatch: '*' });
    created += 1;
    links.push({ machine, inspectionIds });
  }
  let linked = 0;
  for (const { machine, inspectionIds } of links) {
    for (const inspectionId of inspectionIds) {
      if (await link(inspectionId, machine, user.email, context)) linked += 1;
    }
  }
  const result: MachinesFromInspectionsResult = {
    created,
    linked,
    unmatched: plan.unmatched.length,
  };
  return json(200, result);
});

/** Links one inspection that has no machine yet; false when it got one meanwhile (or is gone). */
async function link(
  inspectionId: string,
  machine: Machine,
  by: string,
  context: InvocationContext,
): Promise<boolean> {
  let changed = false;
  const stored = await changeInspection(inspectionId, (current) => {
    if (current.machineRef) return null;
    changed = true;
    const withFront: Inspection = withMachineFront(current, machine, by) ?? current;
    return { ...withFront, machineRef: machine.id };
  });
  if (stored && changed && stored.data.state === 'in_progress') {
    await syncSettled(stored.data, stored.etag, context).catch((error: unknown) => {
      context.warn(`Linked inspection ${inspectionId}; syncing its deviations failed`, error);
    });
  }
  return Boolean(stored) && changed;
}

async function detail(machine: Machine, context: InvocationContext): Promise<MachineDetail> {
  return { machine, checks: await machineChecks(machine, context) };
}

// One function per route; the methods share it (keeps the registration count low).
app.http('machines', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'machines',
  handler: (req, context) => (req.method === 'POST' ? createMachine : listMachines)(req, context),
});

app.http('machinesFromInspections', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'machines/from-inspections',
  handler: machinesFromInspections,
});

app.http('machine', {
  methods: ['GET', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  route: 'machines/{id}',
  handler: (req, context) =>
    (req.method === 'PUT' ? updateMachine : req.method === 'DELETE' ? deleteMachine : getMachine)(
      req,
      context,
    ),
});

app.http('machineChecks', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'machines/{id}/checks',
  handler: addMachineCheck,
});
