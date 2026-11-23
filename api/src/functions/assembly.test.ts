/**
 * Assembly instructions through the template endpoints: one is a template of kind `assembly` for
 * a machine model, which may have several, with or without a final inspection template.
 */
import type * as AzureFunctions from '@azure/functions';
import type { HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  ASSEMBLY_EXPORT_FORMAT,
  ImportTemplateResponseSchema,
  newId,
  SaveTemplateResponseSchema,
  templateExport,
  TemplateDetailSchema,
  TemplateListSchema,
  TemplateSchema,
  type ApiError,
  type AssemblyExportInput,
  type Section,
} from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import {
  draftTemplate,
  resetStorage,
  storeTemplate,
  useTestStorage,
  writeSettings,
} from '../../test/storage';
import { loadSettings } from '../lib/settings';
import { createInspection } from './inspections';
import { getRevision, publishTemplate } from './template-revisions';
import { createTemplate, importTemplate, listTemplates, saveTemplate } from './templates';

// Record the registrations instead of letting the package (in "test mode") warn about them.
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: () => undefined },
}));

const admin = principal('Boss@Modig.se', ['admin']);
const inspector = principal('sam.andersson@modig.se', ['inspector']);

beforeAll(useTestStorage);
beforeEach(async () => {
  await resetStorage();
  await writeSettings();
});

const etagOf = (response: HttpResponseInit) => new Headers(response.headers).get('ETag')!;
const errorOf = (response: HttpResponseInit): ApiError => ApiErrorSchema.parse(response.jsonBody);

function post(handler: typeof createTemplate, body: unknown, who = admin) {
  return handler(
    request({ principal: who, method: 'POST', body: JSON.stringify(body) }),
    context(),
  );
}

function put(id: string, body: unknown, ifMatch: string) {
  return saveTemplate(
    request({
      principal: admin,
      params: { id },
      body: JSON.stringify(body),
      headers: { 'If-Match': ifMatch },
    }),
    context(),
  );
}

function publish(id: string, ifMatch: string) {
  return publishTemplate(
    request({
      principal: admin,
      method: 'POST',
      params: { id },
      body: JSON.stringify({}),
      headers: { 'If-Match': ifMatch },
    }),
    context(),
  );
}

async function newInstruction(name = 'HHV-3 24-Tools scheme', modelCode = 'RMMG') {
  const response = await post(createTemplate, { kind: 'assembly', name, modelCode });
  expect(response.status).toBe(201);
  return { draft: TemplateDetailSchema.parse(response.jsonBody).draft, etag: etagOf(response) };
}

function tasks(): Section[] {
  return [
    {
      id: newId(),
      title: 'Task 1',
      items: [
        {
          id: newId(),
          text: 'Mount Pan 80069',
          assembly: {
            department: 'Mechanics',
            minutes: 10,
            fasteners: [{ quantity: 4, designation: 'MC6S M10x25' }],
            partNumbers: ['80069'],
            documents: [{ target: '\\\\SRV102\\share\\82265.pdf' }],
          },
        },
        { id: newId(), text: 'Mount Coolant pipes in base', assembly: { minutes: 90 } },
      ],
    },
  ];
}

const file = (): AssemblyExportInput => ({
  format: ASSEMBLY_EXPORT_FORMAT,
  version: 1,
  instruction: {
    name: 'From a file',
    tasks: [
      {
        title: 'Task 1',
        steps: [
          { text: 'Mount Base tend', fasteners: ['8 pcs - M6S M8x25'], minutes: 10 },
          {
            text: 'With a picture',
            images: [{ imageId: 'notStoredHere', annotations: [] }],
          },
        ],
      },
    ],
  },
});

describe('creating an assembly instruction', () => {
  it('makes an empty draft for the model, and a model may have several', async () => {
    const first = await newInstruction();
    expect(first.draft).toMatchObject({
      kind: 'assembly',
      name: 'HHV-3 24-Tools scheme',
      modelCode: 'RMMG',
      sections: [],
      revision: 1,
    });
    expect(first.draft.parentId).toBeUndefined();
    await newInstruction('Second scheme');
  });

  it('does not take the place of the model’s final inspection template', async () => {
    await newInstruction();
    const response = await post(createTemplate, { name: 'Final inspection', modelCode: 'RMMG' });
    expect(response.status).toBe(201);
  });

  it('refuses an unknown model, adds a new one, and is for admins', async () => {
    expect(
      (await post(createTemplate, { kind: 'assembly', name: 'X', modelCode: 'NOPE' })).status,
    ).toBe(400);
    const created = await post(createTemplate, {
      kind: 'assembly',
      name: 'HHV-3',
      modelCode: 'HHV3',
      newModel: { code: 'HHV3', name: 'HHV 3' },
    });
    expect(created.status).toBe(201);
    expect((await loadSettings())?.machineModels).toContainEqual({ code: 'HHV3', name: 'HHV 3' });
    const refused = await post(
      createTemplate,
      { kind: 'assembly', name: 'X', modelCode: 'RMMG' },
      inspector,
    );
    expect(refused.status).toBe(403);
  });
});

describe('saving, listing and publishing', () => {
  it('keeps the steps’ fields and the model, and lists the tasks and the time', async () => {
    const { draft, etag } = await newInstruction();
    const sections = tasks();
    const saved = await put(
      draft.id,
      { name: 'Renamed', modelCode: 'OTHER', sections, quality: { name: 'x', department: 'y' } },
      etag,
    );
    expect(saved.status).toBe(200);
    const body = SaveTemplateResponseSchema.parse(saved.jsonBody);
    expect(body.draft).toMatchObject({ kind: 'assembly', name: 'Renamed', modelCode: 'RMMG' });
    expect(body.draft.quality).toBeUndefined();
    expect(body.draft.sections).toEqual(sections);

    const list = TemplateListSchema.parse(
      (await listTemplates(request({ principal: inspector }), context())).jsonBody,
    );
    expect(list.find((entry) => entry.id === draft.id)).toMatchObject({
      kind: 'assembly',
      itemCount: 2,
      sectionTitles: ['Task 1'],
      totalMinutes: 100,
      publishedRevision: null,
    });
  });

  it('publishes a revision inspectors can read', async () => {
    const { draft, etag } = await newInstruction();
    const empty = await publish(draft.id, etag);
    expect(empty.status).toBe(400);
    expect(errorOf(empty).details).toEqual([
      { target: { kind: 'template' }, message: 'Add at least one task.' },
    ]);
    const saved = await put(
      draft.id,
      { name: draft.name, modelCode: 'RMMG', sections: tasks() },
      etag,
    );
    const published = await publish(draft.id, etagOf(saved));
    expect(published.status).toBe(200);
    const revision = await getRevision(
      request({ principal: inspector, params: { id: draft.id, n: '1' } }),
      context(),
    );
    expect(TemplateSchema.parse(revision.jsonBody)).toMatchObject({
      kind: 'assembly',
      status: 'published',
      revision: 1,
    });
  });

  it('can’t be used for an inspection', async () => {
    const { draft, etag } = await newInstruction();
    const saved = await put(
      draft.id,
      { name: draft.name, modelCode: 'RMMG', sections: tasks() },
      etag,
    );
    await publish(draft.id, etagOf(saved));
    const response = await post(createInspection, { templateId: draft.id, front: {} }, inspector);
    expect(response.status).toBe(400);
    expect(errorOf(response).message).toMatch(/assembly instruction/);
  });
});

describe('importing an assembly instruction file', () => {
  it('makes a draft with new ids, parsed bolts and without pictures not stored here', async () => {
    const response = await post(importTemplate, {
      kind: 'assembly',
      name: 'Imported',
      modelCode: 'RMMG',
      file: file(),
    });
    expect(response.status).toBe(201);
    const imported = ImportTemplateResponseSchema.parse(response.jsonBody);
    expect(imported.droppedImages).toBe(1);
    expect(imported.draft).toMatchObject({ kind: 'assembly', name: 'Imported', modelCode: 'RMMG' });
    const [task] = imported.draft.sections;
    expect(task?.title).toBe('Task 1');
    expect(task?.items[0]).toMatchObject({
      text: 'Mount Base tend',
      assembly: { minutes: 10, fasteners: [{ quantity: 8, designation: 'M6S M8x25' }] },
    });
    expect(task?.items[1]?.guide).toBeUndefined();
  });

  it('refuses a template file, an unknown model and inspectors', async () => {
    const template = draftTemplate();
    await storeTemplate(template);
    const wrong = await post(importTemplate, {
      kind: 'assembly',
      name: 'X',
      modelCode: 'RMMG',
      file: templateExport(template, undefined, new Date().toISOString()),
    });
    expect(wrong.status).toBe(400);
    const unknown = await post(importTemplate, {
      kind: 'assembly',
      name: 'X',
      modelCode: 'NOPE',
      file: file(),
    });
    expect(unknown.status).toBe(400);
    const refused = await post(
      importTemplate,
      { kind: 'assembly', name: 'X', modelCode: 'RMMG', file: file() },
      inspector,
    );
    expect(refused.status).toBe(403);
  });
});
