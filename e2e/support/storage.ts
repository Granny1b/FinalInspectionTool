/**
 * Direct access to the Azurite that `npm run dev` starts (default ports), never
 * STORAGE_CONNECTION_STRING. The seed check reads what the seed wrote; the template tests write
 * throwaway templates here so that none of them changes the seeded one, and delete them after.
 */
import { BlobServiceClient } from '@azure/storage-blob';
import {
  blobNames,
  CONTAINERS,
  DEFAULT_SPARE_ROWS_PER_SECTION,
  newId,
  TemplateSchema,
  type Template,
} from '@modig/shared';

const LOCAL_STORAGE = 'UseDevelopmentStorage=true';
const storage = BlobServiceClient.fromConnectionString(LOCAL_STORAGE);
const templates = storage.getContainerClient(CONTAINERS.templates);
const images = storage.getContainerClient(CONTAINERS.images);

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

/** The seeded RigiMill MG draft, or null while the seed (started by `npm run dev`) is running. */
export async function findSeededDraft(): Promise<Template | null> {
  if (!(await templates.exists())) return null;
  for await (const blob of templates.listBlobsFlat()) {
    if (!blob.name.endsWith('/draft.json')) continue;
    const template = await readTemplate(blob.name);
    if (template.modelCode === 'RMMG') return template;
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
 * A two-section, six-row template. `published` adds revision 1 with the same content, so the
 * draft continues as revision 2 without unpublished changes.
 */
export async function createTemplate(name: string, published = false): Promise<Template> {
  const draft: Template = {
    id: newId(),
    name,
    modelCode: TEST_MODEL,
    revision: published ? 2 : 1,
    status: 'draft',
    printSettings: { spareRowsPerSection: DEFAULT_SPARE_ROWS_PER_SECTION },
    sections: CHECKLIST.map(({ title, rows }) => ({
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

/** Deletes a template's draft, revisions and cover photos. */
export async function deleteTemplate(id: string): Promise<void> {
  const names: string[] = [];
  for await (const blob of templates.listBlobsFlat({ prefix: `${id}/` })) names.push(blob.name);
  const covers = new Set<string>();
  for (const name of names) {
    const { coverImageId } = await readTemplate(name);
    if (coverImageId) covers.add(coverImageId);
  }
  await Promise.all([
    ...names.map((name) => templates.deleteBlob(name)),
    ...[...covers].map((imageId) =>
      images.getBlobClient(blobNames.image(imageId)).deleteIfExists(),
    ),
  ]);
}
