import type * as AzureFunctions from '@azure/functions';
import type { HttpHandler, HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  InspectionListSchema,
  InspectionSchema,
  MAX_PHOTOS_PER_DEVIATION,
  newId,
  snapshotTemplate,
  TemplateDetailSchema,
  TemplateListSchema,
  type ApiError,
  type Inspection,
  type InspectionDraftInput,
  type Template,
} from '@modig/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import {
  draftTemplate,
  resetStorage,
  storeTemplate,
  useTestStorage,
  writeSettings,
} from '../../test/storage';
import type * as Deviations from '../lib/deviations';
import type * as Storage from '../lib/storage';
import { deviationsTable, readJson, writeJson } from '../lib/storage';
import { createInspection, getInspection, listInspections, saveInspection } from './inspections';
import { publishTemplate } from './template-revisions';
import { getTemplate, listTemplates, saveTemplate } from './templates';

// Record the registrations instead of letting the package (in "test mode") warn about them.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

const hooks = vi.hoisted(() => ({
  /** Makes the deviation table fail. */
  failSync: false,
  /** Runs once, just before the next blob write, the way a concurrent save could. */
  beforeWrite: undefined as (() => Promise<void>) | undefined,
  /** Runs once, just before the next deviation sync, the way a slow table could. */
  beforeSync: undefined as (() => Promise<void>) | undefined,
}));
vi.mock('../lib/deviations', async (importOriginal) => {
  const actual = await importOriginal<typeof Deviations>();
  return {
    ...actual,
    syncDeviations: async (...args: Parameters<typeof actual.syncDeviations>) => {
      if (hooks.failSync) throw new Error('Table storage is down');
      const hook = hooks.beforeSync;
      hooks.beforeSync = undefined;
      await hook?.();
      return actual.syncDeviations(...args);
    },
  };
});
vi.mock('../lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof Storage>();
  return {
    ...actual,
    writeJson: async (...args: Parameters<typeof actual.writeJson>) => {
      const hook = hooks.beforeWrite;
      hooks.beforeWrite = undefined; // once, and not for the hook's own writes
      await hook?.();
      return actual.writeJson(...args);
    },
  };
});

const inspector = principal('Sam.Andersson@modig.se', ['inspector']);
const admin = principal('boss@modig.se', ['admin']);

/** The current year in Sweden, which numbers inspections. */
const year = new Date().toLocaleString('en', { timeZone: 'Europe/Stockholm', year: 'numeric' });

beforeAll(useTestStorage);
beforeEach(async () => {
  await resetStorage();
  await writeSettings();
});
afterEach(() => {
  hooks.failSync = false;
  hooks.beforeWrite = undefined;
  hooks.beforeSync = undefined;
});

/** Holds the next deviation sync until `release()`; `reached` resolves once it is waiting. */
function holdNextSync(): { reached: Promise<void>; release: () => void } {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let arrive!: () => void;
  const reached = new Promise<void>((resolve) => (arrive = resolve));
  hooks.beforeSync = async () => {
    arrive();
    await released;
  };
  return { reached, release };
}

const etagOf = (response: HttpResponseInit) => new Headers(response.headers).get('ETag');
const errorOf = (response: HttpResponseInit): ApiError => ApiErrorSchema.parse(response.jsonBody);
const inspectionOf = (response: HttpResponseInit) => InspectionSchema.parse(response.jsonBody);

async function stored(id: string) {
  return readJson(CONTAINERS.inspections, blobNames.inspection(id), InspectionSchema);
}

/** RigiMill MG published as revisions 1 and 2 (the draft equals revision 2), with a cover. */
async function publishedTemplate(overrides: Partial<Template> = {}): Promise<Template> {
  const template = draftTemplate({ revision: 3, coverImageId: newId(), ...overrides });
  await storeTemplate(template, [1, 2]);
  return template;
}

const front = {
  machineName: '  RigiMill MG #7 ',
  serialNumber: ' SN-1007',
  participants: ['Sam Andersson', 'Kim Berg'],
  location: 'Kalmar, Sweden',
  date: '2026-10-07',
};

function create(body: unknown, who = inspector) {
  return createInspection(
    request({ principal: who, method: 'POST', body: JSON.stringify(body) }),
    context(),
  );
}

async function created(template: Template): Promise<{ inspection: Inspection; etag: string }> {
  const response = await create({ templateId: template.id, front });
  expect(response.status).toBe(201);
  return { inspection: inspectionOf(response), etag: etagOf(response)! };
}

function get(id: string, who = inspector) {
  return getInspection(request({ principal: who, params: { id } }), context());
}

function put(id: string, body: unknown, ifMatch: string | null, ctx = context(), who = inspector) {
  return saveInspection(
    request({
      principal: who,
      params: { id },
      body: JSON.stringify(body),
      headers: ifMatch ? { 'If-Match': ifMatch } : {},
    }),
    ctx,
  );
}

/** What the inspection page sends: the client-owned fields. */
function draftOf({ front: { modelCode: _, ...rest }, results, extraDeviations }: Inspection) {
  return { front: rest, results, extraDeviations } satisfies InspectionDraftInput;
}

function itemIds(inspection: Inspection): string[] {
  return inspection.templateSnapshot.sections.flatMap((s) => s.items.map((item) => item.id));
}

async function deviationRowKeys(): Promise<string[]> {
  const keys: string[] = [];
  for await (const entity of deviationsTable().listEntities()) keys.push(entity.rowKey!);
  return keys.sort();
}

describe('registration', () => {
  const registered = (name: string) => {
    const found = registrations.find(([registeredName]) => registeredName === name);
    return found?.[1] as { methods: string[]; route: string; handler: HttpHandler } | undefined;
  };

  it('registers one function per route, methods combined, SWA doing authentication', () => {
    expect(registered('inspections')).toEqual({
      methods: ['GET', 'POST'],
      authLevel: 'anonymous',
      route: 'inspections',
      handler: expect.any(Function),
    });
    expect(registered('inspection')).toEqual({
      methods: ['GET', 'PUT'],
      authLevel: 'anonymous',
      route: 'inspections/{id}',
      handler: expect.any(Function),
    });
  });

  it('dispatches by method', async () => {
    const template = await publishedTemplate();
    const list = registered('inspections')!.handler;
    const one = registered('inspection')!.handler;
    // Our handlers always answer with a plain HttpResponseInit.
    const call = async (handler: HttpHandler, method: string, body?: unknown, id = newId()) =>
      (await handler(
        request({
          principal: inspector,
          method,
          params: { id },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        context(),
      )) as HttpResponseInit;

    const createdResponse = await call(list, 'POST', { templateId: template.id, front });
    expect(createdResponse.status).toBe(201);
    const { id } = inspectionOf(createdResponse);
    expect((await call(list, 'GET')).jsonBody).toHaveLength(1);
    expect((await call(one, 'GET', undefined, id)).status).toBe(200);
    // PUT without If-Match: proof that it reached the save handler.
    expect(errorOf(await call(one, 'PUT', {}, id)).message).toBe(
      'The If-Match header is required.',
    );
  });
});

describe.each([
  ['GET /api/inspections', listInspections],
  ['POST /api/inspections', createInspection],
  ['GET /api/inspections/{id}', getInspection],
  ['PUT /api/inspections/{id}', saveInspection],
])('%s access', (_name, handler) => {
  it('401 without a client principal', async () => {
    expect((await handler(request({ params: { id: newId() } }), context())).status).toBe(401);
  });

  it('403 without an app role', async () => {
    const req = request({ principal: principal('x@modig.se', []), params: { id: newId() } });
    expect((await handler(req, context())).status).toBe(403);
  });
});

describe('POST /api/inspections', () => {
  it("freezes a copy of the latest published revision and takes the template's cover", async () => {
    const template = await publishedTemplate();
    const response = await create({ templateId: template.id, front });
    expect(response.status).toBe(201);

    const inspection = inspectionOf(response);
    expect(inspection).toEqual({
      id: expect.any(String),
      number: `FI-${year}-0001`,
      templateId: template.id,
      templateRevision: 2,
      templateSnapshot: {
        name: template.name,
        sections: template.sections,
        printSettings: template.printSettings,
      },
      front: {
        machineName: 'RigiMill MG #7',
        modelCode: 'RMMG',
        serialNumber: 'SN-1007',
        participants: ['Sam Andersson', 'Kim Berg'],
        location: 'Kalmar, Sweden',
        date: '2026-10-07',
        photoId: template.coverImageId,
      },
      results: {},
      extraDeviations: [],
      state: 'in_progress',
      createdAt: expect.any(String),
      createdBy: 'sam.andersson@modig.se',
      updatedAt: expect.any(String),
      updatedBy: 'sam.andersson@modig.se',
    });
    expect(inspection.updatedAt).toBe(inspection.createdAt);
    expect(Date.now() - Date.parse(inspection.createdAt)).toBeLessThan(60_000);
    expect(await stored(inspection.id)).toEqual({ data: inspection, etag: etagOf(response) });
  });

  it('keeps its own photo, and the model from the template whatever is sent', async () => {
    const template = await publishedTemplate();
    const photoId = newId();
    const response = await create({
      templateId: template.id,
      front: { ...front, photoId, modelCode: 'IM' },
    });
    expect(inspectionOf(response).front).toMatchObject({ photoId, modelCode: 'RMMG' });
  });

  it('has no photo when neither the request nor the template has one', async () => {
    const template = await publishedTemplate({ coverImageId: undefined });
    const { inspection } = await created(template);
    expect(inspection.front.photoId).toBeUndefined();
  });

  it('copies the model and name the template list shows for it, not the draft’s', async () => {
    const template = await publishedTemplate();
    // An admin moves the draft to another model without publishing.
    await storeTemplate({ ...template, modelCode: 'RMMT', name: 'Final inspection – RigiMill MT' });
    const list = TemplateListSchema.parse(
      (await listTemplates(request({ principal: inspector }), context())).jsonBody,
    );
    expect(list).toEqual([
      expect.objectContaining({
        id: template.id,
        modelCode: 'RMMT',
        publishedRevision: 2,
        publishedName: template.name,
        publishedModelCode: 'RMMG',
      }),
    ]);
    const { inspection } = await created(template);
    expect(inspection.front.modelCode).toBe('RMMG');
    expect(inspection.templateSnapshot.name).toBe(template.name);
  });

  it('uses the latest published revision, not the draft', async () => {
    const template = await publishedTemplate();
    const draft = { ...template, name: 'Unpublished name', sections: [] };
    await storeTemplate(draft);
    const { inspection } = await created(template);
    expect(inspection.templateRevision).toBe(2);
    expect(inspection.templateSnapshot.name).toBe(template.name);
    expect(itemIds(inspection)).toHaveLength(3);
  });

  it('numbers inspections one after another', async () => {
    const template = await publishedTemplate();
    const numbers = [];
    for (let i = 0; i < 3; i++) numbers.push((await created(template)).inspection.number);
    expect(numbers).toEqual([`FI-${year}-0001`, `FI-${year}-0002`, `FI-${year}-0003`]);
  });

  it('starts again at 0001 in a new year', async () => {
    const template = await publishedTemplate();
    await writeJson(CONTAINERS.config, blobNames.inspectionCounter, {
      year: Number(year) - 1,
      last: 41,
    });
    expect((await created(template)).inspection.number).toBe(`FI-${year}-0001`);
  });

  it('never gives two inspections created at the same moment the same number', async () => {
    const template = await publishedTemplate();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => create({ templateId: template.id, front })),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(10).fill(201));
    const numbers = responses.map((response) => inspectionOf(response).number).sort();
    expect(numbers).toEqual(
      Array.from({ length: 10 }, (_, i) => `FI-${year}-${String(i + 1).padStart(4, '0')}`),
    );
  });

  it('404 for an unknown template, 400 for a malformed id', async () => {
    const unknown = await create({ templateId: newId(), front });
    expect(unknown.status).toBe(404);
    expect(errorOf(unknown).message).toBe('This template does not exist.');
    expect((await create({ templateId: '../x', front })).status).toBe(400);
  });

  it('409 for a template that was never published, and uses up no number', async () => {
    const template = draftTemplate();
    await storeTemplate(template);
    const response = await create({ templateId: template.id, front });
    expect(response.status).toBe(409);
    expect(errorOf(response)).toEqual({
      error: 'conflict',
      message: 'Publish the template first.',
    });
    expect((await created(await publishedTemplate({ modelCode: 'IM' }))).inspection.number).toBe(
      `FI-${year}-0001`,
    );
  });

  it.each([
    ['a blank machine name', { ...front, machineName: '  ' }],
    ['no serial number', { ...front, serialNumber: undefined }],
    ['an invalid date', { ...front, date: '7/10/2026' }],
    ['no participants list', { ...front, participants: undefined }],
  ])('400 for %s', async (_case, badFront) => {
    const template = await publishedTemplate();
    const response = await create({ templateId: template.id, front: badFront });
    expect(response.status).toBe(400);
    expect(errorOf(response).error).toBe('bad_request');
  });
});

describe('template snapshotting (brief §9)', () => {
  it('keeps the inspection as created when the template is edited and republished', async () => {
    const template = await publishedTemplate();
    const { inspection } = await created(template);

    // An admin rewords a row, adds a section and publishes revision 3.
    const detail = await getTemplate(
      request({ principal: admin, params: { id: template.id } }),
      context(),
    );
    const { draft } = TemplateDetailSchema.parse(detail.jsonBody);
    const [first, ...others] = draft.sections;
    const sections = [
      { ...first!, items: [{ ...first!.items[0]!, text: 'Reworded' }, ...first!.items.slice(1)] },
      ...others,
      { id: newId(), title: 'Gantry', items: [{ id: newId(), text: 'Covers - Intact' }] },
    ];
    const saved = await saveTemplate(
      request({
        principal: admin,
        params: { id: template.id },
        body: JSON.stringify({ ...draft, name: 'Renamed template', sections }),
        headers: { 'If-Match': etagOf(detail)! },
      }),
      context(),
    );
    expect(saved.status).toBe(200);
    const published = await publishTemplate(
      request({
        principal: admin,
        method: 'POST',
        params: { id: template.id },
        body: '{}',
        headers: { 'If-Match': etagOf(saved)! },
      }),
      context(),
    );
    expect(published.status).toBe(200);

    expect(inspectionOf(await get(inspection.id))).toEqual(inspection);
    expect(inspection.templateSnapshot).toEqual(snapshotTemplate(template));

    // New inspections get revision 3.
    const { inspection: next } = await created(template);
    expect(next).toMatchObject({ templateRevision: 3, number: `FI-${year}-0002` });
    expect(next.templateSnapshot).toMatchObject({ name: 'Renamed template', sections });
  });
});

describe('GET /api/inspections/{id}', () => {
  it('returns the inspection and its ETag', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const response = await get(inspection.id);
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual(inspection);
    expect(etagOf(response)).toBe(etag);
  });

  it('400 for a malformed id, 404 for an unknown one', async () => {
    expect((await get('../config/settings')).status).toBe(400);
    const unknown = await get(newId());
    expect(unknown.status).toBe(404);
    expect(errorOf(unknown)).toEqual({
      error: 'not_found',
      message: 'This inspection does not exist.',
    });
  });
});

describe('GET /api/inspections', () => {
  it('summarises every inspection, newest number first', async () => {
    const template = await publishedTemplate();
    const { inspection: first } = await created(template);
    const { inspection: second, etag } = await created(template);
    const [a, b] = itemIds(second);
    const saved = await put(
      second.id,
      {
        ...draftOf(second),
        front: { ...draftOf(second).front, machineName: 'Fräs Åsa', serialNumber: 'ÖÄ-1' },
        results: { [a!]: { status: 'NOK' }, [b!]: { status: 'OK' } },
      },
      etag,
    );

    const response = await listInspections(request({ principal: inspector }), context());
    expect(response.status).toBe(200);
    expect(InspectionListSchema.parse(response.jsonBody)).toEqual([
      {
        id: second.id,
        number: `FI-${year}-0002`,
        machineName: 'Fräs Åsa',
        serialNumber: 'ÖÄ-1',
        modelCode: 'RMMG',
        date: '2026-10-07',
        state: 'in_progress',
        nokCount: 1,
        filled: 2,
        total: 3,
        updatedAt: inspectionOf(saved).updatedAt,
      },
      expect.objectContaining({ id: first.id, number: `FI-${year}-0001`, filled: 0, total: 3 }),
    ]);
  });
});

describe('PUT /api/inspections/{id}', () => {
  it('saves front page, results and extra deviations, and owns everything else', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const [a, b] = itemIds(inspection);
    const extraId = newId();
    const body = {
      front: { ...draftOf(inspection).front, participants: ['Sam'], photoId: undefined },
      results: {
        [a!]: { status: 'NOK', comment: 'Blue mark missing', resp: 'Mechanics', severity: 'major' },
        [b!]: { status: 'NA' },
      },
      extraDeviations: [{ id: extraId, description: 'Scratch on door', severity: 'minor' }],
      // Server-owned: all ignored.
      id: newId(),
      number: 'FI-1999-0001',
      templateRevision: 99,
      templateSnapshot: { name: 'x', sections: [], printSettings: { spareRowsPerSection: 0 } },
      state: 'finalised',
      createdBy: 'someone@else.se',
      updatedBy: 'someone@else.se',
    };
    const response = await put(inspection.id, { ...body, modelCode: 'IM' }, etag);

    expect(response.status).toBe(200);
    const saved = inspectionOf(response);
    const { photoId: _, ...frontWithoutPhoto } = inspection.front;
    expect(saved).toEqual({
      ...inspection,
      front: { ...frontWithoutPhoto, participants: ['Sam'] },
      results: body.results,
      extraDeviations: body.extraDeviations,
      updatedAt: expect.any(String),
      updatedBy: 'sam.andersson@modig.se',
    });
    expect(saved.updatedAt > inspection.updatedAt).toBe(true);
    expect(etagOf(response)).not.toBe(etag);
    expect(await stored(inspection.id)).toEqual({ data: saved, etag: etagOf(response) });

    // The NOK row and the extra deviation are in the deviation table.
    expect(await deviationRowKeys()).toEqual(
      [`${inspection.id}_${a}`, `${inspection.id}_${extraId}`].sort(),
    );
  });

  it('removes deviation rows when their NOK is changed', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const [a] = itemIds(inspection);
    const nok = await put(
      inspection.id,
      { ...draftOf(inspection), results: { [a!]: { status: 'NOK' } } },
      etag,
    );
    expect(await deviationRowKeys()).toHaveLength(1);
    await put(
      inspection.id,
      { ...draftOf(inspection), results: { [a!]: { status: 'OK' } } },
      etagOf(nok),
    );
    expect(await deviationRowKeys()).toEqual([]);
  });

  it('still saves when the deviation table fails, and the next save catches up', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const [a] = itemIds(inspection);
    const nok = { ...draftOf(inspection), results: { [a!]: { status: 'NOK' as const } } };

    hooks.failSync = true;
    const ctx = context();
    const warn = vi.spyOn(ctx, 'warn');
    const response = await put(inspection.id, nok, etag, ctx);
    expect(response.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(
      `Saved inspection ${inspection.id}; syncing its deviations failed`,
      expect.any(Error),
    );
    expect((await stored(inspection.id))?.data.results).toEqual(nok.results);
    expect(await deviationRowKeys()).toEqual([]);

    hooks.failSync = false;
    expect((await put(inspection.id, nok, etagOf(response))).status).toBe(200);
    expect(await deviationRowKeys()).toEqual([`${inspection.id}_${a}`]);
  });

  it('leaves the deviation table alone when the save loses a race at the write', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const [a] = itemIds(inspection);
    // Someone else saves after this save's ETag check, just before its write.
    hooks.beforeWrite = async () => {
      await writeJson(CONTAINERS.inspections, blobNames.inspection(inspection.id), inspection, {
        ifMatch: etag,
      });
    };
    const response = await put(
      inspection.id,
      { ...draftOf(inspection), results: { [a!]: { status: 'NOK' } } },
      etag,
    );
    expect(response.status).toBe(412);
    expect(await deviationRowKeys()).toEqual([]);
  });

  it('never leaves a slow sync of an older save in the table', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const [a] = itemIds(inspection);
    const held = holdNextSync();
    const first = put(
      inspection.id,
      { ...draftOf(inspection), results: { [a!]: { status: 'NOK' } } },
      etag,
    );
    await held.reached; // its blob is written, its table sync is slow
    const newer = (await stored(inspection.id))!.etag;
    const second = await put(
      inspection.id,
      { ...draftOf(inspection), results: { [a!]: { status: 'OK' } } },
      newer,
    );
    expect(second.status).toBe(200);
    expect(await deviationRowKeys()).toEqual([]);

    held.release(); // the first save's sync lands last, with its NOK row
    expect((await first).status).toBe(200);
    expect(await deviationRowKeys()).toEqual([]);
  });

  it('400 without If-Match, and with "*"', async () => {
    const { inspection } = await created(await publishedTemplate());
    for (const ifMatch of [null, '*']) {
      const response = await put(inspection.id, draftOf(inspection), ifMatch);
      expect(response.status).toBe(400);
    }
  });

  it('412 for a stale ETag, leaving the newer save in place', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const first = await put(
      inspection.id,
      { ...draftOf(inspection), front: { ...draftOf(inspection).front, location: 'First' } },
      etag,
    );
    expect(first.status).toBe(200);

    const stale = await put(inspection.id, draftOf(inspection), etag);
    expect(stale.status).toBe(412);
    expect(errorOf(stale).error).toBe('precondition_failed');
    expect((await stored(inspection.id))?.data.front.location).toBe('First');
  });

  it('409 once finalised, but 412 first for an outdated page', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const finalised = { ...inspection, state: 'finalised' as const };
    const finalisedEtag = await writeJson(
      CONTAINERS.inspections,
      blobNames.inspection(inspection.id),
      finalised,
      { ifMatch: etag },
    );

    const locked = await put(inspection.id, draftOf(inspection), finalisedEtag);
    expect(locked.status).toBe(409);
    expect(errorOf(locked)).toEqual({
      error: 'conflict',
      message: 'This inspection is finalised – an admin must reopen it.',
    });
    expect((await put(inspection.id, draftOf(inspection), etag)).status).toBe(412);
    expect(await stored(inspection.id)).toEqual({ data: finalised, etag: finalisedEtag });
  });

  it('400 for results of rows that are not in this inspection', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const foreign = newId();
    const response = await put(
      inspection.id,
      {
        ...draftOf(inspection),
        results: { [itemIds(inspection)[0]!]: { status: 'OK' }, [foreign]: { status: 'OK' } },
      },
      etag,
    );
    expect(response.status).toBe(400);
    expect(errorOf(response).message).toBe(`These rows are not in this inspection: ${foreign}.`);
    expect((await stored(inspection.id))?.etag).toBe(etag);
  });

  it('400 for extra deviation ids used twice or equal to a row id', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const extra = { id: newId(), description: 'Scratch', severity: 'minor' as const };
    const rowId = itemIds(inspection)[1]!;
    for (const [extraDeviations, clash] of [
      [[extra, { ...extra, description: 'Dent' }], extra.id],
      [[{ ...extra, id: rowId }], rowId],
    ] as const) {
      const response = await put(inspection.id, { ...draftOf(inspection), extraDeviations }, etag);
      expect(response.status).toBe(400);
      expect(errorOf(response).message).toBe(`Each extra deviation needs its own id: ${clash}.`);
    }
    expect((await stored(inspection.id))?.etag).toBe(etag);
  });

  it('412 rather than an id error for an outdated page', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const saved = await put(inspection.id, draftOf(inspection), etag);
    expect(saved.status).toBe(200);
    const stale = await put(
      inspection.id,
      { ...draftOf(inspection), results: { [newId()]: { status: 'OK' } } },
      etag,
    );
    expect(stale.status).toBe(412);
  });

  it('400 with the zod issues for an invalid body', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const [a] = itemIds(inspection);
    const response = await put(
      inspection.id,
      { ...draftOf(inspection), results: { [a!]: { status: 'MAYBE' } } },
      etag,
    );
    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      expect.objectContaining({ path: ['results', a, 'status'] }),
    ]);
  });

  it('400 for a deviation with more photos than allowed, on a row or an extra one', async () => {
    const { inspection, etag } = await created(await publishedTemplate());
    const [a] = itemIds(inspection);
    const photos = Array.from({ length: MAX_PHOTOS_PER_DEVIATION + 1 }, () => ({
      imageId: newId(),
      annotations: [],
    }));
    const extra = { id: newId(), description: 'Scratch', severity: 'minor' as const };
    for (const [body, path] of [
      [{ results: { [a!]: { status: 'NOK', photos } } }, ['results', a, 'photos']],
      [{ extraDeviations: [{ ...extra, photos }] }, ['extraDeviations', 0, 'photos']],
    ] as const) {
      const response = await put(inspection.id, { ...draftOf(inspection), ...body }, etag);
      expect(response.status).toBe(400);
      expect(errorOf(response).details).toEqual([expect.objectContaining({ path })]);
    }
    expect((await stored(inspection.id))?.etag).toBe(etag);
    // Two are fine.
    const two = await put(
      inspection.id,
      { ...draftOf(inspection), extraDeviations: [{ ...extra, photos: photos.slice(1) }] },
      etag,
    );
    expect(two.status).toBe(200);
    expect(inspectionOf(two).extraDeviations[0]!.photos).toEqual(photos.slice(1));
  });

  it('404 for an unknown inspection', async () => {
    const response = await put(
      newId(),
      draftOf((await created(await publishedTemplate())).inspection),
      '"0x8DC1"',
    );
    expect(response.status).toBe(404);
  });
});
