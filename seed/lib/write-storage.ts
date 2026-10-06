/**
 * Writes the seed into blob/table storage. Idempotent, so `npm run dev` can run it every time:
 * containers and the table are created when missing, settings only gain missing models, and the
 * RigiMill MG template is imported once.
 *
 * Uses the Azure SDKs directly — the API's storage helpers live in another workspace.
 */
import { text } from 'node:stream/consumers';
import { TableClient } from '@azure/data-tables';
import {
  BlobServiceClient,
  isRestError,
  type BlobRequestConditions,
  type BlockBlobClient,
  type ContainerClient,
} from '@azure/storage-blob';
import {
  blobNames,
  CONTAINERS,
  DEVIATIONS_TABLE,
  newId,
  SettingsSchema,
  TemplateSchema,
} from '@modig/shared';
import {
  buildSettings,
  buildTemplateDocuments,
  missingModels,
  SEED_USER,
  TEMPLATE_MODEL_CODE,
} from './build-documents';
import type { ParsedWorkbook } from './parse-workbook';

export type Storage = { blobService: BlobServiceClient; deviations: TableClient };

export type SeedReport = {
  createdContainers: string[];
  settings: { action: 'created' | 'merged' | 'unchanged'; addedModelCodes: string[] };
  template:
    | { action: 'created'; templateId: string; publishedRevision: number; draftRevision: number }
    | { action: 'skipped'; templateId: string };
};

/** Fail within seconds when Azurite isn't running instead of the SDK default (~16 s of retries). */
const RETRY = { retryDelayInMs: 500, maxRetryDelayInMs: 2000 };

export function connectStorage(connectionString: string): Storage {
  const blobService = BlobServiceClient.fromConnectionString(connectionString, {
    retryOptions: { ...RETRY, maxTries: 3 },
  });
  const deviations = TableClient.fromConnectionString(connectionString, DEVIATIONS_TABLE, {
    // Azurite speaks plain http, which the Tables SDK refuses unless allowed. Blob and table
    // endpoints share a protocol in every real setup.
    allowInsecureConnection: blobService.url.startsWith('http://'),
    retryOptions: { ...RETRY, maxRetries: 2 },
  });
  return { blobService, deviations };
}

/** Account and endpoints for the log — never the key, and no SAS query string. */
export function describeStorage({ blobService, deviations }: Storage): string {
  return `account ${blobService.accountName} · blob ${withoutQuery(blobService.url)} · table ${withoutQuery(deviations.url)}`;
}

export async function writeSeed(
  storage: Storage,
  parsed: ParsedWorkbook,
  options: { sourceFile: string; now?: Date },
): Promise<SeedReport> {
  const now = (options.now ?? new Date()).toISOString();
  const createdContainers: string[] = [];
  for (const name of Object.values(CONTAINERS)) {
    const { succeeded } = await storage.blobService.getContainerClient(name).createIfNotExists();
    if (succeeded) createdContainers.push(name);
  }
  await storage.deviations.createTable(); // no-op when it exists

  const settings = await seedSettings(
    storage.blobService.getContainerClient(CONTAINERS.config),
    parsed,
    now,
  );
  const template = await seedTemplate(
    storage.blobService.getContainerClient(CONTAINERS.templates),
    parsed,
    options.sourceFile,
    now,
  );
  return { createdContainers, settings, template };
}

/** Create settings on first run; afterwards only append models whose code is missing. */
async function seedSettings(
  config: ContainerClient,
  parsed: ParsedWorkbook,
  now: string,
): Promise<SeedReport['settings']> {
  const blob = config.getBlockBlobClient(blobNames.settings);
  const stored = await readJson(blob);
  if (!stored) {
    await writeJson(blob, buildSettings(parsed, now), { ifNoneMatch: '*' });
    return { action: 'created', addedModelCodes: parsed.models.map((m) => m.code) };
  }

  const current = SettingsSchema.safeParse(stored.json);
  if (!current.success) {
    const problems = current.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `${blobPath(blob)} is not valid settings (${problems.join('; ')}); fix or delete it and run the seed again`,
    );
  }
  const added = missingModels(current.data.machineModels, parsed.models);
  if (added.length === 0) return { action: 'unchanged', addedModelCodes: [] };

  const merged = SettingsSchema.parse({
    ...current.data,
    machineModels: [...current.data.machineModels, ...added],
    updatedAt: now,
    updatedBy: SEED_USER,
  });
  await writeJson(blob, merged, { ifMatch: stored.etag });
  return { action: 'merged', addedModelCodes: added.map((m) => m.code) };
}

/** Import the template unless a RigiMill MG template already exists (whatever its content). */
async function seedTemplate(
  templates: ContainerClient,
  parsed: ParsedWorkbook,
  sourceFile: string,
  now: string,
): Promise<SeedReport['template']> {
  const existingId = await findTemplateId(templates, TEMPLATE_MODEL_CODE);
  if (existingId) return { action: 'skipped', templateId: existingId };

  const { published, draft } = buildTemplateDocuments(parsed, {
    templateId: newId(),
    sourceFile,
    now,
  });
  const create = { ifNoneMatch: '*' };
  await writeJson(
    templates.getBlockBlobClient(blobNames.templateRevision(published.id, published.revision)),
    published,
    create,
  );
  // Written last: an existing draft is what marks the import as done (see findTemplateId).
  await writeJson(templates.getBlockBlobClient(blobNames.templateDraft(draft.id)), draft, create);
  return {
    action: 'created',
    templateId: published.id,
    publishedRevision: published.revision,
    draftRevision: draft.revision,
  };
}

/** Id of the template whose draft is for `modelCode`, if there is one. */
async function findTemplateId(
  templates: ContainerClient,
  modelCode: string,
): Promise<string | undefined> {
  for await (const { name } of templates.listBlobsFlat()) {
    const [templateId = ''] = name.split('/');
    if (name !== blobNames.templateDraft(templateId)) continue;
    const draft = await readJson(templates.getBlockBlobClient(name));
    const parsed = TemplateSchema.pick({ modelCode: true }).safeParse(draft?.json);
    if (parsed.success && parsed.data.modelCode === modelCode) return templateId;
  }
  return undefined;
}

async function readJson(
  blob: BlockBlobClient,
): Promise<{ json: unknown; etag: string } | undefined> {
  let body: string;
  let etag: string | undefined;
  try {
    const response = await blob.download();
    etag = response.etag;
    body = response.readableStreamBody ? await text(response.readableStreamBody) : '';
  } catch (error) {
    if (isRestError(error) && error.statusCode === 404) return undefined;
    throw error;
  }
  if (!etag) throw new Error(`${blobPath(blob)}: storage returned no ETag`);
  try {
    return { json: JSON.parse(body), etag };
  } catch {
    throw new Error(`${blobPath(blob)} is not valid JSON`);
  }
}

async function writeJson(
  blob: BlockBlobClient,
  document: object,
  conditions: BlobRequestConditions,
): Promise<void> {
  // Indented so the blobs stay readable in Storage Explorer; they are small.
  const body = JSON.stringify(document, null, 2);
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
    conditions,
  });
}

function blobPath(blob: BlockBlobClient): string {
  return `${blob.containerName}/${blob.name}`;
}

function withoutQuery(url: string): string {
  const { origin, pathname } = new URL(url);
  return `${origin}${pathname}`;
}
