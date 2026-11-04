import type * as AzureFunctions from '@azure/functions';
import type { HttpHandler, HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  checklistIds,
  CONTAINERS,
  ImportTemplateResponseSchema,
  InspectionSchema,
  MAX_GUIDE_IMAGES,
  newId,
  SaveTemplateResponseSchema,
  templateExport,
  TemplateDetailSchema,
  TemplateListSchema,
  TemplateSchema,
  type ApiError,
  type GuideImage,
  type Role,
  type Template,
} from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import {
  draftTemplate,
  MODELS,
  resetStorage,
  sampleInspection,
  storeTemplate,
  useTestStorage,
  writeSettings,
} from '../../test/storage';
import { syncDeviations } from '../lib/deviations';
import { writeInspection } from '../lib/inspections';
import { clearRevisionCache, loadInsights } from '../lib/insights';
import { loadSettings } from '../lib/settings';
import { containerClient, readJson } from '../lib/storage';
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  importTemplate,
  listTemplates,
  saveTemplate,
} from './templates';

// Record the registrations instead of letting the package (in "test mode") warn about them.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

const admin = principal('Boss@Modig.se', ['admin']);
const inspector = principal('sam.andersson@modig.se', ['inspector']);

beforeAll(useTestStorage);
beforeEach(async () => {
  await resetStorage();
  await writeSettings();
});

const etagOf = (response: HttpResponseInit) => new Headers(response.headers).get('ETag');
const errorOf = (response: HttpResponseInit): ApiError => ApiErrorSchema.parse(response.jsonBody);

async function storedDraft(id: string) {
  return readJson(CONTAINERS.templates, blobNames.templateDraft(id), TemplateSchema);
}

function create(body: unknown, who = admin) {
  return createTemplate(
    request({ principal: who, method: 'POST', body: JSON.stringify(body) }),
    context(),
  );
}

function get(id: string, who = admin) {
  return getTemplate(request({ principal: who, params: { id } }), context());
}

function put(id: string, body: unknown, ifMatch?: string | null, who = admin) {
  return saveTemplate(
    request({
      principal: who,
      params: { id },
      body: JSON.stringify(body),
      headers: ifMatch ? { 'If-Match': ifMatch } : {},
    }),
    context(),
  );
}

/** What the editor sends: the editable fields (the server ignores anything else). */
function editable({ name, modelCode, coverImageId, printSettings, sections }: Template) {
  return { name, modelCode, coverImageId, printSettings, sections };
}

describe('registration', () => {
  const registered = (name: string) => {
    const found = registrations.find(([registeredName]) => registeredName === name);
    return found?.[1] as { methods: string[]; route: string; handler: HttpHandler } | undefined;
  };

  it('registers one function per route, methods combined, SWA doing authentication', () => {
    expect(registrations).toEqual([
      [
        'templates',
        {
          methods: ['GET', 'POST'],
          authLevel: 'anonymous',
          route: 'templates',
          handler: expect.any(Function),
        },
      ],
      [
        'templateImport',
        {
          methods: ['POST'],
          authLevel: 'anonymous',
          route: 'templates/import',
          handler: importTemplate,
        },
      ],
      [
        'template',
        {
          methods: ['GET', 'PUT', 'DELETE'],
          authLevel: 'anonymous',
          route: 'templates/{id}',
          handler: expect.any(Function),
        },
      ],
    ]);
  });

  it('dispatches by method, each with its own role', async () => {
    const templates = registered('templates')!.handler;
    const template = registered('template')!.handler;
    const asInspector = (method: string) =>
      request({ principal: inspector, method, params: { id: newId() } });

    expect((await templates(asInspector('GET'), context())).status).toBe(200);
    expect((await templates(asInspector('POST'), context())).status).toBe(403);
    expect((await template(asInspector('GET'), context())).status).toBe(403);
    expect((await template(asInspector('PUT'), context())).status).toBe(403);
    expect((await template(asInspector('DELETE'), context())).status).toBe(403);
  });

  it('sends DELETE to the delete handler', async () => {
    const template = draftTemplate();
    const etag = await storeTemplate(template);
    const response = await registered('template')!.handler(
      request({
        principal: admin,
        method: 'DELETE',
        params: { id: template.id },
        headers: { 'If-Match': etag },
      }),
      context(),
    );
    expect(response.status).toBe(204);
  });
});

describe.each<[string, typeof listTemplates, Role]>([
  ['GET /api/templates', listTemplates, 'inspector'],
  ['POST /api/templates', createTemplate, 'admin'],
  ['POST /api/templates/import', importTemplate, 'admin'],
  ['GET /api/templates/{id}', getTemplate, 'admin'],
  ['PUT /api/templates/{id}', saveTemplate, 'admin'],
  ['DELETE /api/templates/{id}', deleteTemplate, 'admin'],
])('%s access', (_name, handler, role) => {
  it('401 without a client principal', async () => {
    expect((await handler(request({ params: { id: newId() } }), context())).status).toBe(401);
  });

  it(`403 without the ${role} role`, async () => {
    const roles = role === 'admin' ? ['inspector'] : [];
    const req = request({ principal: principal('x@modig.se', roles), params: { id: newId() } });
    expect((await handler(req, context())).status).toBe(403);
  });
});

describe('GET /api/templates', () => {
  it('is empty when there are no templates', async () => {
    const response = await listTemplates(request({ principal: inspector }), context());
    expect(response).toMatchObject({ status: 200, jsonBody: [] });
  });

  it('summarises every template, sorted by name', async () => {
    // Published as revision 2, draft unchanged since; the stored draft revision is stale.
    const mg = draftTemplate({ revision: 9 });
    await storeTemplate(mg, [1, 2]);
    // Published once, then edited.
    const mt = draftTemplate({ name: 'Final inspection – RigiMill MT', modelCode: 'RMMT' });
    await storeTemplate(mt, [1]);
    await storeTemplate({ ...mt, sections: [] });
    // Never published.
    const im = draftTemplate({ name: 'Final inspection – IM8', modelCode: 'IM', sections: [] });
    await storeTemplate(im);

    const response = await listTemplates(request({ principal: inspector }), context());
    expect(response.status).toBe(200);
    expect(TemplateListSchema.parse(response.jsonBody)).toEqual([
      {
        id: im.id,
        name: 'Final inspection – IM8',
        modelCode: 'IM',
        publishedRevision: null,
        publishedName: null,
        publishedModelCode: null,
        draftRevision: 1,
        hasUnpublishedChanges: true,
        itemCount: 0,
        updatedAt: im.updatedAt,
        updatedBy: im.updatedBy,
      },
      expect.objectContaining({
        id: mg.id,
        publishedRevision: 2,
        publishedName: mg.name,
        publishedModelCode: 'RMMG',
        draftRevision: 3,
        hasUnpublishedChanges: false,
        itemCount: 3,
      }),
      expect.objectContaining({
        id: mt.id,
        publishedRevision: 1,
        draftRevision: 2,
        hasUnpublishedChanges: true,
        itemCount: 0,
      }),
    ]);
  });

  it('leaves out a folder with revisions but no draft (an interrupted seed import)', async () => {
    const orphan = draftTemplate();
    await storeTemplate(orphan, [1]);
    await containerClient(CONTAINERS.templates).deleteBlob(blobNames.templateDraft(orphan.id));

    const response = await listTemplates(request({ principal: inspector }), context());
    expect(response.jsonBody).toEqual([]);
  });
});

describe('POST /api/templates', () => {
  it('creates an empty draft at revision 1 and answers 201 with its ETag', async () => {
    const response = await create({ name: '  Final inspection – IM8 ', modelCode: 'IM' });
    expect(response.status).toBe(201);
    const { draft, revisions, hasUnpublishedChanges } = TemplateDetailSchema.parse(
      response.jsonBody,
    );
    expect(draft).toEqual({
      id: expect.any(String),
      name: 'Final inspection – IM8',
      modelCode: 'IM',
      revision: 1,
      status: 'draft',
      printSettings: { spareRowsPerSection: 3 },
      sections: [],
      updatedAt: expect.any(String),
      updatedBy: 'boss@modig.se',
    });
    expect(revisions).toEqual([]);
    expect(hasUnpublishedChanges).toBe(true);

    const stored = await storedDraft(draft.id);
    expect(stored).toEqual({ data: draft, etag: etagOf(response) });
  });

  it.each([
    ['no name', { modelCode: 'IM' }],
    ['a blank name', { name: '   ', modelCode: 'IM' }],
    ['a malformed model code', { name: 'X', modelCode: 'RM MG' }],
  ])('400 for %s', async (_case, body) => {
    const response = await create(body);
    expect(response.status).toBe(400);
    expect(errorOf(response).error).toBe('bad_request');
  });

  it('400 for a body that is not JSON', async () => {
    const req = request({ principal: admin, method: 'POST', body: '{"name":' });
    expect((await createTemplate(req, context())).status).toBe(400);
  });

  it('400 for a model that is not in the settings', async () => {
    const response = await create({ name: 'Final inspection – HHV3', modelCode: 'HHVSingle' });
    expect(response.status).toBe(400);
    expect(errorOf(response).message).toBe('Unknown machine model "HHVSingle".');
  });

  it('409 when another template already uses the model (one template per model)', async () => {
    await storeTemplate(draftTemplate({ modelCode: 'RMMG' }), [1]);
    const response = await create({ name: 'Another RigiMill MG', modelCode: 'RMMG' });
    expect(response.status).toBe(409);
    // The model's name, as the editor shows it, not its code.
    expect(errorOf(response)).toEqual({
      error: 'conflict',
      message:
        '"Final inspection – RigiMill MG" is already the template for RigiMill MG: ' +
        'there is one template per machine model.',
    });
  });

  describe('with a new machine model', () => {
    const newModel = { code: 'HMC800', name: 'HMC 800' };

    it('adds the model to the settings, then creates the template for it', async () => {
      const response = await create({
        name: 'Final inspection – HMC 800',
        modelCode: 'HMC800',
        newModel,
      });
      expect(response.status).toBe(201);
      const { draft } = TemplateDetailSchema.parse(response.jsonBody);
      expect(draft).toMatchObject({ modelCode: 'HMC800', revision: 1, sections: [] });
      expect(await storedDraft(draft.id)).toMatchObject({ data: draft });
      const settings = await loadSettings();
      expect(settings?.machineModels).toEqual([...MODELS, newModel]);
      expect(settings?.updatedBy).toBe('boss@modig.se');
    });

    it.each([
      [
        'its code',
        { code: 'rmmg', name: 'RigiMill MG 2' },
        'RMMG is already the code of RigiMill MG.',
      ],
      [
        'its name',
        { code: 'IM9', name: 'im8' },
        'There is already a machine model called IM8 (IM).',
      ],
    ])('409 when the settings already have %s, changing nothing', async (_case, model, message) => {
      const response = await create({ name: 'X', modelCode: model.code, newModel: model });
      expect(response.status).toBe(409);
      expect(errorOf(response)).toEqual({ error: 'conflict', message });
      expect((await loadSettings())?.machineModels).toEqual(MODELS);
      expect(
        TemplateListSchema.parse(
          (await listTemplates(request({ principal: admin }), context())).jsonBody,
        ),
      ).toEqual([]);
    });

    it('409 when a template already uses the code, though the settings do not have it', async () => {
      await storeTemplate(draftTemplate({ name: 'Old HMC', modelCode: 'HMC800' }));
      const response = await create({ name: 'X', modelCode: 'HMC800', newModel });
      expect(response.status).toBe(409);
      expect(errorOf(response).message).toBe('"Old HMC" already uses the model code HMC800.');
      expect((await loadSettings())?.machineModels).toEqual(MODELS);
    });

    it("400 when the new model's code is not the template's", async () => {
      const response = await create({ name: 'X', modelCode: 'IM', newModel });
      expect(response.status).toBe(400);
      expect((await loadSettings())?.machineModels).toEqual(MODELS);
    });

    it('409 before the seed has created the settings', async () => {
      await resetStorage();
      const response = await create({ name: 'X', modelCode: 'HMC800', newModel });
      expect(response.status).toBe(409);
      expect(errorOf(response).message).toMatch(/run the seed/);
    });
  });
});

describe('POST /api/templates/import', () => {
  const EXPORTED_AT = '2026-11-04T08:00:00.000Z';

  function importFile(body: unknown, who = admin) {
    return importTemplate(
      request({ principal: who, method: 'POST', body: JSON.stringify(body) }),
      context(),
    );
  }

  /** Stores an image blob, as an upload would. */
  async function storeImage(): Promise<string> {
    const imageId = newId();
    await containerClient(CONTAINERS.images)
      .getBlockBlobClient(blobNames.image(imageId))
      .upload('jpeg', 4);
    return imageId;
  }

  const guideImage = (imageId: string, renderedImageId?: string): GuideImage => ({
    imageId,
    annotations: [],
    ...(renderedImageId && { renderedImageId }),
    verdict: 'good',
  });

  /** An exported template from somewhere else: ids nobody here uses, one section with own spare lines. */
  function exported(overrides: Partial<Template> = {}) {
    const source = draftTemplate({ printSettings: { spareRowsPerSection: 2 }, ...overrides });
    source.sections[0] = { ...source.sections[0]!, spareRows: 5 };
    return { source, file: templateExport(source, 'RigiMill MG', EXPORTED_AT) };
  }

  it('creates an unpublished draft with the file’s checklist, ids and print settings', async () => {
    const { source, file } = exported();
    const response = await importFile({ name: ' Imported ', modelCode: 'IM', file });
    expect(response.status).toBe(201);
    const imported = ImportTemplateResponseSchema.parse(response.jsonBody);
    expect(imported).toEqual({
      draft: {
        id: expect.any(String),
        name: 'Imported',
        modelCode: 'IM',
        revision: 1,
        status: 'draft',
        printSettings: { spareRowsPerSection: 2 },
        sections: source.sections,
        updatedAt: expect.any(String),
        updatedBy: 'boss@modig.se',
      },
      revisions: [],
      hasUnpublishedChanges: true,
      droppedImages: 0,
    });
    expect(imported.draft.id).not.toBe(source.id);
    expect(await storedDraft(imported.draft.id)).toEqual({
      data: imported.draft,
      etag: etagOf(response),
    });
  });

  it('gives every section and row a new id when any of them is in use, in a draft or a revision', async () => {
    const { source, file } = exported();
    // An old revision used one of the rows; the draft has moved on without it.
    const inUse = draftTemplate({ modelCode: 'RMMT', sections: [source.sections[1]!] });
    await storeTemplate(inUse, [1]);
    await storeTemplate({ ...inUse, sections: [] });

    const response = await importFile({ name: 'Copy', modelCode: 'IM', file });
    expect(response.status).toBe(201);
    const { draft } = ImportTemplateResponseSchema.parse(response.jsonBody);
    const ids = checklistIds(draft.sections);
    expect(ids).toHaveLength(5);
    expect(ids.filter((id) => checklistIds(source.sections).includes(id))).toEqual([]);
    // Only the ids change.
    const stripped = (sections: Template['sections']) =>
      sections.map(({ id: _s, items, ...section }) => ({
        ...section,
        items: items.map(({ id: _i, ...item }) => item),
      }));
    expect(stripped(draft.sections)).toEqual(stripped(source.sections));
  });

  it('keeps the images stored here and leaves out the others, counting them', async () => {
    const [cover, photo, marked] = [await storeImage(), await storeImage(), await storeImage()];
    const missing = newId();
    const { source } = exported({ coverImageId: cover });
    const [section, other] = source.sections;
    const [first, second] = section!.items;
    const sections = [
      {
        ...section!,
        items: [
          { ...first!, guide: { images: [guideImage(photo, marked), guideImage(missing)] } },
          { ...second!, guide: { images: [guideImage(photo, newId())] } },
        ],
      },
      other!,
    ];
    const file = templateExport({ ...source, sections }, undefined, EXPORTED_AT);

    const kept = ImportTemplateResponseSchema.parse(
      (await importFile({ name: 'Here', modelCode: 'IM', file })).jsonBody,
    );
    expect(kept.droppedImages).toBe(2);
    expect(kept.draft.coverImageId).toBe(cover);
    expect(kept.draft.sections[0]!.items.map((item) => item.guide)).toEqual([
      { images: [guideImage(photo, marked)] },
      { images: [guideImage(photo)] },
    ]);

    // From another installation, whose cover photo doesn't exist here.
    const elsewhere = templateExport({ ...source, coverImageId: newId() }, undefined, EXPORTED_AT);
    const bare = ImportTemplateResponseSchema.parse(
      (await importFile({ name: 'Elsewhere', modelCode: 'RMMT', file: elsewhere })).jsonBody,
    );
    expect(bare.droppedImages).toBe(1);
    expect(bare.draft.coverImageId).toBeUndefined();
    expect(await storedDraft(bare.draft.id)).toMatchObject({ data: bare.draft });
  });

  it('adds a new machine model to the settings', async () => {
    const { file } = exported();
    const newModel = { code: 'HMC800', name: 'HMC 800' };
    const response = await importFile({ name: 'HMC', modelCode: 'HMC800', newModel, file });
    expect(response.status).toBe(201);
    expect((await loadSettings())?.machineModels).toEqual([...MODELS, newModel]);
  });

  it.each([
    ['not a template file', (file: object) => ({ ...file, format: 'something-else' })],
    ['a newer file version', (file: object) => ({ ...file, version: 2 })],
    [
      'a template without a checklist',
      (file: { template: object }) => ({
        ...file,
        template: { ...file.template, sections: undefined },
      }),
    ],
  ])('400 for %s', async (_case, change) => {
    const { file } = exported();
    const response = await importFile({ name: 'X', modelCode: 'IM', file: change(file) });
    expect(response.status).toBe(400);
    expect(errorOf(response).error).toBe('bad_request');
  });

  it('400 for a file whose sections or rows share ids, writing nothing', async () => {
    const { source } = exported();
    const [one, two] = source.sections;
    const file = templateExport(
      { ...source, sections: [one!, { ...two!, items: [one!.items[0]!] }] },
      undefined,
      EXPORTED_AT,
    );
    const response = await importFile({ name: 'X', modelCode: 'IM', file });
    expect(response.status).toBe(400);
    expect(errorOf(response).message).toMatch(/needs its own id/);
    expect((await listTemplates(request({ principal: admin }), context())).jsonBody).toEqual([]);
  });

  it('checks the model like creating a template, adding no model when refused', async () => {
    await storeTemplate(draftTemplate({ modelCode: 'RMMG' }));
    const { file } = exported();
    expect((await importFile({ name: 'X', modelCode: 'RMMG', file })).status).toBe(409);
    expect((await importFile({ name: 'X', modelCode: 'NOPE', file })).status).toBe(400);
    const taken = await importFile({
      name: 'X',
      modelCode: 'IM9',
      newModel: { code: 'IM9', name: 'IM8' },
      file,
    });
    expect(taken.status).toBe(409);
    expect((await loadSettings())?.machineModels).toEqual(MODELS);
  });
});

describe('DELETE /api/templates/{id}', () => {
  function remove(id: string, ifMatch?: string | null, who = admin) {
    return deleteTemplate(
      request({
        principal: who,
        method: 'DELETE',
        params: { id },
        headers: ifMatch ? { 'If-Match': ifMatch } : {},
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

  it('deletes the draft and every revision, and keeps inspections and images', async () => {
    const coverImageId = newId();
    await containerClient(CONTAINERS.images)
      .getBlockBlobClient(blobNames.image(coverImageId))
      .upload('jpeg', 4);
    const template = draftTemplate({ revision: 3, coverImageId });
    const etag = await storeTemplate(template, [1, 2]);
    const inspection = sampleInspection({}, { ...template, status: 'published', revision: 2 });
    await writeInspection(inspection, {});

    const response = await remove(template.id, etag);
    expect(response).toMatchObject({ status: 204 });
    expect(response.jsonBody).toBeUndefined();
    expect(await blobsOf(template.id)).toEqual([]);
    expect((await get(template.id)).status).toBe(404);
    expect((await listTemplates(request({ principal: admin }), context())).jsonBody).toEqual([]);

    const kept = await readJson(
      CONTAINERS.inspections,
      blobNames.inspection(inspection.id),
      InspectionSchema,
    );
    expect(kept?.data).toEqual(inspection);
    expect(
      await containerClient(CONTAINERS.images)
        .getBlobClient(blobNames.image(coverImageId))
        .exists(),
    ).toBe(true);
  });

  it('keeps the deviations in Insights, as they were last inspected', async () => {
    clearRevisionCache();
    const template = draftTemplate({ revision: 2 });
    const etag = await storeTemplate(template, [1]);
    const [row] = template.sections[0]!.items;
    const inspection = sampleInspection(
      { state: 'finalised', results: { [row!.id]: { status: 'NOK', severity: 'major' } } },
      { ...template, status: 'published', revision: 1 },
    );
    await writeInspection(inspection, {});
    await syncDeviations(inspection);

    expect((await remove(template.id, etag)).status).toBe(204);
    clearRevisionCache();
    const insights = await loadInsights({ includeInProgress: false }, context());
    expect(insights.inspections.finalised).toBe(1);
    expect(insights.deviations).toBe(1);
    expect(insights.bySeverity.major).toBe(1);
    expect(insights.topCheckpoints).toEqual([
      expect.objectContaining({
        itemId: row!.id,
        ref: '1.a',
        text: row!.text,
        sectionTitle: 'Loading area',
        removed: true,
        failed: 1,
        inspections: 1,
      }),
    ]);
  });

  it('400 without If-Match, and with "*"', async () => {
    const template = draftTemplate();
    await storeTemplate(template);
    for (const ifMatch of [null, '*']) {
      expect((await remove(template.id, ifMatch)).status).toBe(400);
    }
    expect(await blobsOf(template.id)).toHaveLength(1);
  });

  it('412 for an outdated ETag, deleting nothing', async () => {
    const template = draftTemplate();
    const etag = await storeTemplate(template, [1]);
    const saved = await put(template.id, { ...editable(template), name: 'Newer' }, etag);
    expect(saved.status).toBe(200);

    const response = await remove(template.id, etag);
    expect(response.status).toBe(412);
    expect(errorOf(response).error).toBe('precondition_failed');
    expect(await blobsOf(template.id)).toHaveLength(2);
  });

  it('400 for a malformed id, 404 for an unknown template', async () => {
    expect((await remove('../config', '"0x1"')).status).toBe(400);
    expect((await remove(newId(), '"0x1"')).status).toBe(404);
  });

  it('403 for an inspector', async () => {
    const template = draftTemplate();
    const etag = await storeTemplate(template);
    expect((await remove(template.id, etag, inspector)).status).toBe(403);
    expect(await blobsOf(template.id)).toHaveLength(1);
  });
});

describe('GET /api/templates/{id}', () => {
  it('returns the draft, its revision history (newest first) and its ETag', async () => {
    const template = draftTemplate({ revision: 3 });
    const etag = await storeTemplate(template, [1, 2]);

    const response = await get(template.id);
    expect(response.status).toBe(200);
    expect(etagOf(response)).toBe(etag);
    const detail = TemplateDetailSchema.parse(response.jsonBody);
    expect(detail.draft).toEqual(template);
    expect(detail.revisions).toEqual([
      {
        revision: 2,
        publishedAt: template.updatedAt,
        publishedBy: 'publisher@modig.se',
        changeNote: 'Revision 2',
      },
      {
        revision: 1,
        publishedAt: template.updatedAt,
        publishedBy: 'publisher@modig.se',
        changeNote: 'Revision 1',
      },
    ]);
    expect(detail.hasUnpublishedChanges).toBe(false);
  });

  it('normalises a stale draft revision to latest published + 1', async () => {
    const template = draftTemplate({ revision: 7, status: 'published' });
    await storeTemplate(template, [1, 2]);
    const { draft } = TemplateDetailSchema.parse((await get(template.id)).jsonBody);
    expect(draft).toMatchObject({ revision: 3, status: 'draft' });
  });

  it('400 for a malformed id, 404 for an unknown one', async () => {
    const malformed = await get('../config/settings');
    expect(malformed.status).toBe(400);
    const unknown = await get(newId());
    expect(unknown.status).toBe(404);
    expect(errorOf(unknown).error).toBe('not_found');
  });
});

describe('PUT /api/templates/{id}', () => {
  async function seeded() {
    const template = draftTemplate({ revision: 3 });
    const etag = await storeTemplate(template, [1, 2]);
    return { template, etag };
  }

  it('saves the editable fields and owns everything else', async () => {
    const { template, etag } = await seeded();
    const sections = [
      ...template.sections,
      { id: newId(), title: 'Gantry', items: [{ id: newId(), text: 'Covers - Intact' }] },
    ];
    const response = await put(
      template.id,
      {
        ...template,
        name: 'Renamed',
        sections,
        // Server-owned: all ignored.
        id: newId(),
        revision: 42,
        status: 'published',
        updatedAt: '2000-01-01T00:00:00.000Z',
        updatedBy: 'someone@else.se',
        changeNote: 'nope',
      },
      etag,
    );

    expect(response.status).toBe(200);
    const saved = SaveTemplateResponseSchema.parse(response.jsonBody);
    expect(saved.draft).toEqual({
      ...template,
      name: 'Renamed',
      sections,
      revision: 3,
      status: 'draft',
      updatedAt: expect.any(String),
      updatedBy: 'boss@modig.se',
    });
    expect(Date.now() - Date.parse(saved.draft.updatedAt)).toBeLessThan(60_000);
    expect(saved.hasUnpublishedChanges).toBe(true);

    const newEtag = etagOf(response);
    expect(newEtag).not.toBe(etag);
    expect(await storedDraft(template.id)).toEqual({ data: saved.draft, etag: newEtag });
  });

  it('reports no unpublished changes once the draft matches the latest revision', async () => {
    const { template, etag } = await seeded();
    const changed = await put(template.id, { ...editable(template), name: 'Changed' }, etag);
    const reverted = await put(template.id, editable(template), etagOf(changed));
    expect(SaveTemplateResponseSchema.parse(reverted.jsonBody).hasUnpublishedChanges).toBe(false);
  });

  it('writes the normalised revision over a stale stored one', async () => {
    const template = draftTemplate({ revision: 11 });
    const etag = await storeTemplate(template, [4]);
    const response = await put(template.id, editable(template), etag);
    expect(SaveTemplateResponseSchema.parse(response.jsonBody).draft.revision).toBe(5);
    expect((await storedDraft(template.id))?.data.revision).toBe(5);
  });

  it('removes the cover image when the editor leaves it out', async () => {
    const template = draftTemplate({ coverImageId: newId() });
    const etag = await storeTemplate(template);
    const { coverImageId: _, ...withoutCover } = editable(template);
    const response = await put(template.id, withoutCover, etag);
    expect(SaveTemplateResponseSchema.parse(response.jsonBody).draft.coverImageId).toBeUndefined();
  });

  it('400 without If-Match, and with "*"', async () => {
    const { template } = await seeded();
    for (const ifMatch of [null, '*']) {
      const response = await put(template.id, editable(template), ifMatch);
      expect(response.status).toBe(400);
      expect(errorOf(response).error).toBe('bad_request');
    }
  });

  it('412 for a stale ETag, leaving the newer save in place', async () => {
    const { template, etag } = await seeded();
    const first = await put(template.id, { ...editable(template), name: 'First' }, etag);
    expect(first.status).toBe(200);

    const stale = await put(template.id, { ...editable(template), name: 'Second' }, etag);
    expect(stale.status).toBe(412);
    expect(errorOf(stale).error).toBe('precondition_failed');
    expect((await storedDraft(template.id))?.data.name).toBe('First');
  });

  it('400 with the zod issues for an invalid body', async () => {
    const { template, etag } = await seeded();
    const response = await put(
      template.id,
      { ...editable(template), printSettings: { spareRowsPerSection: -1 } },
      etag,
    );
    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      expect.objectContaining({ path: ['printSettings', 'spareRowsPerSection'] }),
    ]);
  });

  it('400 for a guide with more images than allowed; as many as allowed are saved', async () => {
    const { template, etag } = await seeded();
    const [section] = template.sections;
    const images = Array.from({ length: MAX_GUIDE_IMAGES + 1 }, () => ({
      imageId: newId(),
      verdict: 'good' as const,
      annotations: [],
    }));
    const withGuide = (guide: { images: typeof images }) => [
      { ...section!, items: [{ ...section!.items[0]!, guide }, ...section!.items.slice(1)] },
      ...template.sections.slice(1),
    ];
    const tooMany = await put(
      template.id,
      { ...editable(template), sections: withGuide({ images }) },
      etag,
    );
    expect(tooMany.status).toBe(400);
    expect(errorOf(tooMany).details).toEqual([
      expect.objectContaining({ path: ['sections', 0, 'items', 0, 'guide', 'images'] }),
    ]);
    expect(await storedDraft(template.id)).toMatchObject({ etag });

    const allowed = withGuide({ images: images.slice(1) });
    const saved = await put(template.id, { ...editable(template), sections: allowed }, etag);
    expect(saved.status).toBe(200);
    expect(SaveTemplateResponseSchema.parse(saved.jsonBody).draft.sections).toEqual(allowed);
  });

  it('400 for a malformed row id', async () => {
    const { template, etag } = await seeded();
    const [section] = template.sections;
    const sections = [{ ...section!, items: [{ id: 'not/an/id', text: 'x' }] }];
    expect((await put(template.id, { ...editable(template), sections }, etag)).status).toBe(400);
  });

  it('400 for duplicate section ids, and for a row id used in two sections', async () => {
    const { template, etag } = await seeded();
    const [first, second] = template.sections;
    const twinSections = [first!, { ...second!, id: first!.id }];
    const twinRows = [first!, { ...second!, items: [first!.items[0]!] }];

    for (const sections of [twinSections, twinRows]) {
      const response = await put(template.id, { ...editable(template), sections }, etag);
      expect(response.status).toBe(400);
      expect(errorOf(response).message).toMatch(/needs its own id/);
    }
    expect(await storedDraft(template.id)).toMatchObject({ etag });
  });

  it('404 for an unknown template', async () => {
    const response = await put(newId(), editable(draftTemplate()), '"0x8DC1"');
    expect(response.status).toBe(404);
  });

  it('changes the model to a free one from the settings', async () => {
    const { template, etag } = await seeded();
    const response = await put(template.id, { ...editable(template), modelCode: 'IM' }, etag);
    expect(response.status).toBe(200);
    expect((await storedDraft(template.id))?.data.modelCode).toBe('IM');
  });

  it('400 when changing to a model that is not in the settings', async () => {
    const { template, etag } = await seeded();
    const response = await put(template.id, { ...editable(template), modelCode: 'NOPE' }, etag);
    expect(response.status).toBe(400);
  });

  it('409 when changing to a model another template uses', async () => {
    const { template, etag } = await seeded();
    await storeTemplate(draftTemplate({ modelCode: 'RMMT' }));
    const response = await put(template.id, { ...editable(template), modelCode: 'RMMT' }, etag);
    expect(response.status).toBe(409);
    expect((await storedDraft(template.id))?.data.modelCode).toBe('RMMG');
  });

  it('412, not a model error, for a stale save that also changes the model', async () => {
    const { template, etag } = await seeded();
    await storeTemplate(draftTemplate({ modelCode: 'RMMT' }));
    const first = await put(template.id, { ...editable(template), name: 'First' }, etag);
    const before = await storedDraft(template.id);
    expect(before?.etag).toBe(etagOf(first));

    // An outdated editor must see the conflict, whatever else is wrong with its save.
    for (const modelCode of ['RMMT', 'NOPE']) {
      const stale = await put(template.id, { ...editable(template), modelCode }, etag);
      expect(stale.status).toBe(412);
    }
    expect(await storedDraft(template.id)).toEqual(before);
  });

  it('still saves a template whose model has since been removed from the settings', async () => {
    const { template, etag } = await seeded();
    await writeSettings([{ code: 'IM', name: 'IM8' }]);
    const response = await put(template.id, { ...editable(template), name: 'Still here' }, etag);
    expect(response.status).toBe(200);
  });
});
