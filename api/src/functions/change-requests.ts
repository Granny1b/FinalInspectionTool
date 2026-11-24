/**
 * Change requests (shared/src/changeRequests.ts): a step of an assembly instruction flagged as
 * wrong by whoever reads it, for the admins to fix.
 *
 *   POST /api/change-requests           inspector  CreateChangeRequest → 201 ChangeRequest
 *   GET  /api/change-requests           admin      ChangeRequest[] (open first)
 *   GET  /api/change-requests/summary   admin      ChangeRequestSummary (how many are open)
 *   POST /api/change-requests/{id}      admin      UpdateChangeRequest → ChangeRequest
 *   DELETE /api/change-requests/{id}    admin      → 204
 */
import { app } from '@azure/functions';
import {
  blobNames,
  ChangeRequestSchema,
  compareChangeRequests,
  CONTAINERS,
  CreateChangeRequestSchema,
  newId,
  stepRef,
  UpdateChangeRequestSchema,
  type ChangeRequest,
  type ChangeRequestSummary,
  type Section,
} from '@modig/shared';
import { BadRequestError, endpoint, idParam, json, NotFoundError, readJsonBody } from '../lib/http';
import { loadMachineAssemblies } from '../lib/machineAssemblies';
import { loadMachine } from '../lib/machines';
import { containerClient, ensureStorage, listBlobNames, readJson, writeJson } from '../lib/storage';
import { loadLatestPublished, loadTemplate } from '../lib/templates';

const { config } = CONTAINERS;

function requestNotFound(): NotFoundError {
  return new NotFoundError('This change request does not exist.');
}

async function loadAll(): Promise<ChangeRequest[]> {
  const names = await listBlobNames(config, blobNames.changeRequestPrefix);
  const loaded = await Promise.all(
    names.map((name) => readJson(config, name, ChangeRequestSchema)),
  );
  return loaded.flatMap((stored) => (stored ? [stored.data] : []));
}

/** The task and the step with this id among these sections, with the step's number. */
function findStep(sections: readonly Section[], itemId: string) {
  for (const [taskIndex, section] of sections.entries()) {
    const stepIndex = section.items.findIndex((item) => item.id === itemId);
    const item = section.items[stepIndex];
    if (item) return { taskTitle: section.title, stepRef: stepRef(taskIndex, stepIndex), item };
  }
  return null;
}

/**
 * Flags a step. What was read is recorded with it: the machine's copy of the instruction when it
 * is flagged on a machine, else the instruction's latest published revision.
 */
export const createChangeRequest = endpoint({ role: 'inspector' }, async (req, _context, user) => {
  const body = await readJsonBody(req, CreateChangeRequestSchema);
  const template = await loadTemplate(body.templateId);
  if (!template || template.draft.kind !== 'assembly') {
    throw new NotFoundError('This assembly instruction does not exist.');
  }
  let read: { name: string; revision: number; sections: Section[] } | null = null;
  let machine: { id: string; machineName: string } | null = null;
  if (body.machineId) {
    const stored = await loadMachine(body.machineId);
    const copy = (await loadMachineAssemblies(body.machineId)).find(
      (assembly) => assembly.templateId === body.templateId,
    );
    if (!stored || !copy) throw new NotFoundError('This machine does not have that instruction.');
    machine = stored.data;
    read = { name: copy.name, revision: copy.templateRevision, sections: copy.sections };
  } else {
    const published = await loadLatestPublished(template);
    if (published) read = published;
  }
  const step = read && findStep(read.sections, body.itemId);
  if (!read || !step) {
    throw new BadRequestError('This step is not in the instruction any more. Reload the page.');
  }
  const request: ChangeRequest = {
    id: newId(),
    templateId: body.templateId,
    itemId: body.itemId,
    templateName: read.name,
    modelCode: template.draft.modelCode,
    templateRevision: read.revision,
    taskTitle: step.taskTitle,
    stepRef: step.stepRef,
    stepText: step.item.text,
    ...(machine && { machineRef: machine.id, machineName: machine.machineName }),
    message: body.message,
    createdAt: new Date().toISOString(),
    createdBy: user.email,
    status: 'open',
  };
  await writeJson(config, blobNames.changeRequest(request.id), request, { ifNoneMatch: '*' });
  return json(201, request);
});

export const listChangeRequests = endpoint({ role: 'admin' }, async () =>
  json(200, (await loadAll()).sort(compareChangeRequests)),
);

export const changeRequestSummary = endpoint({ role: 'admin' }, async () => {
  const summary: ChangeRequestSummary = {
    open: (await loadAll()).filter((request) => request.status === 'open').length,
  };
  return json(200, summary);
});

/** Marks a request fixed, with who and when (and what was done), or opens it again. */
export const updateChangeRequest = endpoint({ role: 'admin' }, async (req, _context, user) => {
  const id = idParam(req);
  const { status, resolution } = await readJsonBody(req, UpdateChangeRequestSchema);
  const stored = await readJson(config, blobNames.changeRequest(id), ChangeRequestSchema);
  if (!stored) throw requestNotFound();
  const { fixedAt: _at, fixedBy: _by, resolution: _note, ...rest } = stored.data;
  const updated: ChangeRequest =
    status === 'fixed'
      ? {
          ...rest,
          status,
          fixedAt: new Date().toISOString(),
          fixedBy: user.email,
          ...(resolution && { resolution }),
        }
      : { ...rest, status };
  await writeJson(config, blobNames.changeRequest(id), updated, { ifMatch: stored.etag });
  return json(200, updated);
});

export const deleteChangeRequest = endpoint({ role: 'admin' }, async (req) => {
  const id = idParam(req);
  await ensureStorage();
  const deleted = await containerClient(config)
    .getBlobClient(blobNames.changeRequest(id))
    .deleteIfExists();
  if (!deleted.succeeded) throw requestNotFound();
  return { status: 204 };
});

// One function for the collection and one for a request; their methods share them.
app.http('changeRequests', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'change-requests',
  handler: (req, context) =>
    (req.method === 'POST' ? createChangeRequest : listChangeRequests)(req, context),
});

app.http('changeRequest', {
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  route: 'change-requests/{id}',
  handler: (req, context) => {
    // "summary" is no id: the open count for the sidebar.
    if (req.params.id === 'summary') {
      return req.method === 'GET' ? changeRequestSummary(req, context) : { status: 405 };
    }
    if (req.method === 'GET') return { status: 405 };
    return (req.method === 'DELETE' ? deleteChangeRequest : updateChangeRequest)(req, context);
  },
});
