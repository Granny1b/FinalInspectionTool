/**
 * Storage fixtures for the endpoint tests: point the API at the test Azurite (see
 * azurite-global-setup.ts) and start each test from known documents.
 */
import {
  blobNames,
  CONTAINERS,
  newId,
  STORAGE_CONNECTION_STRING_ENV,
  type MachineModel,
  type Settings,
  type Template,
} from '@modig/shared';
import { inject } from 'vitest';
import { containerClient, ensureStorage, writeJson } from '../src/lib/storage';

export function useTestStorage(): void {
  process.env[STORAGE_CONNECTION_STRING_ENV] = inject('storageConnectionString');
}

/**
 * Deletes every template and the settings. Safe only because the api project runs its test
 * files one at a time (vitest.config.ts): no other file is using them meanwhile.
 */
export async function resetStorage(): Promise<void> {
  await ensureStorage();
  const templates = containerClient(CONTAINERS.templates);
  for await (const blob of templates.listBlobsFlat()) await templates.deleteBlob(blob.name);
  await containerClient(CONTAINERS.config).getBlobClient(blobNames.settings).deleteIfExists();
}

export const MODELS: MachineModel[] = [
  { code: 'RMMG', name: 'RigiMill MG' },
  { code: 'RMMT', name: 'RigiMill MT' },
  { code: 'IM', name: 'IM8' },
];

export async function writeSettings(machineModels = MODELS): Promise<Settings> {
  const settings: Settings = {
    machineModels,
    defaultLocation: 'Kalmar, Sweden',
    companyName: 'Modig Machine Tool',
    updatedAt: '2026-10-01T08:00:00.000Z',
    updatedBy: 'seed',
  };
  await writeJson(CONTAINERS.config, blobNames.settings, settings);
  return settings;
}

/** A small valid draft: two sections, three rows. */
export function draftTemplate(overrides: Partial<Template> = {}): Template {
  return {
    id: newId(),
    name: 'Final inspection – RigiMill MG',
    modelCode: 'RMMG',
    revision: 1,
    status: 'draft',
    printSettings: { spareRowsPerSection: 3 },
    sections: [
      {
        id: newId(),
        title: 'Loading area',
        items: [
          { id: newId(), text: 'Lifting columns - Marked screws, blue/red/yellow' },
          { id: newId(), text: 'Pallet changer - Check end stops' },
        ],
      },
      {
        id: newId(),
        title: 'Electrical cabinets',
        items: [{ id: newId(), text: 'Main cabinet - Verify labeling on cables and components' }],
      },
    ],
    updatedAt: '2026-10-01T08:00:00.000Z',
    updatedBy: 'seed',
    ...overrides,
  };
}

/**
 * Stores `draft` as is, plus a published copy of it for each number in `revisions`, the way the
 * seed does. Returns the draft's ETag.
 */
export async function storeTemplate(draft: Template, revisions: number[] = []): Promise<string> {
  for (const revision of revisions) {
    const published: Template = {
      ...draft,
      status: 'published',
      revision,
      changeNote: `Revision ${revision}`,
      updatedBy: 'publisher@modig.se',
    };
    await writeJson(
      CONTAINERS.templates,
      blobNames.templateRevision(draft.id, revision),
      published,
    );
  }
  return writeJson(CONTAINERS.templates, blobNames.templateDraft(draft.id), draft);
}
