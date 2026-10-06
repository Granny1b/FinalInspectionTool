import type * as AzureFunctions from '@azure/functions';
import type { HttpHandler, HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  newId,
  SaveTemplateResponseSchema,
  TemplateDetailSchema,
  TemplateListSchema,
  TemplateSchema,
  type ApiError,
  type Role,
  type Template,
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
import { containerClient, readJson } from '../lib/storage';
import { createTemplate, getTemplate, listTemplates, saveTemplate } from './templates';

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
        'template',
        {
          methods: ['GET', 'PUT'],
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
  });
});

describe.each<[string, typeof listTemplates, Role]>([
  ['GET /api/templates', listTemplates, 'inspector'],
  ['POST /api/templates', createTemplate, 'admin'],
  ['GET /api/templates/{id}', getTemplate, 'admin'],
  ['PUT /api/templates/{id}', saveTemplate, 'admin'],
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
        draftRevision: 1,
        hasUnpublishedChanges: true,
        itemCount: 0,
        updatedAt: im.updatedAt,
        updatedBy: im.updatedBy,
      },
      expect.objectContaining({
        id: mg.id,
        publishedRevision: 2,
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
    expect(errorOf(response)).toMatchObject({
      error: 'conflict',
      message: expect.stringContaining('one template per machine model'),
    });
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

  it('still saves a template whose model has since been removed from the settings', async () => {
    const { template, etag } = await seeded();
    await writeSettings([{ code: 'IM', name: 'IM8' }]);
    const response = await put(template.id, { ...editable(template), name: 'Still here' }, etag);
    expect(response.status).toBe(200);
  });
});
