/**
 * Direct access to the Azurite that `npm run dev` starts (default ports), never
 * STORAGE_CONNECTION_STRING. The seed check reads what the seed wrote; the template and inspection
 * tests write throwaway templates here, so they neither depend on nor change the seeded one, and
 * delete them and their inspections after. The inspection tests also read the deviations table
 * here: no endpoint exposes it.
 */
import { odata, TableClient } from '@azure/data-tables';
import { BlobServiceClient } from '@azure/storage-blob';
import {
  blobNames,
  CONTAINERS,
  DEVIATIONS_TABLE,
  InspectionSchema,
  MachineSchema,
  newId,
  TemplateSchema,
  type Guide,
  type Section,
  type Template,
} from '@modig/shared';

const LOCAL_STORAGE = 'UseDevelopmentStorage=true';
const storage = BlobServiceClient.fromConnectionString(LOCAL_STORAGE);
const templates = storage.getContainerClient(CONTAINERS.templates);
const images = storage.getContainerClient(CONTAINERS.images);
const inspections = storage.getContainerClient(CONTAINERS.inspections);
const followUps = storage.getContainerClient(CONTAINERS.followUps);
const machines = storage.getContainerClient(CONTAINERS.machines);
const config = storage.getContainerClient(CONTAINERS.config);
const deviations = TableClient.fromConnectionString(LOCAL_STORAGE, DEVIATIONS_TABLE);

async function readTemplate(blobName: string): Promise<Template> {
  const content = await templates.getBlobClient(blobName).downloadToBuffer();
  return TemplateSchema.parse(JSON.parse(content.toString('utf8')));
}

async function writeTemplate(blobName: string, template: Template): Promise<void> {
  const body = JSON.stringify(TemplateSchema.parse(template));
  await templates.getBlockBlobClient(blobName).upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  });
}

/**
 * The RigiMill MG checklist the seed imported, as its published revision 2: that never changes,
 * whatever admins have done to the draft since (edited, published, moved to another model).
 * `complete` once the seed has also written the draft, its last write. Null before the seed (run
 * by `npm run dev`) has written it.
 */
export async function findSeededRevision(): Promise<{
  revision: Template;
  complete: boolean;
} | null> {
  if (!(await templates.exists())) return null;
  const names = new Set<string>();
  for await (const blob of templates.listBlobsFlat()) names.add(blob.name);
  for (const name of names) {
    const id = name.split('/')[0] ?? '';
    if (name !== blobNames.templateRevision(id, 2)) continue;
    const revision = await readTemplate(name);
    if (revision.modelCode === 'RMMG' && revision.updatedBy.startsWith('seed')) {
      return { revision, complete: names.has(blobNames.templateDraft(id)) };
    }
  }
  return null;
}

/**
 * A model code that is not in the settings: throwaway templates never take a real model from the
 * "New template" dialog or from the one-template-per-model check.
 */
const TEST_MODEL = 'E2E';

const CHECKLIST = [
  {
    title: 'Loading area',
    rows: [
      'Lifting columns - Marked screws, blue/red/yellow',
      'Pallet changer - Smooth movement, no noise',
      'Safety fence - Undamaged and closed',
    ],
  },
  {
    title: 'Tool arena',
    rows: [
      'Tool magazine - All pockets clean',
      'Tool changer - Gripper aligned',
      'Coolant nozzles - Aimed at the tool',
    ],
  },
];

/**
 * A two-section, six-row template, or the given checklist (e.g. a copy of the seeded one).
 * `published` adds revision 1 with the same content, so the draft continues as revision 2
 * without unpublished changes. A test that counts across inspections (Insights) passes a model
 * code of its own, so other tests' inspections never mix in.
 */
export async function createTemplate(
  name: string,
  published = false,
  checklist?: { sections: Section[] },
  modelCode = TEST_MODEL,
): Promise<Template> {
  const draft: Template = {
    id: newId(),
    kind: 'final',
    name,
    modelCode,
    revision: published ? 2 : 1,
    status: 'draft',
    sections:
      checklist?.sections ??
      CHECKLIST.map(({ title, rows }) => ({
        id: newId(),
        title,
        items: rows.map((text) => ({ id: newId(), text })),
      })),
    updatedAt: new Date().toISOString(),
    updatedBy: 'e2e@modig.se',
  };
  // Revision first, then the draft, like the seed: a folder without a draft is not listed.
  if (published) {
    await writeTemplate(blobNames.templateRevision(draft.id, 1), {
      ...draft,
      status: 'published',
      revision: 1,
      changeNote: 'First version',
    });
  }
  await writeTemplate(blobNames.templateDraft(draft.id), draft);
  return draft;
}

/**
 * Deletes a template's draft, revisions, cover photos and guide images (originals and marked-up
 * copies), which its inspections' snapshots share: they go with the template.
 */
export async function deleteTemplate(id: string): Promise<void> {
  const names: string[] = [];
  for await (const blob of templates.listBlobsFlat({ prefix: `${id}/` })) names.push(blob.name);
  const imageIds = new Set<string>();
  for (const name of names) {
    const { coverImageId, sections } = await readTemplate(name);
    if (coverImageId) imageIds.add(coverImageId);
    for (const image of sections.flatMap((section) =>
      section.items.flatMap((item) => item.guide?.images ?? []),
    )) {
      imageIds.add(image.imageId);
      if (image.renderedImageId) imageIds.add(image.renderedImageId);
    }
  }
  await Promise.all([
    ...names.map((name) => templates.deleteBlob(name)),
    deleteImages([...imageIds]),
    // The order of its quality checks, if a test dragged them.
    config.getBlobClient(blobNames.qualityCheckOrder(id)).deleteIfExists(),
  ]);
}

/**
 * A quality check of `parent` (a machine's final inspection template), written straight into
 * storage like createTemplate: "Quality check – Pre start up", one section of two rows with how, references
 * and time. `published` adds revision 1 with the same content; `guide` gives the first row its
 * pictures and more information.
 */
export async function createQualityCheck(
  parent: Template,
  published = false,
  guide?: Guide,
): Promise<Template> {
  const draft: Template = {
    id: newId(),
    kind: 'quality',
    parentId: parent.id,
    name: 'Quality check – Pre start up',
    modelCode: parent.modelCode,
    revision: published ? 2 : 1,
    status: 'draft',
    quality: { name: 'Pre start up', department: 'Quality' },
    sections: [
      {
        id: newId(),
        title: 'Safety features',
        items: [
          {
            id: newId(),
            text: 'Check and verify safety decals on balancing tubes.',
            how: 'Should be visible and not turned inward.',
            references: ['ISO 12100', 'ISO 7010'],
            timeHours: 0.2,
            ...(guide && { guide }),
          },
          {
            id: newId(),
            text: 'Warning signs inside the electrical cabinet.',
            references: ['IEC 60204-1'],
            timeHours: 0.1,
          },
        ],
      },
    ],
    updatedAt: new Date().toISOString(),
    updatedBy: 'e2e@modig.se',
  };
  if (published) {
    await writeTemplate(blobNames.templateRevision(draft.id, 1), {
      ...draft,
      status: 'published',
      revision: 1,
      changeNote: 'First version',
    });
  }
  await writeTemplate(blobNames.templateDraft(draft.id), draft);
  return draft;
}

/**
 * Deletes every quality check of the machine whose final inspection template is `parentId`, with
 * its revisions and pictures (as deleteTemplate). Quality checks created in the UI are found by
 * their `parentId`.
 */
export async function deleteQualityChecks(parentId: string): Promise<void> {
  const ids: string[] = [];
  for await (const blob of templates.listBlobsFlat()) {
    const [id = '', file] = blob.name.split('/');
    if (file !== 'draft.json') continue;
    const draft = await readTemplate(blob.name).catch(() => null);
    if (draft?.kind === 'quality' && draft.parentId === parentId) ids.push(id);
  }
  await Promise.all(ids.map((id) => deleteTemplate(id)));
}

/** Stores a JPEG as an uploaded image (`images/{id}.jpg`) and returns its new id. */
export async function storeImage(jpeg: Buffer): Promise<string> {
  const imageId = newId();
  await images.getBlockBlobClient(blobNames.image(imageId)).upload(jpeg, jpeg.length, {
    blobHTTPHeaders: { blobContentType: 'image/jpeg' },
  });
  return imageId;
}

/**
 * Deletes every inspection made from these templates (a test's final inspections and quality
 * checks, created in the UI or through the API), as deleteInspection does.
 */
export async function deleteInspectionsOf(templateIds: readonly string[]): Promise<void> {
  const ids: string[] = [];
  for await (const blob of inspections.listBlobsFlat()) {
    const content = await inspections
      .getBlobClient(blob.name)
      .downloadToBuffer()
      .catch(() => null);
    if (!content) continue;
    let parsed;
    try {
      parsed = InspectionSchema.safeParse(JSON.parse(content.toString('utf8')));
    } catch {
      continue; // not JSON: no inspection
    }
    if (parsed.success && templateIds.includes(parsed.data.templateId)) ids.push(parsed.data.id);
  }
  await Promise.all(ids.map((id) => deleteInspection(id)));
}

/** An inspection's follow-ups blob, or null when none was written (or it was deleted). */
export async function storedFollowUps(inspectionId: string): Promise<unknown> {
  const blob = followUps.getBlobClient(blobNames.followUps(inspectionId));
  if (!(await followUps.exists()) || !(await blob.exists())) return null;
  return JSON.parse((await blob.downloadToBuffer()).toString('utf8')) as unknown;
}

/** A deviation table row as stored: PartitionKey, RowKey and the brief's columns. */
export type StoredDeviationRow = { partitionKey: string; rowKey: string } & Record<string, unknown>;

/**
 * One inspection's rows in the deviations table, by RowKey (`{inspectionId}_{key}`), without the
 * service's own etag and timestamp. Any partition: a test may not know the model.
 */
export async function deviationRows(inspectionId: string): Promise<StoredDeviationRow[]> {
  const rows: StoredDeviationRow[] = [];
  // '`' follows '_', so the range is exactly the RowKeys that start with `{inspectionId}_`.
  const filter = odata`RowKey ge ${`${inspectionId}_`} and RowKey lt ${`${inspectionId}\``}`;
  for await (const entity of deviations.listEntities({ queryOptions: { filter } })) {
    const { etag: _etag, timestamp: _timestamp, partitionKey, rowKey, ...columns } = entity;
    rows.push({ partitionKey: partitionKey!, rowKey: rowKey!, ...columns });
  }
  return rows.sort((a, b) => a.rowKey.localeCompare(b.rowKey));
}

/**
 * Deletes an inspection's blob, its deviation rows, its deviations' follow-ups and its deviation
 * photos (originals and marked-up copies: nothing else uses them). The machine photo stays: it
 * may be a template's cover.
 */
export async function deleteInspection(id: string): Promise<void> {
  const blob = inspections.getBlobClient(blobNames.inspection(id));
  const photoIds = (await blob.exists()) ? deviationPhotoIds(await blob.downloadToBuffer()) : [];
  const rows = await deviationRows(id);
  await Promise.all([
    blob.deleteIfExists(),
    // The container appears with the first follow-up written.
    followUps
      .getBlobClient(blobNames.followUps(id))
      .deleteIfExists()
      .catch(() => undefined),
    deleteImages(photoIds),
    ...rows.map((row) => deviations.deleteEntity(row.partitionKey, row.rowKey)),
  ]);
}

function deviationPhotoIds(content: Buffer): string[] {
  const inspection = InspectionSchema.parse(JSON.parse(content.toString('utf8')));
  const photos = [
    ...Object.values(inspection.results).flatMap((result) => result.photos ?? []),
    ...inspection.extraDeviations.flatMap((extra) => extra.photos ?? []),
  ];
  return photos.flatMap(({ imageId, renderedImageId }) =>
    renderedImageId ? [imageId, renderedImageId] : [imageId],
  );
}

/** Deletes uploaded images (`images/{id}.jpg`); missing ones are skipped. */
export async function deleteImages(ids: readonly string[]): Promise<void> {
  await Promise.all(
    ids.map((imageId) => images.getBlobClient(blobNames.image(imageId)).deleteIfExists()),
  );
}

/**
 * A Machine ID of a test's own: Machine IDs are unique across every machine, those of tests that
 * ran before included.
 */
export function uniqueMachineId(prefix: string): string {
  const letters = Array.from({ length: 6 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  );
  return `${prefix}-${letters.join('')}`;
}

/**
 * Deletes every machine of these models (a test's own model codes). Only the machines: their
 * checks are inspections of the test's templates, deleted with deleteInspectionsOf.
 */
export async function deleteMachinesOf(modelCodes: readonly string[]): Promise<void> {
  if (!(await machines.exists())) return;
  const names: string[] = [];
  for await (const blob of machines.listBlobsFlat()) {
    const content = await machines
      .getBlobClient(blob.name)
      .downloadToBuffer()
      .catch(() => null);
    if (!content) continue;
    const machine = MachineSchema.safeParse(JSON.parse(content.toString('utf8')));
    if (machine.success && modelCodes.includes(machine.data.modelCode)) names.push(blob.name);
  }
  await Promise.all(names.map((name) => machines.getBlobClient(name).deleteIfExists()));
}

/**
 * Writes `sections` as published revision `revision` of `template`, and the draft with them (the
 * next revision's), as publishing in the editor would.
 */
export async function publishRevision(
  template: Template,
  revision: number,
  sections: Section[],
): Promise<Template> {
  const published: Template = {
    ...template,
    sections,
    revision,
    status: 'published',
    changeNote: `Revision ${revision}`,
    updatedAt: new Date().toISOString(),
  };
  await writeTemplate(blobNames.templateRevision(template.id, revision), published);
  await writeTemplate(blobNames.templateDraft(template.id), {
    ...published,
    status: 'draft',
    revision: revision + 1,
  });
  return published;
}

/** Deletes these machines (their blobs only, as deleteMachinesOf). */
export async function deleteMachines(ids: readonly string[]): Promise<void> {
  if (!(await machines.exists())) return;
  await Promise.all(
    ids.map((id) => machines.getBlobClient(blobNames.machine(id)).deleteIfExists()),
  );
}
