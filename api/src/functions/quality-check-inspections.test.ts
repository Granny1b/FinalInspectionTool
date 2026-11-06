/**
 * Doing a quality check on a machine: an inspection of kind `quality`, made from a published
 * quality check through the inspection routes, numbered QC-YYYY-NNNN, and counted in Insights
 * apart from final inspections.
 */
import type * as AzureFunctions from '@azure/functions';
import type { HttpHandler, HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  InsightsDeviationsSchema,
  InsightsSchema,
  InspectionCounterSchema,
  InspectionListSchema,
  InspectionSchema,
  newId,
  type ApiError,
  type Inspection,
  type InspectionDraftInput,
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
import { clearRevisionCache } from '../lib/insights';
import { deviationsTable, readJson } from '../lib/storage';
import { exportInsightsCsv, getInsights, getInsightsDeviations } from './insights';
import { finaliseInspection, reopenInspection } from './inspection-state';
import {
  createInspection,
  deleteInspection,
  getInspection,
  listInspections,
  saveInspection,
} from './inspections';
import { deleteTemplate } from './templates';

vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: () => undefined },
}));

const inspector = principal('sam.andersson@modig.se', ['inspector']);
const admin = principal('boss@modig.se', ['admin']);

/** The current year in Sweden, which numbers inspections and quality checks. */
const year = new Date().toLocaleString('en', { timeZone: 'Europe/Stockholm', year: 'numeric' });

beforeAll(useTestStorage);
beforeEach(async () => {
  await resetStorage();
  await writeSettings();
  clearRevisionCache();
});

const etagOf = (response: HttpResponseInit) => new Headers(response.headers).get('ETag')!;
const errorOf = (response: HttpResponseInit): ApiError => ApiErrorSchema.parse(response.jsonBody);
const inspectionOf = (response: HttpResponseInit) => InspectionSchema.parse(response.jsonBody);

/** RigiMill MG's final inspection template, published as revision 1. */
async function machine(): Promise<Template> {
  const template = draftTemplate({ revision: 2 });
  await storeTemplate(template, [1]);
  return template;
}

/** "Quality check – Pre start up" of `parent`, published as revision `published` (if any). */
async function qualityCheck(
  parent: Template,
  { published = [1], name = 'Pre start up' }: { published?: number[]; name?: string } = {},
): Promise<Template> {
  const template: Template = {
    id: newId(),
    kind: 'quality',
    parentId: parent.id,
    name: `Quality check – ${name}`,
    modelCode: parent.modelCode,
    revision: (published.at(-1) ?? 0) + 1,
    status: 'draft',
    quality: {
      name,
      department: 'Quality',
    },
    sections: [
      {
        id: newId(),
        title: 'Safety features',
        items: [
          {
            id: newId(),
            text: 'Safety decals on balancing tubes',
            how: 'Visible, not turned inward.',
            references: ['ISO 12100', 'ISO 7010'],
            timeHours: 0.2,
            guide: {
              description: 'On both tubes.',
              images: [{ imageId: newId(), annotations: [], verdict: 'good' }],
            },
          },
          { id: newId(), text: 'Warning signs inside the cabinet', timeHours: 0.1 },
        ],
      },
    ],
    updatedAt: '2026-11-05T08:00:00.000Z',
    updatedBy: 'boss@modig.se',
  };
  await storeTemplate(template, published);
  return template;
}

const checkFront = {
  machineName: 'Magellan#1',
  serialNumber: 'RM-2026-016',
  participants: ['Sam Andersson'],
  date: '2026-11-06',
};
const finalFront = {
  machineName: 'RigiMill MG #7',
  serialNumber: 'SN-1007',
  participants: [],
  location: 'Kalmar, Sweden',
  date: '2026-11-06',
};

function create(body: unknown, who = inspector) {
  return createInspection(
    request({ principal: who, method: 'POST', body: JSON.stringify(body) }),
    context(),
  );
}

async function created(templateId: string, front: object = checkFront) {
  const response = await create({ templateId, front });
  expect(response.status).toBe(201);
  return { inspection: inspectionOf(response), etag: etagOf(response) };
}

function put(id: string, body: InspectionDraftInput, ifMatch: string) {
  return saveInspection(
    request({
      principal: inspector,
      params: { id },
      body: JSON.stringify(body),
      headers: { 'If-Match': ifMatch },
    }),
    context(),
  );
}

function post(handler: HttpHandler, id: string, ifMatch: string, who = inspector) {
  return handler(
    request({ principal: who, method: 'POST', params: { id }, headers: { 'If-Match': ifMatch } }),
    context(),
  );
}

function draftOf({ front, results, extraDeviations }: Inspection): InspectionDraftInput {
  const { modelCode: _model, ...rest } = front;
  return { front: rest, results, extraDeviations };
}

const itemIds = (inspection: Inspection) =>
  inspection.templateSnapshot.sections.flatMap((section) => section.items.map((item) => item.id));

/** A quality check created, every row filled (the first NOK), saved and finalised. */
async function finishedCheck(check: Template, comment = 'Turned inward') {
  const { inspection, etag } = await created(check.id);
  const [a, b] = itemIds(inspection);
  const saved = await put(
    inspection.id,
    {
      ...draftOf(inspection),
      results: {
        [a!]: { status: 'NOK', comment, severity: 'major', resp: 'Mechanical' },
        [b!]: { status: 'OK' },
      },
    },
    etag,
  );
  expect(saved.status).toBe(200);
  const finalised = await post(finaliseInspection, inspection.id, etagOf(saved));
  expect(finalised.status).toBe(200);
  return { inspection: inspectionOf(finalised), etag: etagOf(finalised) };
}

/** A final inspection of `template` with its first row NOK, finalised. */
async function finishedInspection(template: Template) {
  const { inspection, etag } = await created(template.id, finalFront);
  const results = Object.fromEntries(
    itemIds(inspection).map((id, index) => [id, { status: index === 0 ? 'NOK' : 'OK' } as const]),
  );
  const saved = await put(inspection.id, { ...draftOf(inspection), results }, etag);
  const finalised = await post(finaliseInspection, inspection.id, etagOf(saved));
  expect(finalised.status).toBe(200);
  return inspectionOf(finalised);
}

async function tableRows(inspectionId: string) {
  const rows: Record<string, unknown>[] = [];
  for await (const entity of deviationsTable().listEntities<Record<string, unknown>>()) {
    if (entity.inspectionId === inspectionId) rows.push(entity);
  }
  return rows;
}

describe('POST /api/inspections from a quality check', () => {
  it('starts a quality check: kind quality, a QC number and a frozen copy of the check', async () => {
    const parent = await machine();
    const check = await qualityCheck(parent, { published: [1, 2] });
    const response = await create({ templateId: check.id, front: checkFront });
    expect(response.status).toBe(201);
    const inspection = inspectionOf(response);
    expect(inspection).toMatchObject({
      kind: 'quality',
      number: `QC-${year}-0001`,
      templateId: check.id,
      templateRevision: 2,
      front: {
        machineName: 'Magellan#1',
        modelCode: 'RMMG',
        serialNumber: 'RM-2026-016',
        participants: ['Sam Andersson'],
        location: '',
        date: '2026-11-06',
      },
      results: {},
      extraDeviations: [],
      state: 'in_progress',
    });
    // No machine photo: a quality check has none, whatever the template has.
    expect(inspection.front.photoId).toBeUndefined();
    // The check as published: its front page and every row's how, references, time and pictures.
    expect(inspection.templateSnapshot).toEqual({
      name: 'Quality check – Pre start up',
      quality: check.quality,
      sections: check.sections,
    });
    const stored = await readJson(
      CONTAINERS.inspections,
      blobNames.inspection(inspection.id),
      InspectionSchema,
    );
    expect(stored?.data).toEqual(inspection);
  });

  it('numbers quality checks and final inspections in two series of their own', async () => {
    const parent = await machine();
    const check = await qualityCheck(parent);
    const numbers = [
      (await created(check.id)).inspection.number,
      (await created(parent.id, finalFront)).inspection.number,
      (await created(check.id)).inspection.number,
      (await created(parent.id, finalFront)).inspection.number,
    ];
    expect(numbers).toEqual([
      `QC-${year}-0001`,
      `FI-${year}-0001`,
      `QC-${year}-0002`,
      `FI-${year}-0002`,
    ]);
    const counter = async (name: string) =>
      (await readJson(CONTAINERS.config, name, InspectionCounterSchema))?.data;
    expect(await counter(blobNames.qualityCheckCounter)).toEqual({ year: Number(year), last: 2 });
    expect(await counter(blobNames.inspectionCounter)).toEqual({ year: Number(year), last: 2 });
  });

  it('gives two quality checks started at once different numbers', async () => {
    const check = await qualityCheck(await machine());
    const numbers = await Promise.all(
      Array.from({ length: 4 }, async () => (await created(check.id)).inspection.number),
    );
    expect(new Set(numbers).size).toBe(4);
    expect(numbers.every((number) => number.startsWith(`QC-${year}-`))).toBe(true);
  });

  it('refuses a quality check that was never published, without taking a number', async () => {
    const check = await qualityCheck(await machine(), { published: [] });
    const response = await create({ templateId: check.id, front: checkFront });
    expect(response.status).toBe(409);
    expect(errorOf(response).message).toBe('Publish the quality check first.');
    expect(
      await readJson(CONTAINERS.config, blobNames.qualityCheckCounter, InspectionCounterSchema),
    ).toBeNull();
  });

  it('needs a Machine ID, a serial number and a date, but no location', async () => {
    const check = await qualityCheck(await machine());
    const missing = await create({
      templateId: check.id,
      front: { ...checkFront, machineName: ' ', serialNumber: ' ' },
    });
    expect(missing.status).toBe(400);
    expect(errorOf(missing).details).toEqual([
      expect.objectContaining({
        path: ['front', 'machineName'],
        message: 'Machine ID is required',
      }),
      expect.objectContaining({ path: ['front', 'serialNumber'] }),
    ]);
    const badDate = await create({ templateId: check.id, front: { ...checkFront, date: '' } });
    expect(badDate.status).toBe(400);
    // A final inspection's front page sent with it: what a quality check doesn't have is dropped.
    const { inspection } = await created(check.id, { ...finalFront, photoId: newId() });
    expect(inspection.front).toMatchObject({ machineName: 'RigiMill MG #7', location: '' });
    expect(inspection.front.photoId).toBeUndefined();
  });

  it('still makes a final inspection from a final inspection template', async () => {
    const parent = await machine();
    await qualityCheck(parent);
    const { inspection } = await created(parent.id, finalFront);
    expect(inspection).toMatchObject({ kind: 'final', number: `FI-${year}-0001` });
    expect('quality' in inspection.templateSnapshot).toBe(false);
    // …and a final inspection still needs its machine name.
    const response = await create({
      templateId: parent.id,
      front: { ...finalFront, machineName: '' },
    });
    expect(response.status).toBe(400);
  });
});

describe('a quality check through the inspection routes', () => {
  it('is listed with its kind and title', async () => {
    const parent = await machine();
    const check = await qualityCheck(parent);
    const { inspection: done } = await created(check.id);
    const { inspection: final } = await created(parent.id, finalFront);
    const response = await listInspections(request({ principal: inspector }), context());
    const list = InspectionListSchema.parse(response.jsonBody);
    expect(
      list.map(({ id, kind, number, templateName }) => ({ id, kind, number, templateName })),
    ).toEqual(
      expect.arrayContaining([
        {
          id: done.id,
          kind: 'quality',
          number: done.number,
          templateName: 'Quality check – Pre start up',
        },
        {
          id: final.id,
          kind: 'final',
          number: final.number,
          templateName: 'Final inspection – RigiMill MG',
        },
      ]),
    );
  });

  it('saves results and keeps its front page a quality check’s, whatever is sent', async () => {
    const check = await qualityCheck(await machine());
    const { inspection, etag } = await created(check.id);
    const [a] = itemIds(inspection);
    const response = await put(
      inspection.id,
      {
        front: {
          ...draftOf(inspection).front,
          machineName: 'Boeing#2',
          location: 'Y',
          photoId: newId(),
        },
        results: { [a!]: { status: 'NOK', comment: 'Inward', category: 'Markings & labels' } },
        extraDeviations: [{ id: newId(), description: 'Loose cover', severity: 'minor' }],
      },
      etag,
    );
    expect(response.status).toBe(200);
    const saved = inspectionOf(response);
    // The Machine ID is saved; what a quality check doesn't have is not.
    expect(saved.front).toEqual({ ...inspection.front, machineName: 'Boeing#2' });
    expect(saved.results[a!]).toEqual({
      status: 'NOK',
      comment: 'Inward',
      category: 'Markings & labels',
    });
    // Its deviations are recorded as a quality check's, with its title.
    const rows = await tableRows(inspection.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === 'quality')).toBe(true);
    expect(rows.every((row) => row.checkName === 'Quality check – Pre start up')).toBe(true);
    expect(rows.every((row) => row.machineName === 'Boeing#2')).toBe(true);
  });

  it('is finalised once every row has a status and it has a Machine ID, and reopened', async () => {
    const check = await qualityCheck(await machine());
    const { inspection, etag } = await created(check.id);
    const [a, b] = itemIds(inspection);
    // One started before quality checks had a Machine ID: it must get one before finalising.
    const older = await put(
      inspection.id,
      { ...draftOf(inspection), front: { ...draftOf(inspection).front, machineName: '' } },
      etag,
    );
    const refused = await post(finaliseInspection, inspection.id, etagOf(older));
    expect(refused.status).toBe(400);
    expect((errorOf(refused).details as { message: string }[]).map((i) => i.message)).toEqual([
      'The front page needs a Machine ID.',
      'Row 1.a has no status.',
      'Row 1.b has no status.',
    ]);

    const saved = await put(
      inspection.id,
      { ...draftOf(inspection), results: { [a!]: { status: 'OK' }, [b!]: { status: 'NA' } } },
      etagOf(older),
    );
    const finalised = await post(finaliseInspection, inspection.id, etagOf(saved));
    expect(finalised.status).toBe(200);
    expect(inspectionOf(finalised)).toMatchObject({ state: 'finalised', kind: 'quality' });

    // Locked: saves are refused in a quality check's words.
    const locked = await put(inspection.id, draftOf(inspection), etagOf(finalised));
    expect(locked.status).toBe(409);
    expect(errorOf(locked).message).toBe(
      'This quality check is finalised – an admin must reopen it.',
    );

    expect((await post(reopenInspection, inspection.id, etagOf(finalised))).status).toBe(403);
    const reopened = await post(reopenInspection, inspection.id, etagOf(finalised), admin);
    expect(reopened.status).toBe(200);
    expect(inspectionOf(reopened).state).toBe('in_progress');
  });

  it('is deleted by an admin with its deviation rows', async () => {
    const check = await qualityCheck(await machine());
    const { inspection, etag } = await finishedCheck(check);
    expect(await tableRows(inspection.id)).toHaveLength(1);
    const remove = (who: typeof admin) =>
      deleteInspection(
        request({
          principal: who,
          method: 'DELETE',
          params: { id: inspection.id },
          headers: { 'If-Match': etag },
        }),
        context(),
      );
    expect((await remove(inspector)).status).toBe(403);
    expect((await remove(admin)).status).toBe(204);
    expect(await tableRows(inspection.id)).toEqual([]);
    const gone = await getInspection(
      request({ principal: inspector, params: { id: inspection.id } }),
      context(),
    );
    expect(gone.status).toBe(404);
  });

  it('is kept, with its frozen copy, when its quality check is deleted', async () => {
    const check = await qualityCheck(await machine());
    const { inspection } = await finishedCheck(check);
    const draftEtag = await storeTemplate(check);
    const deleted = await deleteTemplate(
      request({
        principal: admin,
        method: 'DELETE',
        params: { id: check.id },
        headers: { 'If-Match': draftEtag },
      }),
      context(),
    );
    expect(deleted.status).toBe(204);
    const kept = await getInspection(
      request({ principal: inspector, params: { id: inspection.id } }),
      context(),
    );
    expect(kept.status).toBe(200);
    expect(inspectionOf(kept).templateSnapshot.quality?.name).toBe('Pre start up');
  });
});

describe('Insights, final inspections and quality checks apart', () => {
  const insights = async (query: Record<string, string> = {}) => {
    const response = await getInsights(request({ principal: admin, query }), context());
    expect(response.status).toBe(200);
    return InsightsSchema.parse(response.jsonBody);
  };

  it('never counts a quality check with final inspections, nor the other way round', async () => {
    const parent = await machine();
    await finishedInspection(parent);
    const before = await insights();
    expect(before.inspections.finalised).toBe(1);
    expect(before.deviations).toBe(1);

    const pre = await qualityCheck(parent);
    const runIn = await qualityCheck(parent, { name: 'Run in' });
    await finishedCheck(pre);
    await finishedCheck(pre, 'Scratched');
    await finishedCheck(runIn);

    // The final inspections' numbers are as they were.
    expect(await insights()).toEqual(before);

    const quality = await insights({ kind: 'quality' });
    expect(quality.inspections).toEqual({ finalised: 3, inProgress: 0 });
    expect(quality.deviations).toBe(3);
    expect(quality.rows).toEqual({ ok: 3, nok: 3, na: 0 });
    expect(quality.modelCodes).toEqual(['RMMG']);
    expect(quality.checkNames).toEqual(['Quality check – Pre start up', 'Quality check – Run in']);
    expect(quality.topCheckpoints[0]).toMatchObject({
      text: 'Safety decals on balancing tubes',
      failed: 2,
      inspections: 2,
    });

    const onePre = await insights({ kind: 'quality', check: 'Quality check – Pre start up' });
    expect(onePre.inspections.finalised).toBe(2);
    expect(onePre.deviations).toBe(2);
    expect(onePre.checkNames).toEqual(quality.checkNames);
  });

  it('exports a quality check’s rows apart, with its Machine ID and title, in a file that says so', async () => {
    const parent = await machine();
    const final = await finishedInspection(parent);
    const check = await qualityCheck(parent, { name: 'Före start' });
    const { inspection } = await finishedCheck(check);

    const csv = async (query: Record<string, string>) => {
      const response = await exportInsightsCsv(request({ principal: admin, query }), context());
      expect(response.status).toBe(200);
      return {
        lines: String(response.body)
          .replace(/^\uFEFF/, '')
          .trimEnd()
          .split('\r\n'),
        disposition: new Headers(response.headers).get('Content-Disposition'),
      };
    };
    const finals = await csv({});
    expect(finals.lines[0]).toContain(';machineName;');
    expect(finals.lines.slice(1).map((line) => line.split(';')[1])).toEqual([final.number]);
    expect(finals.disposition).toMatch(/^attachment; filename="Deviations start to /);

    const checks = await csv({ kind: 'quality', check: 'Quality check – Före start' });
    expect(checks.lines[0]).toBe(
      'inspectionId;inspectionNumber;serialNumber;machineName;checkName;modelCode;templateId;templateRevision;itemId;sectionTitle;displayRef;checkpointText;comment;resp;severity;category;inspectionDate;finalised;createdAt',
    );
    expect(checks.lines).toHaveLength(2);
    expect(checks.lines[1]).toContain(
      `${inspection.number};RM-2026-016;Magellan#1;Quality check – Före start;`,
    );
    // "ö" can't go in a header as it is: an ASCII name first, then the real one, encoded.
    expect(checks.disposition).toMatch(
      /^attachment; filename="Quality check deviations start to \d{4}-\d\d-\d\d, Fore start\.csv"; filename\*=UTF-8''Quality%20check%20deviations%20start%20to%20\d{4}-\d\d-\d\d%2C%20F%C3%B6re%20start\.csv$/,
    );

    const list = await getInsightsDeviations(
      request({ principal: admin, query: { kind: 'quality' } }),
      context(),
    );
    const { rows } = InsightsDeviationsSchema.parse(list.jsonBody);
    expect(rows.map((row) => [row.kind, row.inspectionNumber, row.checkName])).toEqual([
      ['quality', inspection.number, 'Quality check – Före start'],
    ]);
  });
});
