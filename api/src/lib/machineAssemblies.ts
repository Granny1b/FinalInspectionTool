/**
 * Storage of machines' assemblies (shared/src/machineAssembly.ts): under each machine's id in
 * `machine-assemblies/`, the machine's copy of an assembly instruction and, beside it, the
 * sign-offs of its steps.
 */
import type { InvocationContext } from '@azure/functions';
import {
  AssemblySignOffsSchema,
  blobNames,
  CONTAINERS,
  MachineAssemblySchema,
  newId,
  type AssemblySignOffs,
  type Machine,
  type MachineAssembly,
  type Template,
} from '@modig/shared';
import { BadRequestError, ConflictError, NotFoundError, PreconditionFailedError } from './http';
import {
  containerClient,
  ensureStorage,
  listBlobNames,
  readJson,
  writeJson,
  type WriteConditions,
} from './storage';
import { latestRevisionNumber, loadLatestPublished, loadTemplate } from './templates';

const { machineAssemblies: container } = CONTAINERS;

export function assemblyNotFound(): NotFoundError {
  return new NotFoundError('This machine does not have that assembly instruction.');
}

export async function loadMachineAssembly(
  machineId: string,
  id: string,
): Promise<MachineAssembly | null> {
  const stored = await readJson(
    container,
    blobNames.machineAssembly(machineId, id),
    MachineAssemblySchema,
  );
  return stored?.data ?? null;
}

export async function writeMachineAssembly(
  assembly: MachineAssembly,
  conditions: WriteConditions = {},
): Promise<void> {
  await writeJson(
    container,
    blobNames.machineAssembly(assembly.machineRef, assembly.id),
    assembly,
    conditions,
  );
}

/** Every assembly of the machine, in the order they were bound. */
export async function loadMachineAssemblies(machineId: string): Promise<MachineAssembly[]> {
  const names = await listBlobNames(container, `${machineId}/`);
  const ids = names.flatMap((name) => {
    const match = blobNames.machineAssemblyPattern.exec(name);
    return match?.[1] && !name.endsWith('.signoffs.json') ? [match[1]] : [];
  });
  const loaded = await Promise.all(ids.map((id) => loadMachineAssembly(machineId, id)));
  return loaded
    .filter((assembly) => assembly !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The sign-offs of an assembly; none yet until the first step is signed. */
export async function loadSignOffs(machineId: string, id: string): Promise<AssemblySignOffs> {
  return (await readSignOffs(machineId, id))?.data ?? {};
}

function readSignOffs(machineId: string, id: string) {
  return readJson(
    container,
    blobNames.machineAssemblySignOffs(machineId, id),
    AssemblySignOffsSchema,
  );
}

/**
 * The published assembly instruction a machine is to get a copy of, checked: it exists, is an
 * assembly instruction, is published and is of the machine's model.
 */
export async function assemblyRevision(
  machine: Pick<Machine, 'modelCode'>,
  templateId: string,
): Promise<Template> {
  const template = await loadTemplate(templateId);
  if (!template || template.draft.kind !== 'assembly') {
    throw new NotFoundError('This assembly instruction does not exist.');
  }
  const revision = await loadLatestPublished(template);
  if (!revision) {
    throw new ConflictError(`Publish “${template.draft.name || 'the instruction'}” first.`);
  }
  if (revision.modelCode !== machine.modelCode) {
    throw new BadRequestError(`“${revision.name}” is not an instruction of this machine's model.`);
  }
  return revision;
}

/** The machine's own copy of that revision, not signed yet. */
export function newMachineAssembly(
  machineId: string,
  revision: Template,
  by: string,
): MachineAssembly {
  const now = new Date().toISOString();
  return {
    id: newId(),
    machineRef: machineId,
    templateId: revision.id,
    templateRevision: revision.revision,
    name: revision.name,
    modelCode: revision.modelCode,
    sections: revision.sections,
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
  };
}

/** A change that lost to another one this many times in a row gives up (503 to the caller). */
const ATTEMPTS = 6;

/**
 * Changes the sign-offs: `change` gets the latest version and returns the next one (the same
 * object for no change). Written only over the version it was made from; when someone else signed
 * in between, it is made again from theirs. So people signing at once all keep their sign-offs.
 */
export async function changeSignOffs(
  machineId: string,
  id: string,
  change: (current: AssemblySignOffs) => AssemblySignOffs,
): Promise<AssemblySignOffs> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const stored = await readSignOffs(machineId, id);
    const current = stored?.data ?? {};
    const next = change(current);
    if (next === current) return current;
    try {
      await writeJson(
        container,
        blobNames.machineAssemblySignOffs(machineId, id),
        next,
        stored ? { ifMatch: stored.etag } : { ifNoneMatch: '*' },
      );
      return next;
    } catch (error) {
      // Someone else's sign-off got there first: again, from theirs.
      if (!(error instanceof PreconditionFailedError || error instanceof ConflictError)) {
        throw error;
      }
    }
  }
  throw new ConflictError('Too many people are signing at once. Try again in a moment.');
}

/** The instruction's latest published revision, or null when it is gone or never published. */
export async function latestRevisionOf(templateId: string): Promise<number | null> {
  return latestRevisionNumber(templateId);
}

/** Deletes an assembly with its sign-offs. */
export async function deleteMachineAssembly(machineId: string, id: string): Promise<void> {
  await ensureStorage();
  const blobs = containerClient(container);
  await blobs.getBlobClient(blobNames.machineAssembly(machineId, id)).deleteIfExists();
  await blobs.getBlobClient(blobNames.machineAssemblySignOffs(machineId, id)).deleteIfExists();
}

/**
 * Deletes everything a deleted machine had here. Best effort: the machine is already gone, and
 * what is left behind is listed under no machine.
 */
export async function deleteAssembliesOf(
  machineId: string,
  context: InvocationContext,
): Promise<void> {
  try {
    const names = await listBlobNames(container, `${machineId}/`);
    const blobs = containerClient(container);
    await Promise.all(names.map((name) => blobs.getBlobClient(name).deleteIfExists()));
  } catch (error) {
    context.warn(`Deleted machine ${machineId}; deleting its assemblies failed`, error);
  }
}
