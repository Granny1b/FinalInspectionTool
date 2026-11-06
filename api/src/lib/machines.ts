/**
 * Machine storage (shared/src/machines.ts): one JSON blob per machine, `machines/{id}.json`, with
 * its fields in the blob's metadata so the list is one blob listing. A machine's checks are
 * inspections naming it (`machineRef`): made not started, from its templates' latest published
 * revisions, and numbered when they start.
 */
import { odata } from '@azure/data-tables';
import type { InvocationContext } from '@azure/functions';
import { isRestError } from '@azure/storage-blob';
import {
  blobNames,
  checklistChanges,
  compareMachineChecks,
  CONTAINERS,
  ID_PATTERN,
  MachineSchema,
  newId,
  snapshotTemplate,
  swedishDay,
  type Inspection,
  type InspectionSummary,
  type Machine,
  type MachineCheck,
  type Settings,
  type Template,
} from '@modig/shared';
import { BadRequestError, ConflictError, NotFoundError, PreconditionFailedError } from './http';
import {
  changeInspection,
  inspectionSummary,
  loadInspection,
  loadSummaries,
  syncSettled,
  writeInspection,
} from './inspections';
import {
  containerClient,
  deviationsTable,
  ensureStorage,
  ensureTable,
  readJson,
  writeJson,
  type WriteConditions,
} from './storage';
import {
  listRevisions,
  loadLatestPublished,
  loadQualityCheckOrder,
  loadRevision,
  loadTemplate,
  templateNotFound,
} from './templates';

const { machines: container } = CONTAINERS;

export type StoredMachine = { data: Machine; etag: string };

export function machineNotFound(): NotFoundError {
  return new NotFoundError('This machine does not exist.');
}

export async function loadMachine(id: string): Promise<StoredMachine | null> {
  return readJson(container, blobNames.machine(id), MachineSchema);
}

/**
 * One metadata entry, `machine`: the machine (minus the id, which is the blob name) as
 * URI-encoded JSON, as an inspection's list summary is stored.
 */
const METADATA_KEY = 'machine';
const StoredFieldsSchema = MachineSchema.omit({ id: true });

/** Writes the machine with its fields as metadata; returns the new ETag. */
export async function writeMachine(machine: Machine, conditions: WriteConditions): Promise<string> {
  const { id: _id, ...fields } = machine;
  return writeJson(container, blobNames.machine(machine.id), machine, {
    ...conditions,
    metadata: { [METADATA_KEY]: encodeURIComponent(JSON.stringify(fields)) },
  });
}

/** Every machine: one listing with metadata; a blob without usable metadata is read in full. */
export async function loadMachines(): Promise<Machine[]> {
  await ensureStorage();
  const pending: Promise<Machine | null>[] = [];
  for await (const blob of containerClient(container).listBlobsFlat({ includeMetadata: true })) {
    const id = blob.name.endsWith('.json') ? blob.name.slice(0, -'.json'.length) : '';
    if (!ID_PATTERN.test(id)) continue;
    const fields = fieldsFromMetadata(blob.metadata?.[METADATA_KEY]);
    pending.push(
      fields
        ? Promise.resolve({ id, ...fields })
        : loadMachine(id).then((stored) => stored?.data ?? null),
    );
  }
  return (await Promise.all(pending)).filter((machine) => machine !== null);
}

function fieldsFromMetadata(value: string | undefined): Omit<Machine, 'id'> | null {
  if (!value) return null;
  try {
    const result = StoredFieldsSchema.safeParse(JSON.parse(decodeURIComponent(value)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Deletes the machine's blob if it is still version `ifMatch` (412 otherwise, 404 if gone). */
export async function deleteMachineBlob(id: string, ifMatch: string): Promise<void> {
  await ensureStorage();
  const blob = containerClient(container).getBlobClient(blobNames.machine(id));
  await blob.delete({ conditions: { ifMatch } }).catch(async (error: unknown) => {
    if (isRestError(error) && error.statusCode === 404) throw machineNotFound();
    if (isRestError(error) && error.statusCode === 412) {
      throw (await blob.exists()) ? new PreconditionFailedError() : machineNotFound();
    }
    throw error;
  });
}

// ---------------------------------------------------------------------------------------------
// Its checks
// ---------------------------------------------------------------------------------------------

/** The published template a check is copied from, checked against the machine's model. */
export async function checkTemplate(
  machine: Pick<Machine, 'modelCode'>,
  templateId: string,
): Promise<Template> {
  const template = await loadTemplate(templateId);
  if (!template) throw templateNotFound();
  const revision = await loadLatestPublished(template);
  if (!revision) {
    throw new ConflictError(
      template.draft.kind === 'quality'
        ? `Publish “${template.draft.name || 'the quality check'}” first.`
        : `Publish “${template.draft.name || 'the template'}” first.`,
    );
  }
  if (revision.modelCode !== machine.modelCode) {
    throw new BadRequestError(`“${revision.name}” is not a check of this machine's model.`);
  }
  return revision;
}

/**
 * A new check of `machine`, not started, copied from `revision` (its template's latest published
 * revision): the machine's own copy of the checklist from now on. Its front page has the
 * machine's Machine ID, model and serial number; a final inspection's also the default location
 * and the template's cover photo, as a new final inspection always had. No number yet.
 */
export function newMachineCheck(
  machine: Machine,
  revision: Template,
  settings: Settings | null,
  by: string,
): Inspection {
  const now = new Date().toISOString();
  const final = revision.kind !== 'quality';
  return {
    id: newId(),
    kind: final ? 'final' : 'quality',
    number: '',
    templateId: revision.id,
    templateRevision: revision.revision,
    machineRef: machine.id,
    templateSnapshot: snapshotTemplate(revision),
    front: {
      machineName: machine.machineName,
      modelCode: machine.modelCode,
      serialNumber: machine.serialNumber,
      participants: [],
      location: final ? (settings?.defaultLocation ?? '') : '',
      // Set again when it starts.
      date: swedishDay(new Date()),
      ...(final && revision.coverImageId && { photoId: revision.coverImageId }),
    },
    results: {},
    extraDeviations: [],
    state: 'not_started',
    createdAt: now,
    createdBy: by,
    updatedAt: now,
    updatedBy: by,
  };
}

/** Writes a new check; returns its summary. */
export async function storeMachineCheck(check: Inspection): Promise<InspectionSummary> {
  await writeInspection(check, { ifNoneMatch: '*' });
  return inspectionSummary(check);
}

/**
 * Puts the machine's Machine ID and serial number on the front page of each of its checks that
 * is not finalised (finalised ones keep what they were finalised with, for their history and
 * their printouts), and updates the deviation rows of those started. Best effort per check: one
 * that can't be updated is logged, and gets them at the machine's next edit.
 */
export async function updateChecksFront(
  machine: Machine,
  checks: readonly InspectionSummary[],
  by: string,
  context: InvocationContext,
): Promise<void> {
  await Promise.all(
    checks
      .filter((check) => check.state !== 'finalised')
      .map(async (check) => {
        try {
          const stored = await changeInspection(check.id, (current) =>
            withMachineFront(current, machine, by),
          );
          if (stored && stored.data.state === 'in_progress') {
            await syncSettled(stored.data, stored.etag, context);
          }
        } catch (error) {
          context.warn(
            `Machine ${machine.id}: its Machine ID could not be put on check ${check.id}`,
            error,
          );
        }
      }),
  );
}

/**
 * The inspection with the machine's Machine ID and serial number on its front page, unless it is
 * finalised or already has them (null: nothing to write).
 */
export function withMachineFront(
  inspection: Inspection,
  machine: Pick<Machine, 'machineName' | 'serialNumber'>,
  by: string,
): Inspection | null {
  const { front } = inspection;
  if (inspection.state === 'finalised') return null;
  if (front.machineName === machine.machineName && front.serialNumber === machine.serialNumber) {
    return null;
  }
  return {
    ...inspection,
    front: { ...front, machineName: machine.machineName, serialNumber: machine.serialNumber },
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
}

/** The checks of each machine, by its id (only inspections naming one). */
export function checksByMachine(
  summaries: readonly InspectionSummary[],
): Map<string, InspectionSummary[]> {
  const byMachine = new Map<string, InspectionSummary[]>();
  for (const summary of summaries) {
    if (!summary.machineRef) continue;
    byMachine.set(summary.machineRef, [...(byMachine.get(summary.machineRef) ?? []), summary]);
  }
  return byMachine;
}

/**
 * Each inspection's deviations, open and closed, from the deviations table (one query, one
 * partition when the model is given): what the deviation log shows. A row written before the log
 * existed has no status and is open.
 */
export async function deviationCounts(
  modelCode?: string,
): Promise<Map<string, { open: number; closed: number }>> {
  await ensureTable();
  const counts = new Map<string, { open: number; closed: number }>();
  const entities = deviationsTable().listEntities<Record<string, unknown>>({
    queryOptions: {
      filter: modelCode ? odata`PartitionKey eq ${modelCode}` : undefined,
      select: ['inspectionId', 'status'],
    },
  });
  for await (const entity of entities) {
    if (typeof entity.inspectionId !== 'string') continue;
    const count = counts.get(entity.inspectionId) ?? { open: 0, closed: 0 };
    if (entity.status === 'closed') count.closed += 1;
    else count.open += 1;
    counts.set(entity.inspectionId, count);
  }
  return counts;
}

/**
 * A machine's checks for its page, in the order they are done (its model's quality check order,
 * then the final inspection): each with the template's latest revision (an update is available
 * when it is newer), what the machine changed in its copy since the revision it is based on, and
 * its deviations, open and closed.
 */
export async function machineChecks(
  machine: Machine,
  context: InvocationContext,
): Promise<MachineCheck[]> {
  const checks = (await loadSummaries()).filter((summary) => summary.machineRef === machine.id);
  const [revisions, counts, order] = await Promise.all([
    listRevisions(),
    deviationCounts(machine.modelCode).catch((error: unknown) => {
      context.warn(`Machine ${machine.id}: its deviations could not be counted`, error);
      return new Map<string, { open: number; closed: number }>();
    }),
    qualityOrderOf(checks),
  ]);
  const detailed = await Promise.all(
    checks.map(async (check): Promise<MachineCheck> => {
      const latest = revisions.get(check.templateId)?.at(-1) ?? null;
      return {
        ...check,
        latestRevision: latest,
        changes: await changesOf(check, context),
        deviations: counts.get(check.id) ?? { open: 0, closed: 0 },
      };
    }),
  );
  return detailed.sort(compareMachineChecks(order));
}

/** The machine's own changes since the revision its copy is based on; null if unreadable. */
async function changesOf(
  check: InspectionSummary,
  context: InvocationContext,
): Promise<MachineCheck['changes']> {
  try {
    const [stored, base] = await Promise.all([
      loadInspection(check.id),
      loadRevision(check.templateId, check.templateRevision),
    ]);
    if (!stored || !base) return null;
    return checklistChanges(base.sections, stored.data.templateSnapshot.sections);
  } catch (error) {
    context.warn(`Check ${check.id}: its changes could not be worked out`, error);
    return null;
  }
}

/**
 * The order of the machine model's quality checks: kept under its final inspection template,
 * which every quality check names as its parent (the first of its checks whose template still
 * exists says which). Empty when none was set, or none can be found.
 */
async function qualityOrderOf(checks: readonly InspectionSummary[]): Promise<string[]> {
  const templateIds = new Set(
    checks.filter((check) => check.kind === 'quality').map((check) => check.templateId),
  );
  for (const templateId of templateIds) {
    const parentId = (await loadTemplate(templateId))?.draft.parentId;
    if (parentId) return (await loadQualityCheckOrder(parentId))?.data.order ?? [];
  }
  return [];
}
