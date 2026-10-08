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
  DEFAULT_SPARE_ROWS_PER_SECTION,
  DEVIATIONS_TABLE,
  InspectionSchema,
  newId,
  TemplateSchema,
  type Section,
  type Template,
} from '@modig/shared';

const LOCAL_STORAGE = 'UseDevelopmentStorage=true';
const storage = BlobServiceClient.fromConnectionString(LOCAL_STORAGE);
const templates = storage.getContainerClient(CONTAINERS.templates);
const images = storage.getContainerClient(CONTAINERS.images);
const inspections = storage.getContainerClient(CONTAINERS.inspections);
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
 * without unpublished changes.
 */
export async function createTemplate(
  name: string,
  published = false,
  checklist?: { sections: Section[]; spareRowsPerSection?: number },
): Promise<Template> {
  const draft: Template = {
    id: newId(),
    name,
    modelCode: TEST_MODEL,
    revision: published ? 2 : 1,
    status: 'draft',
    printSettings: {
      spareRowsPerSection: checklist?.spareRowsPerSection ?? DEFAULT_SPARE_ROWS_PER_SECTION,
    },
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
  ]);
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
 * Deletes an inspection's blob, its deviation rows and its deviation photos (originals and
 * marked-up copies: nothing else uses them). The machine photo stays: it may be a template's
 * cover.
 */
export async function deleteInspection(id: string): Promise<void> {
  const blob = inspections.getBlobClient(blobNames.inspection(id));
  const photoIds = (await blob.exists()) ? deviationPhotoIds(await blob.downloadToBuffer()) : [];
  const rows = await deviationRows(id);
  await Promise.all([
    blob.deleteIfExists(),
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
