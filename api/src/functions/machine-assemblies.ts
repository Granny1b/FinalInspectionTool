/**
 * A machine's assemblies (shared/src/machineAssembly.ts): assembly instructions bound to a
 * machine and signed off step by step.
 *
 *   GET    /api/machines/{id}/assemblies                 inspector  MachineAssemblySummary[]
 *   POST   /api/machines/{id}/assemblies                 inspector  AddMachineAssemblyRequest
 *                                                                   → 201 MachineAssemblyDetail
 *   GET    /api/machines/{id}/assemblies/{assemblyId}    inspector  MachineAssemblyDetail
 *   DELETE /api/machines/{id}/assemblies/{assemblyId}    admin      → 204 (its sign-offs go too)
 *   POST   /api/machines/{id}/assemblies/{assemblyId}/sign    inspector  SignStepsRequest
 *   POST   /api/machines/{id}/assemblies/{assemblyId}/unsign  inspector  UnsignStepsRequest
 *                                                    (one's own sign-offs; an admin anyone's)
 *   POST   /api/machines/{id}/assemblies/{assemblyId}/update  inspector  to the instruction's
 *                                                    latest published revision
 *                                                    → each MachineAssemblyDetail
 */
import { app, type HttpRequest } from '@azure/functions';
import {
  AddMachineAssemblyRequestSchema,
  hasRole,
  IdSchema,
  machineAssemblySummary,
  SignStepsRequestSchema,
  UnsignStepsRequestSchema,
  withoutSignOffs,
  withSignOffs,
  type MachineAssembly,
  type MachineAssemblyDetail,
  type MachineAssemblySummary,
} from '@modig/shared';
import {
  BadRequestError,
  ConflictError,
  endpoint,
  ForbiddenError,
  idParam,
  json,
  readJsonBody,
} from '../lib/http';
import {
  assemblyNotFound,
  assemblyRevision,
  newMachineAssembly,
  changeSignOffs,
  deleteMachineAssembly,
  latestRevisionOf,
  loadMachineAssemblies,
  loadMachineAssembly,
  loadSignOffs,
  writeMachineAssembly,
} from '../lib/machineAssemblies';
import { loadMachine, machineNotFound } from '../lib/machines';
import { loadLatestPublished, loadTemplate } from '../lib/templates';

export const listMachineAssemblies = endpoint({ role: 'inspector' }, async (req) => {
  const machineId = idParam(req);
  if (!(await loadMachine(machineId))) throw machineNotFound();
  const assemblies = await loadMachineAssemblies(machineId);
  const summaries: MachineAssemblySummary[] = await Promise.all(
    assemblies.map(async (assembly) =>
      machineAssemblySummary(
        assembly,
        await loadSignOffs(machineId, assembly.id),
        await latestRevisionOf(assembly.templateId),
      ),
    ),
  );
  return json(200, summaries);
});

/**
 * Binds an assembly instruction to the machine: a copy of its latest published revision, the
 * machine's own from now on. The instruction must be of the machine's model and published, and a
 * machine has an instruction once.
 */
export const addMachineAssembly = endpoint({ role: 'inspector' }, async (req, _context, user) => {
  const machineId = idParam(req);
  const { templateId } = await readJsonBody(req, AddMachineAssemblyRequestSchema);
  const machine = await loadMachine(machineId);
  if (!machine) throw machineNotFound();
  const revision = await assemblyRevision(machine.data, templateId);
  const existing = (await loadMachineAssemblies(machineId)).find(
    (assembly) => assembly.templateId === templateId,
  );
  if (existing) throw new ConflictError(`This machine already has “${existing.name}”.`);
  const assembly = newMachineAssembly(machineId, revision, user.email);
  await writeMachineAssembly(assembly, { ifNoneMatch: '*' });
  const detail: MachineAssemblyDetail = {
    assembly,
    signOffs: {},
    latestRevision: revision.revision,
  };
  return json(201, detail);
});

export const getMachineAssembly = endpoint({ role: 'inspector' }, async (req) =>
  json(200, await detailOf(await requireAssembly(req))),
);

/** Removes the instruction from the machine, with its sign-offs (admins). */
export const removeMachineAssembly = endpoint({ role: 'admin' }, async (req) => {
  const assembly = await requireAssembly(req);
  await deleteMachineAssembly(assembly.machineRef, assembly.id);
  return { status: 204 };
});

/**
 * Signs steps as done, with the initials typed and the signed-in account and the time behind
 * them. Only steps of this copy can be signed; one already signed keeps its sign-off.
 */
export const signSteps = endpoint({ role: 'inspector' }, async (req, _context, user) => {
  const assembly = await requireAssembly(req);
  const { itemIds, initials } = await readJsonBody(req, SignStepsRequestSchema);
  const steps = new Set(assembly.sections.flatMap((section) => section.items.map((i) => i.id)));
  if (itemIds.some((id) => !steps.has(id))) {
    throw new BadRequestError('Some of these steps are not in this instruction. Reload the page.');
  }
  const signOff = { initials, by: user.email, at: new Date().toISOString() };
  const signOffs = await changeSignOffs(assembly.machineRef, assembly.id, (current) =>
    withSignOffs(current, itemIds, signOff),
  );
  return json(200, await detailOf(assembly, signOffs));
});

/** Takes sign-offs back: one's own, or anyone's for an admin (403 for the others'). */
export const unsignSteps = endpoint({ role: 'inspector' }, async (req, _context, user) => {
  const assembly = await requireAssembly(req);
  const { itemIds } = await readJsonBody(req, UnsignStepsRequestSchema);
  const admin = hasRole(user.roles, 'admin');
  let refused: string[] = [];
  const signOffs = await changeSignOffs(assembly.machineRef, assembly.id, (current) => {
    const result = withoutSignOffs(
      current,
      itemIds,
      (signOff) => admin || signOff.by === user.email,
    );
    refused = result.refused;
    // All or nothing: a refused one leaves the others as they are, too.
    return refused.length > 0 ? current : result.signOffs;
  });
  if (refused.length > 0) {
    throw new ForbiddenError('Someone else signed this. They, or an admin, can take it back.');
  }
  return json(200, await detailOf(assembly, signOffs));
});

/**
 * Brings the machine's copy up to the instruction's latest published revision. The sign-offs
 * stay: a step keeps its id through revisions, so what was signed is still signed.
 */
export const updateMachineAssembly = endpoint(
  { role: 'inspector' },
  async (req, _context, user) => {
    const assembly = await requireAssembly(req);
    const template = await loadTemplate(assembly.templateId);
    const revision = template && (await loadLatestPublished(template));
    if (!revision) throw new ConflictError('The assembly instruction it was made from is gone.');
    if (revision.revision <= assembly.templateRevision) {
      return json(200, await detailOf(assembly));
    }
    const updated: MachineAssembly = {
      ...assembly,
      templateRevision: revision.revision,
      name: revision.name,
      sections: revision.sections,
      updatedAt: new Date().toISOString(),
      updatedBy: user.email,
    };
    await writeMachineAssembly(updated);
    return json(200, await detailOf(updated));
  },
);

/** The assembly the address names (404 for an unknown machine or assembly). */
async function requireAssembly(req: HttpRequest): Promise<MachineAssembly> {
  const machineId = idParam(req);
  const id = IdSchema.safeParse(req.params.assemblyId);
  if (!id.success) throw new BadRequestError('The id in the URL is not valid.');
  const assembly = await loadMachineAssembly(machineId, id.data);
  if (!assembly) throw assemblyNotFound();
  return assembly;
}

async function detailOf(
  assembly: MachineAssembly,
  signOffs?: Awaited<ReturnType<typeof loadSignOffs>>,
): Promise<MachineAssemblyDetail> {
  const [current, latestRevision] = await Promise.all([
    signOffs ?? loadSignOffs(assembly.machineRef, assembly.id),
    latestRevisionOf(assembly.templateId),
  ]);
  return { assembly, signOffs: current, latestRevision };
}

const ACTIONS = { sign: signSteps, unsign: unsignSteps, update: updateMachineAssembly } as const;

// One function per route shape; the methods (and the actions) share it, to keep the count low.
app.http('machineAssemblies', {
  methods: ['GET', 'POST', 'DELETE'],
  authLevel: 'anonymous',
  route: 'machines/{id}/assemblies/{assemblyId?}',
  handler: (req, context) => {
    const one = Boolean(req.params.assemblyId);
    if (req.method === 'DELETE') {
      return one ? removeMachineAssembly(req, context) : { status: 405 };
    }
    if (req.method === 'POST') return one ? { status: 405 } : addMachineAssembly(req, context);
    return (one ? getMachineAssembly : listMachineAssemblies)(req, context);
  },
});

app.http('machineAssemblyAction', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'machines/{id}/assemblies/{assemblyId}/{action}',
  handler: (req, context) => {
    const action = ACTIONS[req.params.action as keyof typeof ACTIONS];
    return action ? action(req, context) : { status: 404 };
  },
});
