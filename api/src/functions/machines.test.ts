/**
 * Machines and their checks: a machine made with copies of its model's checks, each not started
 * until someone starts it; its own checklist (admins); bringing a check up to a newer template
 * revision; linking older inspections; and the machine in Insights and the deviation log.
 */
import type * as AzureFunctions from '@azure/functions';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  DeviationLogSchema,
  InsightsSchema,
  InspectionListSchema,
  InspectionSchema,
  MachineDetailSchema,
  MachineListSchema,
  MachinesFromInspectionsResultSchema,
  newId,
  QualityCheckOrderSchema,
  TemplateListSchema,
  type ApiError,
  type Inspection,
  type InspectionDraftInput,
  type MachineDetail,
  type Section,
  type Template,
} from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import {
  draftTemplate,
  resetStorage,
  sampleInspection,
  storeTemplate,
  useTestStorage,
  writeSettings,
} from '../../test/storage';
import { writeInspection } from '../lib/inspections';
import { clearRevisionCache } from '../lib/insights';
import { deviationsTable, readJson, writeJson } from '../lib/storage';
import { getDeviationLog } from './deviations';
import { getInsights } from './insights';
import { finaliseInspection, reopenInspection } from './inspection-state';
import { getInspection, listInspections, saveInspection } from './inspections';
import { linkMachine, saveChecklist, startCheck, updateToTemplate } from './machine-checks';
import {
  addMachineCheck,
  createMachine,
  deleteMachine,
  getMachine,
  listMachines,
  machinesFromInspections,
  updateMachine,
} from './machines';
import { getQualityCheckOrder, listTemplates, saveQualityCheckOrder } from './templates';

const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

const inspector = principal('sam.andersson@modig.se', ['inspector']);
const admin = principal('boss@modig.se', ['admin']);

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
const detailOf = (response: HttpResponseInit) => MachineDetailSchema.parse(response.jsonBody);

type Handler = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

function call(
  handler: Handler,
  {
    who = inspector,
    method = 'GET',
    id,
    body,
    ifMatch,
    query,
  }: {
    who?: ReturnType<typeof principal>;
    method?: string;
    id?: string;
    body?: unknown;
    ifMatch?: string;
    query?: Record<string, string>;
  } = {},
) {
  return handler(
    request({
      principal: who,
      method,
      ...(id && { params: { id } }),
      ...(body !== undefined && { body: JSON.stringify(body) }),
      ...(ifMatch && { headers: { 'If-Match': ifMatch } }),
      ...(query && { query }),
    }),
    context(),
  );
}

/** RigiMill MG: its final inspection template (published rev 1) and two quality checks. */
async function model() {
  const final = draftTemplate({ revision: 2 });
  await storeTemplate(final, [1]);
  const preStart = await qualityCheck(final, 'Pre start up');
  const frame = await qualityCheck(final, 'Frame');
  return { final, preStart, frame };
}

async function qualityCheck(parent: Template, name: string, published = [1]): Promise<Template> {
  const template: Template = {
    id: newId(),
    kind: 'quality',
    parentId: parent.id,
    name: `Quality check – ${name}`,
    modelCode: parent.modelCode,
    revision: (published.at(-1) ?? 0) + 1,
    status: 'draft',
    quality: { name, department: 'Quality' },
    sections: [
      {
        id: newId(),
        title: 'Safety features',
        items: [
          { id: newId(), text: 'Safety decals on balancing tubes', timeHours: 0.2 },
          { id: newId(), text: 'Warning signs inside the cabinet', timeHours: 0.1 },
          { id: newId(), text: 'Emergency stop works' },
        ],
      },
    ],
    updatedAt: '2026-11-05T08:00:00.000Z',
    updatedBy: 'boss@modig.se',
  };
  await storeTemplate(template, published);
  return template;
}

/** Publishes `sections` as revision `revision` of `template` (and the draft with them). */
async function publish(template: Template, revision: number, sections: Section[]) {
  const published: Template = { ...template, sections, revision, status: 'published' };
  await writeJson(
    CONTAINERS.templates,
    blobNames.templateRevision(template.id, revision),
    published,
  );
  await writeJson(CONTAINERS.templates, blobNames.templateDraft(template.id), {
    ...published,
    status: 'draft',
    revision: revision + 1,
  });
  return published;
}

async function newMachine(
  templateIds: string[],
  fields: Partial<{ machineName: string; serialNumber: string; modelCode: string }> = {},
): Promise<{ detail: MachineDetail; etag: string }> {
  const response = await call(createMachine, {
    method: 'POST',
    body: {
      machineName: 'Magellan#1',
      modelCode: 'RMMG',
      serialNumber: 'RM-2026-016',
      templateIds,
      ...fields,
    },
  });
  expect(response.status).toBe(201);
  return { detail: detailOf(response), etag: etagOf(response) };
}

async function loaded(id: string) {
  const response = await call(getInspection, { id });
  return { inspection: inspectionOf(response), etag: etagOf(response) };
}

async function start(id: string, body: object = {}) {
  const response = await call(startCheck, { method: 'POST', id, body });
  expect(response.status).toBe(200);
  return { inspection: inspectionOf(response), etag: etagOf(response) };
}

function draftOf({ front, results, extraDeviations }: Inspection): InspectionDraftInput {
  const { modelCode: _model, ...rest } = front;
  return { front: rest, results, extraDeviations };
}

async function save(inspection: Inspection, etag: string, patch: Partial<InspectionDraftInput>) {
  const response = await call(saveInspection, {
    method: 'PUT',
    id: inspection.id,
    body: { ...draftOf(inspection), ...patch },
    ifMatch: etag,
  });
  expect(response.status).toBe(200);
  return { inspection: inspectionOf(response), etag: etagOf(response) };
}

const rowIds = (inspection: Pick<Inspection, 'templateSnapshot'>) =>
  inspection.templateSnapshot.sections.flatMap((section) => section.items.map((item) => item.id));

async function tableRows(inspectionId: string) {
  const rows: Record<string, unknown>[] = [];
  for await (const entity of deviationsTable().listEntities<Record<string, unknown>>()) {
    if (entity.inspectionId === inspectionId) rows.push(entity);
  }
  return rows;
}

describe('registration', () => {
  it('registers the machine routes and the machine checks’ inspection routes', () => {
    const routes = registrations.map((args) => (args[1] as { route: string }).route);
    expect(routes).toEqual(
      expect.arrayContaining([
        'machines',
        'machines/from-inspections',
        'machines/{id}',
        'machines/{id}/checks',
        'inspections/{id}/start',
        'inspections/{id}/checklist',
        'inspections/{id}/template-update',
        'inspections/{id}/machine',
      ]),
    );
  });
});

describe('POST /api/machines', () => {
  it('makes the machine with a copy of each template ticked, not started and without a number', async () => {
    const { final, preStart } = await model();
    const { detail, etag } = await newMachine([preStart.id, final.id]);
    expect(etag).toBeTruthy();
    expect(detail.machine).toMatchObject({
      machineName: 'Magellan#1',
      modelCode: 'RMMG',
      serialNumber: 'RM-2026-016',
      createdBy: 'sam.andersson@modig.se',
    });
    // The quality check first, the final inspection last.
    expect(detail.checks.map((check) => [check.kind, check.templateId, check.state])).toEqual([
      ['quality', preStart.id, 'not_started'],
      ['final', final.id, 'not_started'],
    ]);
    for (const check of detail.checks) {
      expect(check).toMatchObject({
        number: '',
        machineRef: detail.machine.id,
        templateRevision: 1,
        latestRevision: 1,
        changes: { added: 0, removed: 0, changed: 0 },
        deviations: { open: 0, closed: 0 },
      });
    }
    const { inspection: copy } = await loaded(detail.checks[0]!.id);
    expect(copy.templateSnapshot).toEqual({
      name: 'Quality check – Pre start up',
      quality: preStart.quality,
      sections: preStart.sections,
    });
    expect(copy.front).toMatchObject({
      machineName: 'Magellan#1',
      serialNumber: 'RM-2026-016',
      modelCode: 'RMMG',
      location: '',
    });
    const { inspection: finalCopy } = await loaded(detail.checks[1]!.id);
    expect(finalCopy.front.location).toBe('Kalmar, Sweden');
  });

  it('copies the latest published revision, never the draft’s unpublished changes', async () => {
    const { preStart } = await model();
    const rev2 = await publish(preStart, 2, [
      { ...preStart.sections[0]!, items: preStart.sections[0]!.items.slice(0, 1) },
    ]);
    await writeJson(CONTAINERS.templates, blobNames.templateDraft(preStart.id), {
      ...rev2,
      status: 'draft',
      revision: 3,
      sections: [],
    });
    const { detail } = await newMachine([preStart.id]);
    expect(detail.checks[0]).toMatchObject({ templateRevision: 2, total: 1 });
  });

  it('may have no checks yet', async () => {
    const { detail } = await newMachine([]);
    expect(detail.checks).toEqual([]);
  });

  it('refuses a Machine ID another machine has (ignoring case and spaces)', async () => {
    await model();
    await newMachine([]);
    const response = await call(createMachine, {
      method: 'POST',
      body: { machineName: ' magellan#1', modelCode: 'RMMG', serialNumber: 'X', templateIds: [] },
    });
    expect(response.status).toBe(409);
    expect(errorOf(response).message).toBe(
      'There is already a machine with the Machine ID Magellan#1.',
    );
  });

  it('refuses an unknown model, a template of another model, one never published', async () => {
    const { preStart, final } = await model();
    const base = { machineName: 'M2', serialNumber: 'S', templateIds: [] as string[] };
    const unknownModel = await call(createMachine, {
      method: 'POST',
      body: { ...base, modelCode: 'NOPE' },
    });
    expect(unknownModel.status).toBe(400);
    const other = draftTemplate({ modelCode: 'IM', revision: 2 });
    await storeTemplate(other, [1]);
    const otherModel = await call(createMachine, {
      method: 'POST',
      body: { ...base, modelCode: 'RMMG', templateIds: [other.id] },
    });
    expect(otherModel.status).toBe(400);
    const draftOnly = await qualityCheck(final, 'Covers', []);
    const unpublished = await call(createMachine, {
      method: 'POST',
      body: { ...base, modelCode: 'RMMG', templateIds: [preStart.id, draftOnly.id] },
    });
    expect(unpublished.status).toBe(409);
    expect(errorOf(unpublished).message).toBe('Publish “Quality check – Covers” first.');
    const missing = await call(createMachine, {
      method: 'POST',
      body: { ...base, modelCode: 'RMMG', templateIds: [newId()] },
    });
    expect(missing.status).toBe(404);
    // Nothing was made by the refused requests.
    expect(MachineListSchema.parse((await call(listMachines)).jsonBody)).toEqual([]);
  });
});

describe('GET /api/machines and the lists', () => {
  it('lists machines with how far they have come; not-started checks are in no list', async () => {
    const { final, preStart, frame } = await model();
    const { detail } = await newMachine([preStart.id, frame.id, final.id]);
    const { inspection } = await start(detail.checks[0]!.id);
    const results = Object.fromEntries(
      rowIds(inspection).map((id, index) => [id, { status: index === 0 ? 'NOK' : 'OK' } as const]),
    );
    const saved = await save(inspection, (await loaded(inspection.id)).etag, { results });
    expect(
      (await call(finaliseInspection, { method: 'POST', id: inspection.id, ifMatch: saved.etag }))
        .status,
    ).toBe(200);

    const [summary] = MachineListSchema.parse((await call(listMachines)).jsonBody);
    expect(summary?.progress).toEqual({
      quality: { total: 2, started: 1, finalised: 1 },
      final: { total: 1, started: 0, finalised: 0 },
      deviations: { open: 1, closed: 0 },
    });
    const listed = InspectionListSchema.parse((await call(listInspections)).jsonBody);
    expect(listed.map((entry) => entry.id)).toEqual([inspection.id]);
    expect(listed[0]?.machineRef).toBe(detail.machine.id);
  });
});

describe('POST /api/inspections/{id}/start', () => {
  it('numbers it and fills in its front page from the machine', async () => {
    const { preStart, final } = await model();
    const { detail } = await newMachine([preStart.id, final.id]);
    const { inspection } = await start(detail.checks[0]!.id, {
      date: '2026-11-06',
      participants: ['Anna Andersson'],
    });
    expect(inspection).toMatchObject({
      number: `QC-${year}-0001`,
      state: 'in_progress',
      front: {
        machineName: 'Magellan#1',
        serialNumber: 'RM-2026-016',
        date: '2026-11-06',
        participants: ['Anna Andersson'],
      },
    });
    // Checked by is the person starting it unless given; the final inspection has its own series.
    const { inspection: finalCheck } = await start(detail.checks[1]!.id);
    expect(finalCheck.number).toBe(`FI-${year}-0001`);
    expect(finalCheck.front.participants).toEqual(['Sam Andersson']);
  });

  it('answers with the check as it is when it was started already', async () => {
    const { preStart } = await model();
    const { detail } = await newMachine([preStart.id]);
    const first = await start(detail.checks[0]!.id);
    const again = await start(detail.checks[0]!.id, { participants: ['Someone else'] });
    expect(again.inspection).toEqual(first.inspection);
    expect(again.etag).toBe(first.etag);
  });

  it('a check not started can’t be saved, finalised or reopened', async () => {
    const { preStart } = await model();
    const { detail } = await newMachine([preStart.id]);
    const { inspection, etag } = await loaded(detail.checks[0]!.id);
    const saved = await call(saveInspection, {
      method: 'PUT',
      id: inspection.id,
      body: draftOf(inspection),
      ifMatch: etag,
    });
    expect(saved.status).toBe(409);
    expect(errorOf(saved).message).toBe('This check is not started yet – start it first.');
    for (const [handler, who] of [
      [finaliseInspection, inspector],
      [reopenInspection, admin],
    ] as const) {
      const response = await call(handler, {
        who,
        method: 'POST',
        id: inspection.id,
        ifMatch: etag,
      });
      expect(response.status).toBe(409);
    }
    expect((await call(startCheck, { method: 'POST', id: newId(), body: {} })).status).toBe(404);
  });

  it('keeps the machine’s Machine ID and serial number whatever a save sends', async () => {
    const { preStart } = await model();
    const { detail } = await newMachine([preStart.id]);
    const { inspection, etag } = await start(detail.checks[0]!.id);
    const saved = await save(inspection, etag, {
      front: { ...draftOf(inspection).front, machineName: 'Typed', serialNumber: 'Typed' },
    });
    expect(saved.inspection.front).toMatchObject({
      machineName: 'Magellan#1',
      serialNumber: 'RM-2026-016',
    });
  });
});

describe('PUT /api/machines/{id}', () => {
  it('puts a new Machine ID and serial number on its checks that are not finalised', async () => {
    const { preStart, frame, final } = await model();
    const { detail, etag } = await newMachine([preStart.id, frame.id, final.id]);
    // One finalised, one in progress with a deviation, one not started.
    const done = await start(detail.checks[0]!.id);
    const filled = await save(done.inspection, done.etag, {
      results: Object.fromEntries(rowIds(done.inspection).map((id) => [id, { status: 'OK' }])),
    });
    await call(finaliseInspection, {
      method: 'POST',
      id: done.inspection.id,
      ifMatch: filled.etag,
    });
    const busy = await start(detail.checks[1]!.id);
    await save(busy.inspection, busy.etag, {
      results: { [rowIds(busy.inspection)[0]!]: { status: 'NOK', comment: 'Loose' } },
    });

    const response = await call(updateMachine, {
      method: 'PUT',
      id: detail.machine.id,
      body: { machineName: 'Magellan#1B', serialNumber: 'RM-2026-099' },
      ifMatch: etag,
    });
    expect(response.status).toBe(200);
    expect(detailOf(response).machine).toMatchObject({
      machineName: 'Magellan#1B',
      serialNumber: 'RM-2026-099',
    });
    expect((await loaded(done.inspection.id)).inspection.front.machineName).toBe('Magellan#1');
    expect((await loaded(busy.inspection.id)).inspection.front).toMatchObject({
      machineName: 'Magellan#1B',
      serialNumber: 'RM-2026-099',
    });
    expect((await loaded(detail.checks[2]!.id)).inspection.front.machineName).toBe('Magellan#1B');
    // The deviation rows follow the front page.
    expect(await tableRows(busy.inspection.id)).toEqual([
      expect.objectContaining({ machineName: 'Magellan#1B', serialNumber: 'RM-2026-099' }),
    ]);

    // An outdated page gets the conflict; a Machine ID in use is refused.
    const stale = await call(updateMachine, {
      method: 'PUT',
      id: detail.machine.id,
      body: { machineName: 'X', serialNumber: 'Y' },
      ifMatch: etag,
    });
    expect(stale.status).toBe(412);
    await newMachine([], { machineName: 'Magellan#2' });
    const taken = await call(updateMachine, {
      method: 'PUT',
      id: detail.machine.id,
      body: { machineName: 'MAGELLAN#2', serialNumber: 'Y' },
      ifMatch: etagOf(response),
    });
    expect(taken.status).toBe(409);
  });
});

describe('DELETE /api/machines/{id}', () => {
  it('deletes a machine and its checks while none is started; admins only', async () => {
    const { preStart } = await model();
    const { detail, etag } = await newMachine([preStart.id]);
    const byInspector = await call(deleteMachine, {
      method: 'DELETE',
      id: detail.machine.id,
      ifMatch: etag,
    });
    expect(byInspector.status).toBe(403);
    const deleted = await call(deleteMachine, {
      who: admin,
      method: 'DELETE',
      id: detail.machine.id,
      ifMatch: etag,
    });
    expect(deleted.status).toBe(204);
    expect((await call(getMachine, { id: detail.machine.id })).status).toBe(404);
    expect((await call(getInspection, { id: detail.checks[0]!.id })).status).toBe(404);
  });

  it('refuses once a check is started, and an outdated version', async () => {
    const { preStart } = await model();
    const { detail, etag } = await newMachine([preStart.id]);
    const stale = await call(deleteMachine, {
      who: admin,
      method: 'DELETE',
      id: detail.machine.id,
      ifMatch: '"0x1"',
    });
    expect(stale.status).toBe(412);
    await start(detail.checks[0]!.id);
    const refused = await call(deleteMachine, {
      who: admin,
      method: 'DELETE',
      id: detail.machine.id,
      ifMatch: etag,
    });
    expect(refused.status).toBe(409);
    expect((await call(getMachine, { id: detail.machine.id })).status).toBe(200);
  });
});

describe('POST /api/machines/{id}/checks', () => {
  it('adds a check not ticked when the machine was made, once', async () => {
    const { preStart, frame } = await model();
    const { detail } = await newMachine([preStart.id]);
    const added = await call(addMachineCheck, {
      method: 'POST',
      id: detail.machine.id,
      body: { templateId: frame.id },
    });
    expect(added.status).toBe(201);
    expect(
      detailOf(added)
        .checks.map((check) => check.templateId)
        .sort(),
    ).toEqual([preStart.id, frame.id].sort());
    const twice = await call(addMachineCheck, {
      method: 'POST',
      id: detail.machine.id,
      body: { templateId: frame.id },
    });
    expect(twice.status).toBe(409);
    expect(errorOf(twice).message).toBe('This machine already has “Quality check – Frame”.');
    const unknown = await call(addMachineCheck, {
      method: 'POST',
      id: newId(),
      body: { templateId: frame.id },
    });
    expect(unknown.status).toBe(404);
  });
});

describe('the order of a model’s quality checks', () => {
  it('is read by everyone, set by admins, and orders a machine’s checks', async () => {
    const { final, preStart, frame } = await model();
    const empty = await call(getQualityCheckOrder, { id: final.id });
    expect(empty.status).toBe(200);
    expect(empty.jsonBody).toEqual({ order: [] });
    expect(new Headers(empty.headers).get('ETag')).toBeNull();

    const order = [frame.id, preStart.id];
    const byInspector = await call(saveQualityCheckOrder, {
      method: 'PUT',
      id: final.id,
      body: { order },
    });
    expect(byInspector.status).toBe(403);
    const first = await saveQualityCheckOrder(
      request({
        principal: admin,
        params: { id: final.id },
        body: JSON.stringify({ order }),
        headers: { 'If-None-Match': '*' },
      }),
      context(),
    );
    expect(first.status).toBe(200);
    const stored = await call(getQualityCheckOrder, { id: final.id });
    expect(QualityCheckOrderSchema.parse(stored.jsonBody)).toEqual({ order });

    // Every quality check once, nothing else; over the version read.
    const missing = await call(saveQualityCheckOrder, {
      who: admin,
      method: 'PUT',
      id: final.id,
      body: { order: [frame.id] },
      ifMatch: etagOf(first),
    });
    expect(missing.status).toBe(400);
    const stale = await call(saveQualityCheckOrder, {
      who: admin,
      method: 'PUT',
      id: final.id,
      body: { order: [preStart.id, frame.id] },
      ifMatch: '"0x1"',
    });
    expect(stale.status).toBe(412);

    // The template list says each one's place; a machine's checks follow it.
    const templates = TemplateListSchema.parse((await call(listTemplates)).jsonBody);
    expect(templates.find((template) => template.id === frame.id)?.position).toBe(0);
    expect(templates.find((template) => template.id === preStart.id)?.position).toBe(1);
    const { detail } = await newMachine([preStart.id, final.id, frame.id]);
    expect(detail.checks.map((check) => check.templateId)).toEqual([
      frame.id,
      preStart.id,
      final.id,
    ]);
  });
});

describe('PUT /api/inspections/{id}/checklist', () => {
  it('changes the machine’s copy only; a removed row takes its result with it', async () => {
    const { preStart } = await model();
    const { detail } = await newMachine([preStart.id]);
    const { inspection, etag } = await start(detail.checks[0]!.id);
    const [a, b] = rowIds(inspection);
    const saved = await save(inspection, etag, {
      results: { [a!]: { status: 'NOK', comment: 'Turned inward' }, [b!]: { status: 'OK' } },
    });
    const [section] = inspection.templateSnapshot.sections;
    const sections: Section[] = [
      {
        ...section!,
        items: [
          { id: newId(), text: 'Our own row, first' },
          ...section!.items.filter((item) => item.id !== b),
        ],
      },
    ];
    const byInspector = await call(saveChecklist, {
      method: 'PUT',
      id: inspection.id,
      body: { sections },
      ifMatch: saved.etag,
    });
    expect(byInspector.status).toBe(403);
    const response = await call(saveChecklist, {
      who: admin,
      method: 'PUT',
      id: inspection.id,
      body: { sections },
      ifMatch: saved.etag,
    });
    expect(response.status).toBe(200);
    const changed = inspectionOf(response);
    expect(changed.templateSnapshot.sections).toEqual(sections);
    expect(Object.keys(changed.results)).toEqual([a]);
    // The deviation row follows the row to its new ref.
    expect(await tableRows(inspection.id)).toEqual([
      expect.objectContaining({ itemId: a, displayRef: '1.b' }),
    ]);
    // The template is untouched.
    const template = await readJson(
      CONTAINERS.templates,
      blobNames.templateRevision(preStart.id, 1),
      InspectionSchema.shape.templateSnapshot,
    );
    expect(template?.data.sections).toEqual(preStart.sections);

    const stale = await call(saveChecklist, {
      who: admin,
      method: 'PUT',
      id: inspection.id,
      body: { sections },
      ifMatch: saved.etag,
    });
    expect(stale.status).toBe(412);
  });

  it('refuses duplicate ids, inspections without a machine and finalised checks', async () => {
    const { preStart } = await model();
    const { detail } = await newMachine([preStart.id]);
    const { inspection, etag } = await loaded(detail.checks[0]!.id);
    const [section] = inspection.templateSnapshot.sections;
    const twice = await call(saveChecklist, {
      who: admin,
      method: 'PUT',
      id: inspection.id,
      body: { sections: [section, { ...section, id: newId() }] },
      ifMatch: etag,
    });
    expect(twice.status).toBe(400);
    // A check not started yet can be changed.
    const notStarted = await call(saveChecklist, {
      who: admin,
      method: 'PUT',
      id: inspection.id,
      body: { sections: [{ ...section!, title: 'Safety' }] },
      ifMatch: etag,
    });
    expect(notStarted.status).toBe(200);

    const legacy = sampleInspection();
    const legacyEtag = await writeInspection(legacy, {});
    const unlinked = await call(saveChecklist, {
      who: admin,
      method: 'PUT',
      id: legacy.id,
      body: { sections: legacy.templateSnapshot.sections },
      ifMatch: legacyEtag,
    });
    expect(unlinked.status).toBe(409);
    const done = sampleInspection({ state: 'finalised', machineRef: detail.machine.id });
    const doneEtag = await writeInspection(done, {});
    const finalised = await call(saveChecklist, {
      who: admin,
      method: 'PUT',
      id: done.id,
      body: { sections: done.templateSnapshot.sections },
      ifMatch: doneEtag,
    });
    expect(finalised.status).toBe(409);
  });
});

describe('POST /api/inspections/{id}/template-update', () => {
  /**
   * A machine whose Pre start up copy (rev 1) the machine changed: a row of its own added, the
   * second row deleted, the third reworded; the first row filled in.
   */
  async function changedCopy(template?: Template, machineName = 'Magellan#1') {
    const preStart = template ?? (await model()).preStart;
    const { detail } = await newMachine([preStart.id], { machineName });
    const started = await start(detail.checks[0]!.id);
    const [a, b, c] = preStart.sections[0]!.items;
    const own = { id: newId(), text: 'Our own row' };
    const edited = await call(saveChecklist, {
      who: admin,
      method: 'PUT',
      id: started.inspection.id,
      body: {
        sections: [
          {
            ...preStart.sections[0]!,
            items: [a, own, { ...c!, text: 'Emergency stop works (machine)' }],
          },
        ],
      },
      ifMatch: started.etag,
    });
    expect(edited.status).toBe(200);
    const filled = await save(inspectionOf(edited), etagOf(edited), {
      results: { [a!.id]: { status: 'NOK', comment: 'Turned inward' } },
    });
    return { preStart, check: filled, a: a!, b: b!, c: c!, own };
  }

  it('merges the template’s changes and keeps the machine’s own; the base moves on', async () => {
    const { preStart, check, a, b, c, own } = await changedCopy();
    const added = { id: newId(), text: 'Covers fitted' };
    await publish(preStart, 2, [
      {
        ...preStart.sections[0]!,
        items: [{ ...a, text: 'Safety decals on both balancing tubes' }, b, c, added],
      },
    ]);
    const byInspector = await call(updateToTemplate, {
      method: 'POST',
      id: check.inspection.id,
      body: { revision: 2 },
      ifMatch: check.etag,
    });
    expect(byInspector.status).toBe(403);
    const response = await call(updateToTemplate, {
      who: admin,
      method: 'POST',
      id: check.inspection.id,
      body: { revision: 2 },
      ifMatch: check.etag,
    });
    expect(response.status).toBe(200);
    const updated = inspectionOf(response);
    expect(updated.templateRevision).toBe(2);
    expect(updated.templateSnapshot.sections[0]!.items.map((item) => item.text)).toEqual([
      'Safety decals on both balancing tubes',
      own.text,
      'Emergency stop works (machine)',
      'Covers fitted',
    ]);
    expect(updated.results[a.id]).toEqual({ status: 'NOK', comment: 'Turned inward' });
    expect(await tableRows(updated.id)).toEqual([
      expect.objectContaining({
        itemId: a.id,
        checkpointText: 'Safety decals on both balancing tubes',
      }),
    ]);
    // The machine page now has nothing to update and counts its changes from rev 2.
    const page = detailOf(await call(getMachine, { id: updated.machineRef! }));
    expect(page.checks[0]).toMatchObject({
      templateRevision: 2,
      latestRevision: 2,
      changes: { added: 1, removed: 1, changed: 1 },
    });
    // Once at revision 2, updating to it again is refused.
    const again = await call(updateToTemplate, {
      who: admin,
      method: 'POST',
      id: updated.id,
      body: { revision: 2 },
      ifMatch: etagOf(response),
    });
    expect(again.status).toBe(409);
  });

  it('keeps the machine’s wording unless the template’s is picked, and a filled row unless removed', async () => {
    const first = await changedCopy();
    const second = await changedCopy(first.preStart, 'Magellan#2');
    const { preStart, a, b, c } = first;
    // The template rewords c (the machine reworded it too) and removes a (which has a result).
    await publish(preStart, 2, [
      { ...preStart.sections[0]!, items: [b, { ...c, text: 'Emergency stops work' }] },
    ]);
    const kept = await call(updateToTemplate, {
      who: admin,
      method: 'POST',
      id: first.check.inspection.id,
      body: { revision: 2 },
      ifMatch: first.check.etag,
    });
    expect(kept.status).toBe(200);
    const keptRows = inspectionOf(kept).templateSnapshot.sections[0]!.items;
    expect(keptRows.map((item) => item.id)).toContain(a.id);
    expect(keptRows.find((item) => item.id === c.id)?.text).toBe('Emergency stop works (machine)');
    expect(inspectionOf(kept).results[a.id]).toBeDefined();

    const chosen = await call(updateToTemplate, {
      who: admin,
      method: 'POST',
      id: second.check.inspection.id,
      body: { revision: 2, takeTemplate: [c.id], removeRows: [a.id] },
      ifMatch: second.check.etag,
    });
    expect(chosen.status).toBe(200);
    const updated = inspectionOf(chosen);
    const rows = updated.templateSnapshot.sections[0]!.items;
    expect(rows.map((item) => item.id)).not.toContain(a.id);
    expect(rows.find((item) => item.id === c.id)?.text).toBe('Emergency stops work');
    expect(updated.results).toEqual({});
    expect(await tableRows(updated.id)).toEqual([]);
  });

  it('refuses a revision that doesn’t exist, an outdated page and a finalised check', async () => {
    const { check } = await changedCopy();
    const missing = await call(updateToTemplate, {
      who: admin,
      method: 'POST',
      id: check.inspection.id,
      body: { revision: 9 },
      ifMatch: check.etag,
    });
    expect(missing.status).toBe(404);
    const stale = await call(updateToTemplate, {
      who: admin,
      method: 'POST',
      id: check.inspection.id,
      body: { revision: 2 },
      ifMatch: '"0x1"',
    });
    expect(stale.status).toBe(412);
  });
});

describe('PUT /api/inspections/{id}/machine and the one-time action', () => {
  it('links an older inspection to a machine of its model, and unlinks it', async () => {
    await model();
    const { detail } = await newMachine([], { modelCode: 'RMMG' });
    const legacy = sampleInspection({
      front: { ...sampleInspection().front, machineName: 'Old name' },
    });
    const etag = await writeInspection(legacy, {});
    const byInspector = await call(linkMachine, {
      method: 'PUT',
      id: legacy.id,
      body: { machineRef: detail.machine.id },
      ifMatch: etag,
    });
    expect(byInspector.status).toBe(403);
    const linked = await call(linkMachine, {
      who: admin,
      method: 'PUT',
      id: legacy.id,
      body: { machineRef: detail.machine.id },
      ifMatch: etag,
    });
    expect(linked.status).toBe(200);
    expect(inspectionOf(linked)).toMatchObject({
      machineRef: detail.machine.id,
      front: { machineName: 'Magellan#1', serialNumber: 'RM-2026-016' },
    });
    const unlinked = await call(linkMachine, {
      who: admin,
      method: 'PUT',
      id: legacy.id,
      body: { machineRef: null },
      ifMatch: etagOf(linked),
    });
    expect(unlinked.status).toBe(200);
    expect(inspectionOf(unlinked).machineRef).toBeUndefined();

    const otherModel = sampleInspection({
      front: { ...sampleInspection().front, modelCode: 'IM' },
    });
    const otherEtag = await writeInspection(otherModel, {});
    const refused = await call(linkMachine, {
      who: admin,
      method: 'PUT',
      id: otherModel.id,
      body: { machineRef: detail.machine.id },
      ifMatch: otherEtag,
    });
    expect(refused.status).toBe(400);
  });

  it('makes machines from existing inspections, once, and leaves what matches none', async () => {
    const front = sampleInspection().front;
    const finalised = sampleInspection({
      state: 'finalised',
      number: 'FI-2026-0001',
      front: { ...front, machineName: 'Magellan#7 ', serialNumber: 'S-OLD', date: '2026-01-01' },
    });
    const inProgress = sampleInspection({
      kind: 'quality',
      number: 'QC-2026-0001',
      front: { ...front, machineName: 'magellan#7', serialNumber: 'S-NEW', date: '2026-02-01' },
    });
    const blank = sampleInspection({
      number: 'FI-2026-0002',
      front: { ...front, machineName: '' },
    });
    for (const inspection of [finalised, inProgress, blank]) await writeInspection(inspection, {});

    expect((await call(machinesFromInspections, { method: 'POST' })).status).toBe(403);
    const response = await call(machinesFromInspections, { who: admin, method: 'POST' });
    expect(response.status).toBe(200);
    expect(MachinesFromInspectionsResultSchema.parse(response.jsonBody)).toEqual({
      created: 1,
      linked: 2,
      unmatched: 1,
    });
    const [machine] = MachineListSchema.parse((await call(listMachines)).jsonBody);
    expect(machine).toMatchObject({
      machineName: 'magellan#7',
      serialNumber: 'S-NEW',
      modelCode: 'RMMG',
    });
    // The finalised one keeps its front page; the one in progress takes the machine's.
    expect((await loaded(finalised.id)).inspection).toMatchObject({
      machineRef: machine!.id,
      front: { machineName: 'Magellan#7 ', serialNumber: 'S-OLD' },
    });
    expect((await loaded(inProgress.id)).inspection).toMatchObject({
      machineRef: machine!.id,
      front: { machineName: 'magellan#7', serialNumber: 'S-NEW' },
    });
    expect((await loaded(blank.id)).inspection.machineRef).toBeUndefined();

    const again = await call(machinesFromInspections, { who: admin, method: 'POST' });
    expect(again.jsonBody).toEqual({ created: 0, linked: 0, unmatched: 1 });
  });
});

describe('the machine in Insights and the deviation log', () => {
  it('filters Insights by machine and names the machine in the log', async () => {
    const { final } = await model();
    const { detail: one } = await newMachine([final.id]);
    const { detail: two } = await newMachine([final.id], { machineName: 'Magellan#2' });
    for (const detail of [one, two]) {
      const { inspection, etag } = await start(detail.checks[0]!.id);
      const results = Object.fromEntries(
        rowIds(inspection).map((id, index) => [
          id,
          { status: index === 0 ? 'NOK' : 'OK' } as const,
        ]),
      );
      const saved = await save(inspection, etag, { results });
      await call(finaliseInspection, { method: 'POST', id: inspection.id, ifMatch: saved.etag });
    }
    // An older inspection without a machine counts without the filter only.
    const legacy = sampleInspection({ state: 'finalised', number: 'FI-2026-0099' });
    await writeInspection(legacy, {});

    const all = InsightsSchema.parse((await call(getInsights, { who: admin })).jsonBody);
    expect(all.inspections.finalised).toBe(3);
    expect(all.machines.map((machine) => machine.machineName)).toEqual([
      'Magellan#1',
      'Magellan#2',
    ]);
    const onlyOne = InsightsSchema.parse(
      (await call(getInsights, { who: admin, query: { machine: one.machine.id } })).jsonBody,
    );
    expect(onlyOne.inspections.finalised).toBe(1);
    expect(onlyOne.deviations).toBe(1);

    const log = DeviationLogSchema.parse(
      (await call(getDeviationLog, { query: { status: 'all' } })).jsonBody,
    );
    expect(log.entries.map((entry) => entry.machineRef).sort()).toEqual(
      [one.machine.id, two.machine.id].sort(),
    );
    expect(log.machines.map((machine) => machine.machineName).sort()).toEqual([
      'Magellan#1',
      'Magellan#2',
    ]);
  });
});
