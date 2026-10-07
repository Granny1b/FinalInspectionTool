import { BlobServiceClient } from '@azure/storage-blob';
import {
  CONTAINERS,
  DEVIATIONS_TABLE,
  MachineModelSchema,
  newId,
  STORAGE_CONNECTION_STRING_ENV,
  type MachineModel,
} from '@modig/shared';
import { beforeAll, describe, expect, inject, it, vi } from 'vitest';
import { sampleInspection } from '../../test/storage';
import { ConflictError, PreconditionFailedError } from './http';
import {
  AZURITE_CORS_RULE,
  containerClient,
  deviationsTable,
  ensureStorage,
  ensureTable,
  listBlobNames,
  readJson,
  writeJson,
} from './storage';

const { config } = CONTAINERS;
const model: MachineModel = { code: 'RMMG', name: 'RigiMill MG' };
/** Unique per test, so tests never see each other's blobs. */
const blobName = () => `test-${newId()}.json`;

beforeAll(() => {
  process.env[STORAGE_CONNECTION_STRING_ENV] = inject('storageConnectionString');
});

describe('readJson / writeJson', () => {
  it('returns null for a blob that does not exist', async () => {
    expect(await readJson(config, blobName(), MachineModelSchema)).toBeNull();
  });

  it('round-trips a validated document with its ETag', async () => {
    const name = blobName();
    const etag = await writeJson(config, name, model);
    expect(await readJson(config, name, MachineModelSchema)).toEqual({ data: model, etag });

    const properties = await containerClient(config).getBlobClient(name).getProperties();
    expect(properties.contentType).toBe('application/json');
  });

  it('rejects stored data that fails validation', async () => {
    const name = blobName();
    await writeJson(config, name, { code: 'not a code' });
    await expect(readJson(config, name, MachineModelSchema)).rejects.toThrow(
      `config/${name} is invalid`,
    );
  });

  it('names the blob when its content is not JSON', async () => {
    const name = blobName();
    await containerClient(config).getBlockBlobClient(name).upload('{nope', 5);
    await expect(readJson(config, name, MachineModelSchema)).rejects.toThrow(
      `config/${name} is not valid JSON`,
    );
  });

  it('creates only once with ifNoneMatch "*"', async () => {
    const name = blobName();
    await writeJson(config, name, model, { ifNoneMatch: '*' });
    await expect(writeJson(config, name, model, { ifNoneMatch: '*' })).rejects.toThrow(
      ConflictError,
    );
  });

  it('refuses to overwrite with a stale ETag', async () => {
    const name = blobName();
    const first = await writeJson(config, name, model);
    const second = await writeJson(config, name, { ...model, name: 'Renamed' }, { ifMatch: first });
    expect(second).not.toBe(first);

    await expect(writeJson(config, name, model, { ifMatch: first })).rejects.toThrow(
      PreconditionFailedError,
    );
    expect((await readJson(config, name, MachineModelSchema))?.data.name).toBe('Renamed');
  });
});

describe('listBlobNames', () => {
  it('lists the blobs under a prefix', async () => {
    const templateId = newId();
    await writeJson(CONTAINERS.templates, `${templateId}/draft.json`, {});
    await writeJson(CONTAINERS.templates, `${templateId}/rev-1.json`, {});
    await writeJson(CONTAINERS.templates, `${newId()}/draft.json`, {});

    expect(await listBlobNames(CONTAINERS.templates, `${templateId}/`)).toEqual([
      `${templateId}/draft.json`,
      `${templateId}/rev-1.json`,
    ]);
  });
});

describe('ensureStorage / ensureTable', () => {
  it('creates every container and the deviations table, each once per process', async () => {
    const first = ensureStorage();
    expect(ensureStorage()).toBe(first);
    await first;
    const table = ensureTable();
    expect(ensureTable()).toBe(table);
    await table;

    for (const name of Object.values(CONTAINERS)) {
      expect(await containerClient(name).exists()).toBe(true);
    }
    expect(deviationsTable().tableName).toBe(DEVIATIONS_TABLE);
    await expect(deviationsTable().listEntities().next()).resolves.toBeDefined();
  });

  it('keeps blobs working on a fresh instance while the table is down', async () => {
    vi.resetModules();
    const fresh = await import('./storage');
    const { syncDeviations } = await import('./deviations');
    const createTable = vi
      .spyOn(fresh.deviationsTable(), 'createTable')
      .mockRejectedValue(new Error('connect ECONNREFUSED'));

    const name = blobName();
    const etag = await fresh.writeJson(config, name, model);
    expect(await fresh.readJson(config, name, MachineModelSchema)).toEqual({ data: model, etag });
    await expect(fresh.ensureTable()).rejects.toThrow('ECONNREFUSED');
    await expect(syncDeviations(sampleInspection())).rejects.toThrow('ECONNREFUSED');

    // Not cached: once the table is back, the next request creates it.
    createTable.mockRestore();
    await expect(fresh.ensureTable()).resolves.toBeUndefined();
  });

  it('is idempotent across processes (everything already exists)', async () => {
    vi.resetModules();
    const fresh = await import('./storage');
    await expect(fresh.ensureStorage()).resolves.toBeUndefined();
  });

  it('retries after a failure instead of caching it', async () => {
    vi.resetModules();
    const fresh = await import('./storage');
    const saved = process.env[STORAGE_CONNECTION_STRING_ENV];
    delete process.env[STORAGE_CONNECTION_STRING_ENV];
    try {
      await expect(fresh.ensureStorage()).rejects.toThrow('is not set');
    } finally {
      process.env[STORAGE_CONNECTION_STRING_ENV] = saved;
    }
    await expect(fresh.ensureStorage()).resolves.toBeUndefined();
  });

  it('sets the blob CORS rule on Azurite, so the browser can use SAS URLs locally', async () => {
    const service = BlobServiceClient.fromConnectionString(inject('storageConnectionString'));
    await service.setProperties({ cors: [] });
    vi.resetModules();
    const fresh = await import('./storage');
    await fresh.ensureStorage();

    expect((await service.getProperties()).cors).toEqual([AZURITE_CORS_RULE]);
    // What the browser asks before PUTting a photo from the app's origin.
    const preflight = await fetch(containerClient(config).getBlobClient('x.jpg').url, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:4280',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type,x-ms-blob-type',
      },
    });
    expect(preflight.status).toBe(200);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4280');
  });

  it('names the missing setting when there is no connection string', async () => {
    vi.resetModules();
    const fresh = await import('./storage');
    const saved = process.env[STORAGE_CONNECTION_STRING_ENV];
    delete process.env[STORAGE_CONNECTION_STRING_ENV];
    try {
      expect(() => fresh.containerClient(config)).toThrow(
        `${STORAGE_CONNECTION_STRING_ENV} is not set`,
      );
    } finally {
      process.env[STORAGE_CONNECTION_STRING_ENV] = saved;
    }
  });
});
