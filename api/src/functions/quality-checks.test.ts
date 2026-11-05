/**
 * Quality checks through the template endpoints: a quality check is a template of kind `quality`
 * under its machine's final inspection template.
 */
import type * as AzureFunctions from '@azure/functions';
import type { HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  ImportTemplateResponseSchema,
  newId,
  qualityCheckExport,
  SaveTemplateResponseSchema,
  templateExport,
  TemplateDetailSchema,
  TemplateListSchema,
  TemplateSchema,
  type ApiError,
  type QualityFront,
  type Section,
  type Template,
} from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import {
  draftTemplate,
  resetStorage,
  storePeople,
  storeTemplate,
  useTestStorage,
  writeSettings,
} from '../../test/storage';
import { containerClient, readJson } from '../lib/storage';
import { createInspection } from './inspections';
import { getRevision, publishTemplate } from './template-revisions';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  importTemplate,
  listTemplates,
  saveTemplate,
} from './templates';

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

function put(id: string, body: unknown, ifMatch: string, who = admin) {
  return saveTemplate(
    request({
      principal: who,
      params: { id },
      body: JSON.stringify(body),
      headers: { 'If-Match': ifMatch },
    }),
    context(),
  );
}

function remove(id: string, ifMatch: string, who = admin) {
  return deleteTemplate(
    request({ principal: who, method: 'DELETE', params: { id }, headers: { 'If-Match': ifMatch } }),
    context(),
  );
}

function publish(id: string, ifMatch: string, who = admin) {
  return publishTemplate(
    request({
      principal: who,
      method: 'POST',
      params: { id },
      body: JSON.stringify({ changeNote: 'First' }),
      headers: { 'If-Match': ifMatch },
    }),
    context(),
  );
}

async function blobsOf(id: string): Promise<string[]> {
  const names: string[] = [];
  for await (const blob of containerClient(CONTAINERS.templates).listBlobsFlat({
    prefix: `${id}/`,
  })) {
    names.push(blob.name);
  }
  return names;
}

/** RigiMill MG's final inspection template, published once. */
async function machine(overrides: Partial<Template> = {}) {
  const template = draftTemplate({ revision: 2, ...overrides });
  const etag = await storeTemplate(template, [1]);
  return { template, etag };
}

/** A new quality check under `parentId`, as the dialog creates it. */
async function newCheck(parentId: string, position = 'QC4', operation = 'Pre start up') {
  const response = await post(createTemplate, { kind: 'quality', parentId, position, operation });
  expect(response.status).toBe(201);
  return { draft: TemplateDetailSchema.parse(response.jsonBody).draft, etag: etagOf(response) };
}

const front: QualityFront = {
  position: 'QC4',
  operation: 'Pre start up',
  department: 'Quality',
  documentNumber: '1.22.2',
  madeBy: 'Sam Andersson',
  date: '2026-11-05',
};

/** A checklist with what a quality check's rows carry. */
function checklist(): Section[] {
  return [
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
        },
        { id: newId(), text: 'Warning signs inside the electrical cabinet.', timeHours: 0.1 },
      ],
    },
  ];
}

describe('POST /api/templates with kind quality', () => {
  it('creates an empty quality check under the machine, with its model, and answers 201', async () => {
    const { template } = await machine();
    await storePeople([{ email: 'boss@modig.se', name: 'Bo Ss', role: 'admin' }]);
    const response = await post(createTemplate, {
      kind: 'quality',
      parentId: template.id,
      position: ' QC4 ',
      operation: 'Pre start up',
    });
    expect(response.status).toBe(201);
    const { draft, revisions, hasUnpublishedChanges } = TemplateDetailSchema.parse(
      response.jsonBody,
    );
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(
      new Date(),
    );
    expect(draft).toEqual({
      id: expect.any(String),
      kind: 'quality',
      parentId: template.id,
      name: 'QC4 · Pre start up',
      modelCode: 'RMMG',
      revision: 1,
      status: 'draft',
      quality: {
        position: 'QC4',
        operation: 'Pre start up',
        department: 'Quality',
        documentNumber: '',
        madeBy: 'Bo Ss',
        date: today,
      },
      sections: [],
      updatedAt: expect.any(String),
      updatedBy: 'boss@modig.se',
    });
    expect(revisions).toEqual([]);
    expect(hasUnpublishedChanges).toBe(true);
    const stored = await readJson(
      CONTAINERS.templates,
      blobNames.templateDraft(draft.id),
      TemplateSchema,
    );
    expect(stored).toEqual({ data: draft, etag: etagOf(response) });
  });

  it('404 when the machine’s template does not exist', async () => {
    const response = await post(createTemplate, {
      kind: 'quality',
      parentId: newId(),
      position: 'QC1',
      operation: '',
    });
    expect(response.status).toBe(404);
  });

  it('400 when the parent is a quality check, or without a position', async () => {
    const { template } = await machine();
    const { draft } = await newCheck(template.id);
    const nested = await post(createTemplate, {
      kind: 'quality',
      parentId: draft.id,
      position: 'QC5',
      operation: '',
    });
    expect(nested.status).toBe(400);
    expect(errorOf(nested).message).toMatch(/final inspection template/);
    const blank = await post(createTemplate, {
      kind: 'quality',
      parentId: template.id,
      position: ' ',
      operation: 'X',
    });
    expect(blank.status).toBe(400);
  });

  it('leaves the one-template-per-model rule to final inspection templates', async () => {
    const { template } = await machine();
    // Several quality checks for one model are fine.
    await newCheck(template.id, 'QC1');
    await newCheck(template.id, 'QC2');
    // The model's final inspection template is still the only one.
    const second = await post(createTemplate, { name: 'Another', modelCode: 'RMMG' });
    expect(second.status).toBe(409);
    expect(errorOf(second).message).toMatch(/already the template for RigiMill MG/);
    // A quality check doesn't make its model taken once its machine moves to another model.
    const moved = await put(
      template.id,
      { name: template.name, modelCode: 'RMMT', sections: template.sections },
      (await storeTemplate(template))!,
    );
    expect(moved.status).toBe(200);
    expect((await post(createTemplate, { name: 'MG again', modelCode: 'RMMG' })).status).toBe(201);
  });

  it('403 for an inspector', async () => {
    const { template } = await machine();
    const response = await post(
      createTemplate,
      { kind: 'quality', parentId: template.id, position: 'QC1', operation: '' },
      inspector,
    );
    expect(response.status).toBe(403);
    expect(await blobsOf(template.id)).toHaveLength(2);
  });
});

describe('GET /api/templates', () => {
  it('lists quality checks with their kind, machine, front page, sections and time', async () => {
    const { template } = await machine();
    const { draft, etag } = await newCheck(template.id);
    const sections = checklist();
    expect((await put(draft.id, { ...draft, quality: front, sections }, etag)).status).toBe(200);

    const response = await listTemplates(request({ principal: inspector }), context());
    const list = TemplateListSchema.parse(response.jsonBody);
    expect(list.find((summary) => summary.id === template.id)).toEqual(
      expect.objectContaining({ kind: 'final' }),
    );
    expect(list.find((summary) => summary.id === template.id)).not.toHaveProperty('parentId');
    expect(list.find((summary) => summary.id === draft.id)).toEqual({
      id: draft.id,
      kind: 'quality',
      parentId: template.id,
      name: 'QC4 · Pre start up',
      modelCode: 'RMMG',
      publishedRevision: null,
      publishedName: null,
      publishedModelCode: null,
      draftRevision: 1,
      hasUnpublishedChanges: true,
      itemCount: 2,
      quality: front,
      sectionTitles: ['Safety features'],
      totalHours: 0.3,
      updatedAt: expect.any(String),
      updatedBy: 'boss@modig.se',
    });
  });
});

describe('PUT /api/templates/{id} of a quality check', () => {
  it('saves the front page and rows; the name follows, the model and machine stay', async () => {
    const { template } = await machine();
    const { draft, etag } = await newCheck(template.id);
    const sections = checklist();
    const response = await put(
      draft.id,
      {
        name: 'Something else',
        modelCode: 'IM',
        quality: { ...front, position: 'QC5', operation: 'Run in' },
        sections,
      },
      etag,
    );
    expect(response.status).toBe(200);
    const saved = SaveTemplateResponseSchema.parse(response.jsonBody).draft;
    expect(saved).toMatchObject({
      kind: 'quality',
      parentId: template.id,
      name: 'QC5 · Run in',
      modelCode: 'RMMG',
      quality: { ...front, position: 'QC5', operation: 'Run in' },
      sections,
    });
  });

  it('keeps the front page when the editor leaves it out', async () => {
    const { template } = await machine();
    const { draft, etag } = await newCheck(template.id);
    const response = await put(draft.id, { name: '', modelCode: 'RMMG', sections: [] }, etag);
    expect(SaveTemplateResponseSchema.parse(response.jsonBody).draft.quality).toEqual(
      draft.quality,
    );
  });

  it('gives a final inspection template no front page of a quality check', async () => {
    const { template } = await machine();
    const response = await put(
      template.id,
      { name: template.name, modelCode: 'RMMG', quality: front, sections: template.sections },
      (await storeTemplate(template))!,
    );
    const saved = SaveTemplateResponseSchema.parse(response.jsonBody).draft;
    expect(saved.kind).toBe('final');
    expect(saved).not.toHaveProperty('quality');
  });

  it('400 for a date that is not one, a blank reference or a negative time', async () => {
    const { template } = await machine();
    const { draft, etag } = await newCheck(template.id);
    const [section] = checklist();
    for (const body of [
      { ...draft, quality: { ...front, date: '5 Nov' } },
      {
        ...draft,
        sections: [{ ...section, items: [{ id: newId(), text: 'x', references: [' '] }] }],
      },
      { ...draft, sections: [{ ...section, items: [{ id: newId(), text: 'x', timeHours: -1 }] }] },
    ]) {
      expect((await put(draft.id, body, etag)).status).toBe(400);
    }
  });
});

describe('publishing a quality check', () => {
  it('needs a position, then freezes the front page and rows as revision 1', async () => {
    const { template } = await machine();
    const { draft, etag } = await newCheck(template.id);
    const sections = checklist();
    const blank = await put(
      draft.id,
      { ...draft, quality: { ...front, position: '', operation: '' }, sections },
      etag,
    );
    const refused = await publish(draft.id, etagOf(blank));
    expect(refused.status).toBe(400);
    expect(errorOf(refused).details).toEqual([
      { target: { kind: 'template' }, message: 'The quality check needs a position.' },
    ]);

    const fixed = await put(draft.id, { ...draft, quality: front, sections }, etagOf(blank));
    const response = await publish(draft.id, etagOf(fixed));
    expect(response.status).toBe(200);
    const detail = TemplateDetailSchema.parse(response.jsonBody);
    expect(detail.revisions.map((revision) => revision.revision)).toEqual([1]);
    expect(detail.hasUnpublishedChanges).toBe(false);

    const revision = await getRevision(
      request({ principal: inspector, params: { id: draft.id, n: '1' } }),
      context(),
    );
    expect(TemplateSchema.parse(revision.jsonBody)).toMatchObject({
      kind: 'quality',
      parentId: template.id,
      name: 'QC4 · Pre start up',
      status: 'published',
      revision: 1,
      quality: front,
      sections,
    });

    // A changed time is an unpublished change.
    const timed = sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item, timeHours: 1 })),
    }));
    const changed = await put(
      draft.id,
      { ...draft, quality: front, sections: timed },
      etagOf(response),
    );
    expect(SaveTemplateResponseSchema.parse(changed.jsonBody).hasUnpublishedChanges).toBe(true);
  });
});

describe('DELETE /api/templates/{id}', () => {
  it('deletes a final inspection template’s quality checks with it, drafts and revisions', async () => {
    const { template, etag } = await machine();
    const first = await newCheck(template.id, 'QC1');
    const second = await newCheck(template.id, 'QC2');
    const fixed = await put(
      first.draft.id,
      { ...first.draft, quality: front, sections: checklist() },
      first.etag,
    );
    expect((await publish(first.draft.id, etagOf(fixed))).status).toBe(200);
    // Another machine's quality check stays.
    const other = await machine({ name: 'Final inspection – IM8', modelCode: 'IM' });
    const kept = await newCheck(other.template.id, 'QC9');

    expect((await remove(template.id, etag)).status).toBe(204);
    expect(await blobsOf(template.id)).toEqual([]);
    expect(await blobsOf(first.draft.id)).toEqual([]);
    expect(await blobsOf(second.draft.id)).toEqual([]);
    expect(await blobsOf(kept.draft.id)).toHaveLength(1);
    const list = TemplateListSchema.parse(
      (await listTemplates(request({ principal: admin }), context())).jsonBody,
    );
    expect(list.map((summary) => summary.id).sort()).toEqual(
      [other.template.id, kept.draft.id].sort(),
    );
  });

  it('deletes a quality check alone, leaving its machine', async () => {
    const { template } = await machine();
    const { draft, etag } = await newCheck(template.id);
    expect((await remove(draft.id, etag)).status).toBe(204);
    expect(await blobsOf(draft.id)).toEqual([]);
    expect(await blobsOf(template.id)).toHaveLength(2);
    const detail = await getTemplate(
      request({ principal: admin, params: { id: draft.id } }),
      context(),
    );
    expect(detail.status).toBe(404);
  });
});

describe('POST /api/templates/import with kind quality', () => {
  /** Stores an image blob, as an upload would. */
  async function storeImage(): Promise<string> {
    const imageId = newId();
    await containerClient(CONTAINERS.images)
      .getBlockBlobClient(blobNames.image(imageId))
      .upload('jpeg', 4);
    return imageId;
  }

  it('makes a new draft under the machine, with fresh ids and the chosen title', async () => {
    const { template } = await machine();
    const here = await storeImage();
    const sections = checklist();
    sections[0]!.items[0] = {
      ...sections[0]!.items[0]!,
      guide: {
        description: 'Both sides',
        images: [
          { imageId: here, annotations: [], verdict: 'good' },
          { imageId: newId(), annotations: [], verdict: 'bad' },
        ],
      },
    };
    const file = qualityCheckExport(
      { modelCode: 'IM', quality: front, sections },
      'IM8',
      '2026-11-05T08:00:00.000Z',
    );
    const response = await post(importTemplate, {
      kind: 'quality',
      parentId: template.id,
      position: 'QC5',
      operation: 'Run in',
      file,
    });
    expect(response.status).toBe(201);
    const { draft, droppedImages } = ImportTemplateResponseSchema.parse(response.jsonBody);
    expect(droppedImages).toBe(1);
    expect(draft).toMatchObject({
      kind: 'quality',
      parentId: template.id,
      modelCode: 'RMMG',
      name: 'QC5 · Run in',
      quality: { ...front, position: 'QC5', operation: 'Run in' },
      revision: 1,
    });
    // Fresh ids, the rest as in the file.
    expect(draft.sections[0]!.id).not.toBe(sections[0]!.id);
    expect(draft.sections[0]!.items.map((item) => item.id)).not.toContain(
      sections[0]!.items[0]!.id,
    );
    expect(draft.sections[0]!.items[0]).toMatchObject({
      text: sections[0]!.items[0]!.text,
      how: 'Should be visible and not turned inward.',
      references: ['ISO 12100', 'ISO 7010'],
      timeHours: 0.2,
      guide: { description: 'Both sides', images: [{ imageId: here, verdict: 'good' }] },
    });
  });

  it('refuses a template file, and the template import refuses a quality check file', async () => {
    const { template } = await machine();
    const templateFile = templateExport(template, 'RigiMill MG', '2026-11-05T08:00:00.000Z');
    const wrongFile = await post(importTemplate, {
      kind: 'quality',
      parentId: template.id,
      position: 'QC5',
      operation: '',
      file: templateFile,
    });
    expect(wrongFile.status).toBe(400);
    const checkFile = qualityCheckExport(
      { modelCode: 'RMMG', quality: front, sections: [] },
      undefined,
      '2026-11-05T08:00:00.000Z',
    );
    const asTemplate = await post(importTemplate, { name: 'X', modelCode: 'IM', file: checkFile });
    expect(asTemplate.status).toBe(400);
  });

  it('404 for an unknown machine, 403 for an inspector', async () => {
    const file = qualityCheckExport(
      { modelCode: 'RMMG', quality: front, sections: [] },
      undefined,
      '2026-11-05T08:00:00.000Z',
    );
    const body = { kind: 'quality', parentId: newId(), position: 'QC1', operation: '', file };
    expect((await post(importTemplate, body)).status).toBe(404);
    const { template } = await machine();
    expect((await post(importTemplate, { ...body, parentId: template.id }, inspector)).status).toBe(
      403,
    );
  });
});

describe('inspections', () => {
  it('refuse a quality check: an inspection needs the final inspection template', async () => {
    const { template } = await machine();
    const { draft, etag } = await newCheck(template.id);
    const fixed = await put(draft.id, { ...draft, quality: front, sections: checklist() }, etag);
    expect((await publish(draft.id, etagOf(fixed))).status).toBe(200);

    const response = await createInspection(
      request({
        principal: inspector,
        method: 'POST',
        body: JSON.stringify({
          templateId: draft.id,
          front: {
            machineName: 'RigiMill MG #7',
            serialNumber: 'SN-1',
            participants: [],
            location: 'Kalmar',
            date: '2026-11-05',
          },
        }),
      }),
      context(),
    );
    expect(response.status).toBe(400);
    expect(errorOf(response).message).toBe(
      'A quality check can’t be used for an inspection. Choose the machine’s final inspection template.',
    );
  });
});
