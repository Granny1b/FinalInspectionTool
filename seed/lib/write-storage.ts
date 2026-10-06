/**
 * Writes the seed into blob/table storage. Idempotent, so `npm run dev` can run it every time:
 * containers, the table and the settings are created when missing, and the RigiMill MG template
 * is imported once. Nothing that already exists is changed. Assumes a single writer.
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
  TemplateSchema,
  type Template,
} from '@modig/shared';
import {
  buildSettings,
  buildTemplateDocuments,
  draftOf,
  TEMPLATE_MODEL_CODE,
} from './build-documents';
import type { ParsedWorkbook } from './parse-workbook';

export type Storage = { blobService: BlobServiceClient; deviations: TableClient };

export type SeedReport = {
  createdContainers: string[];
  settings: { action: 'created'; modelCodes: string[] } | { action: 'unchanged' };
  template:
    | {
        /** `resumed`: an earlier run stopped between the revision and the draft; now completed. */
        action: 'created' | 'resumed';
        templateId: string;
        publishedRevision: number;
        draftRevision: number;
      }
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

/**
 * Create the settings on the first run only. After that they belong to the admins and are never
 * touched, so a model they removed or recoded stays that way.
 */
async function seedSettings(
  config: ContainerClient,
  parsed: ParsedWorkbook,
  now: string,
): Promise<SeedReport['settings']> {
  const settings = buildSettings(parsed, now);
  try {
    await writeJson(config.getBlockBlobClient(blobNames.settings), settings, { ifNoneMatch: '*' });
  } catch (error) {
    if (isRestError(error) && error.code === 'BlobAlreadyExists') return { action: 'unchanged' };
    throw error;
  }
  return { action: 'created', modelCodes: settings.machineModels.map((m) => m.code) };
}

/** Import the template unless a RigiMill MG template already exists (whatever its content). */
async function seedTemplate(
  templates: ContainerClient,
  parsed: ParsedWorkbook,
  sourceFile: string,
  now: string,
): Promise<SeedReport['template']> {
  const create = { ifNoneMatch: '*' };
  const existing = await findTemplate(templates, TEMPLATE_MODEL_CODE);
  if (existing?.revisionWithoutDraft) {
    // Built from the stored revision, not the workbook: parsing again would mint new item ids.
    const published = existing.revisionWithoutDraft;
    const draft = draftOf(published);
    await writeJson(templates.getBlockBlobClient(blobNames.templateDraft(draft.id)), draft, create);
    return {
      action: 'resumed',
      templateId: draft.id,
      publishedRevision: published.revision,
      draftRevision: draft.revision,
    };
  }
  if (existing) return { action: 'skipped', templateId: existing.templateId };

  const { published, draft } = buildTemplateDocuments(parsed, {
    templateId: newId(),
    sourceFile,
    now,
  });
  await writeJson(
    templates.getBlockBlobClient(blobNames.templateRevision(published.id, published.revision)),
    published,
    create,
  );
  // Written last: an existing draft is what marks the import as done (see findTemplate).
  await writeJson(templates.getBlockBlobClient(blobNames.templateDraft(draft.id)), draft, create);
  return {
    action: 'created',
    templateId: published.id,
    publishedRevision: published.revision,
    draftRevision: draft.revision,
  };
}

/**
 * The template for `modelCode`: normally one with a draft. Failing that, a published revision
 * whose template has no draft, which is an import that stopped between its two writes.
 */
async function findTemplate(
  templates: ContainerClient,
  modelCode: string,
): Promise<{ templateId: string; revisionWithoutDraft?: Template } | undefined> {
  const drafts: string[] = [];
  const latestRevision = new Map<string, number>();
  for await (const { name } of templates.listBlobsFlat()) {
    const [templateId = '', file = ''] = name.split('/');
    if (name === blobNames.templateDraft(templateId)) drafts.push(templateId);
    const revision = Number(blobNames.templateRevisionPattern.exec(file)?.[1] ?? 0);
    if (revision > 0 && name === blobNames.templateRevision(templateId, revision)) {
      latestRevision.set(templateId, Math.max(revision, latestRevision.get(templateId) ?? 0));
    }
  }

  for (const templateId of drafts) {
    const draft = await readJson(templates.getBlockBlobClient(blobNames.templateDraft(templateId)));
    const parsed = TemplateSchema.pick({ modelCode: true }).safeParse(draft?.json);
    if (parsed.success && parsed.data.modelCode === modelCode) return { templateId };
  }
  for (const [templateId, revision] of latestRevision) {
    if (drafts.includes(templateId)) continue;
    const blob = templates.getBlockBlobClient(blobNames.templateRevision(templateId, revision));
    const parsed = TemplateSchema.safeParse((await readJson(blob))?.json);
    if (parsed.success && parsed.data.id === templateId && parsed.data.modelCode === modelCode) {
      return { templateId, revisionWithoutDraft: parsed.data };
    }
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
