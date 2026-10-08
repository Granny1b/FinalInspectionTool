/**
 * Blob and table access for the functions. Documents are one JSON blob each; every write can be
 * conditional on the blob's ETag (optimistic concurrency, brief §3) and storage's condition
 * failures surface as the matching HttpError, so endpoints can just let them propagate.
 *
 * The JSON helpers call `ensureStorage()` first; code using `containerClient()` directly should
 * await it too, and code using `deviationsTable()` should await `ensureTable()`.
 */
import { text } from 'node:stream/consumers';
import { TableClient } from '@azure/data-tables';
import {
  BlobServiceClient,
  isRestError,
  type CorsRule,
  type ContainerClient,
} from '@azure/storage-blob';
import {
  CONTAINERS,
  DEVIATIONS_TABLE,
  STORAGE_CONNECTION_STRING_ENV,
  type ContainerName,
} from '@modig/shared';
import { z } from 'zod';
import { ConflictError, PreconditionFailedError } from './http';

type Clients = {
  blobService: BlobServiceClient;
  deviations: TableClient;
  /** Plain http means the local Azurite emulator: Azure storage is https-only. */
  azurite: boolean;
};
let clients: Clients | undefined;

/** Created on first use so a missing setting fails the request that needs storage, not startup. */
function getClients(): Clients {
  if (clients) return clients;
  const connectionString = process.env[STORAGE_CONNECTION_STRING_ENV];
  if (!connectionString) {
    throw new Error(
      `${STORAGE_CONNECTION_STRING_ENV} is not set. Locally it comes from api/local.settings.json ` +
        '(copied from local.settings.example.json); in Azure from the Static Web App app settings.',
    );
  }
  const blobService = BlobServiceClient.fromConnectionString(connectionString);
  const azurite = blobService.url.startsWith('http://');
  const deviations = TableClient.fromConnectionString(connectionString, DEVIATIONS_TABLE, {
    // Azurite speaks plain http, which the Tables SDK refuses unless allowed. Blob and table
    // endpoints share a protocol in every real setup.
    allowInsecureConnection: azurite,
  });
  clients = { blobService, deviations, azurite };
  return clients;
}

export function containerClient(name: ContainerName): ContainerClient {
  return getClients().blobService.getContainerClient(name);
}

export function deviationsTable(): TableClient {
  return getClients().deviations;
}

let containersEnsured: Promise<void> | undefined;
let tableEnsured: Promise<void> | undefined;

/**
 * Creates every container if missing, once per process, and on Azurite sets the blob CORS rule.
 * Bicep does both in Azure; this is the safety net for a fresh or wiped local Azurite. The
 * deviations table has its own `ensureTable()`, so a table outage never fails blob requests.
 */
export function ensureStorage(): Promise<void> {
  containersEnsured ??= createContainers().catch((error: unknown) => {
    containersEnsured = undefined; // let the next request retry, e.g. once Azurite is up
    throw error;
  });
  return containersEnsured;
}

/** Creates the deviations table if missing, once per process; as `ensureStorage()` for blobs. */
export function ensureTable(): Promise<void> {
  tableEnsured ??= createTable().catch((error: unknown) => {
    tableEnsured = undefined;
    throw error;
  });
  return tableEnsured;
}

/**
 * Locally the browser uploads and downloads images on Azurite (127.0.0.1:10000) from the app's
 * origin, with SAS URLs from the API. Mirrors the production rule in infra/main.bicep.
 */
export const AZURITE_CORS_RULE: CorsRule = {
  allowedOrigins: 'http://localhost:4280,http://127.0.0.1:4280,http://localhost:5173',
  allowedMethods: 'GET,HEAD,PUT,OPTIONS',
  allowedHeaders: '*',
  exposedHeaders: 'ETag,Content-Length,Content-Type,Last-Modified,x-ms-*',
  maxAgeInSeconds: 3600,
};

async function createContainers(): Promise<void> {
  const { blobService, azurite } = getClients();
  await Promise.all([
    ...Object.values(CONTAINERS).map((name) => containerClient(name).createIfNotExists()),
    ...(azurite ? [blobService.setProperties({ cors: [AZURITE_CORS_RULE] })] : []),
  ]);
}

async function createTable(): Promise<void> {
  await deviationsTable().createTable(); // no-op when it exists
}

/** Reads and validates a JSON blob. Returns null when it does not exist. */
export async function readJson<T>(
  container: ContainerName,
  blobName: string,
  schema: z.ZodType<T>,
): Promise<{ data: T; etag: string } | null> {
  await ensureStorage();
  const download = await containerClient(container)
    .getBlobClient(blobName)
    .download()
    .catch((error: unknown) => {
      if (isRestError(error) && error.statusCode === 404) return null;
      throw error;
    });
  if (!download) return null;
  if (!download.readableStreamBody || !download.etag) {
    throw new Error(`${container}/${blobName}: download returned no body or ETag`);
  }
  let json: unknown;
  try {
    json = JSON.parse(await text(download.readableStreamBody));
  } catch (cause) {
    throw new Error(`${container}/${blobName} is not valid JSON`, { cause });
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    // Stored data we cannot trust is a server problem (500), not the caller's.
    throw new Error(`${container}/${blobName} is invalid:\n${z.prettifyError(result.error)}`);
  }
  return { data: result.data, etag: download.etag };
}

export type WriteConditions = {
  /** Only overwrite this exact version (412 PreconditionFailedError otherwise). */
  ifMatch?: string;
  /** Only create (409 ConflictError if the blob already exists). */
  ifNoneMatch?: '*';
};

export type WriteOptions = WriteConditions & {
  /** Replaces the blob's metadata. Names and values must be ASCII (they travel as headers). */
  metadata?: Record<string, string>;
};

/** Writes `data` as a JSON blob and returns the new ETag. */
export async function writeJson(
  container: ContainerName,
  blobName: string,
  data: unknown,
  { metadata, ...conditions }: WriteOptions = {},
): Promise<string> {
  await ensureStorage();
  const body = JSON.stringify(data);
  const { etag } = await containerClient(container)
    .getBlockBlobClient(blobName)
    .upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
      conditions,
      metadata,
    })
    .catch(toConditionError);
  if (!etag) throw new Error(`${container}/${blobName}: upload returned no ETag`);
  return etag;
}

/** Storage's answers to failed write conditions, as the errors endpoints return to clients. */
function toConditionError(error: unknown): never {
  if (isRestError(error)) {
    if (error.statusCode === 412 && error.code === 'ConditionNotMet') {
      throw new PreconditionFailedError();
    }
    if (error.statusCode === 409 && error.code === 'BlobAlreadyExists') throw new ConflictError();
  }
  throw error;
}

export async function listBlobNames(container: ContainerName, prefix?: string): Promise<string[]> {
  await ensureStorage();
  const names: string[] = [];
  for await (const blob of containerClient(container).listBlobsFlat({ prefix })) {
    names.push(blob.name);
  }
  return names;
}
