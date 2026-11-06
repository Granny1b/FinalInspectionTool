/**
 * Storage fixtures for the endpoint tests: point the API at the test Azurite (see
 * azurite-global-setup.ts) and start each test from known documents.
 */
import {
  blobNames,
  DEFAULT_DEVIATION_CATEGORIES,
  DEFAULT_RESPONSIBLES,
  CONTAINERS,
  newId,
  snapshotTemplate,
  STORAGE_CONNECTION_STRING_ENV,
  type Inspection,
  type MachineModel,
  type People,
  type Person,
  type Section,
  type Settings,
  type Template,
} from '@modig/shared';
import { inject } from 'vitest';
import { forgetCachedPeople } from '../src/lib/people';
import {
  containerClient,
  deviationsTable,
  ensureStorage,
  ensureTable,
  writeJson,
} from '../src/lib/storage';

export function useTestStorage(): void {
  process.env[STORAGE_CONNECTION_STRING_ENV] = inject('storageConnectionString');
}

/**
 * Deletes every template, inspection and deviation row, the settings, the people list and the
 * inspection counter. Safe only because the api project runs its test files one at a time
 * (vitest.config.ts): no other file is using them meanwhile.
 */
export async function resetStorage(): Promise<void> {
  await Promise.all([ensureStorage(), ensureTable()]);
  for (const name of [CONTAINERS.templates, CONTAINERS.inspections]) {
    const container = containerClient(name);
    for await (const blob of container.listBlobsFlat()) await container.deleteBlob(blob.name);
  }
  const config = containerClient(CONTAINERS.config);
  await config.getBlobClient(blobNames.settings).deleteIfExists();
  await config.getBlobClient(blobNames.people).deleteIfExists();
  await config.getBlobClient(blobNames.inspectionCounter).deleteIfExists();
  forgetCachedPeople();
  const table = deviationsTable();
  for await (const { partitionKey, rowKey } of table.listEntities()) {
    await table.deleteEntity(partitionKey!, rowKey!);
  }
}

/**
 * Stores `config/people.json` with these people (email, name, role; the rest filled in) and
 * returns the document and its ETag. Clears the API's short cache of the list.
 */
export async function storePeople(
  people: Pick<Person, 'email' | 'name' | 'role'>[],
): Promise<{ data: People; etag: string }> {
  const data: People = {
    people: people.map((person) => ({
      ...person,
      addedAt: '2026-10-01T08:00:00.000Z',
      addedBy: 'boss@modig.se',
    })),
    updatedAt: '2026-10-01T08:00:00.000Z',
    updatedBy: 'boss@modig.se',
  };
  const etag = await writeJson(CONTAINERS.config, blobNames.people, data);
  forgetCachedPeople();
  return { data, etag };
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
    responsibles: [...DEFAULT_RESPONSIBLES],
    deviationCategories: [...DEFAULT_DEVIATION_CATEGORIES],
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
    kind: 'final',
    name: 'Final inspection – RigiMill MG',
    modelCode: 'RMMG',
    revision: 1,
    status: 'draft',
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
 * A template, or an inspection's template snapshot, as an earlier version stored it, before spare
 * lines were removed: with print settings, and sections with spare lines of their own. Storage
 * still holds such documents, and so do template files exported then.
 */
export function withSpareLines<T extends { sections: Section[] }>(
  template: T,
): T & { printSettings: { spareRowsPerSection: number } } {
  return {
    ...template,
    printSettings: { spareRowsPerSection: 3 },
    sections: template.sections.map((section, index) => ({ ...section, spareRows: index + 1 })),
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

/** An in-progress inspection, nothing filled in, of `template` (default: published revision 2). */
export function sampleInspection(
  overrides: Partial<Inspection> = {},
  template = draftTemplate({ status: 'published', revision: 2 }),
): Inspection {
  return {
    id: newId(),
    number: 'FI-2026-0007',
    templateId: template.id,
    templateRevision: template.revision,
    templateSnapshot: snapshotTemplate(template),
    front: {
      machineName: 'RigiMill MG #7',
      modelCode: template.modelCode,
      serialNumber: 'SN-1007',
      participants: ['Sam Andersson'],
      location: 'Kalmar, Sweden',
      date: '2026-10-07',
    },
    results: {},
    extraDeviations: [],
    state: 'in_progress',
    createdAt: '2026-10-07T08:00:00.000Z',
    createdBy: 'sam.andersson@modig.se',
    updatedAt: '2026-10-07T08:00:00.000Z',
    updatedBy: 'sam.andersson@modig.se',
    ...overrides,
  };
}
