/**
 * The deviation log: following up a deviation (close, edit, reopen) through
 * /api/inspections/{id}/follow-ups/{key}, kept apart from the inspection and carried in the
 * deviations table; and the log itself, /api/deviations and its CSV, by kind and filters.
 */
import type * as AzureFunctions from '@azure/functions';
import type { HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  DeviationLogSchema,
  FollowUpSchema,
  FollowUpsSchema,
  newId,
  swedishDay,
  type ApiError,
  type FollowUpRequest,
  type Inspection,
  type InspectionDraftInput,
} from '@modig/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import {
  draftTemplate,
  resetStorage,
  sampleInspection,
  storePeople,
  useTestStorage,
  writeSettings,
} from '../../test/storage';
import { deviationLogFileName } from '../lib/deviationLog';
import type * as Deviations from '../lib/deviations';
import { syncDeviations } from '../lib/deviations';
import { loadInspection, writeInspection } from '../lib/inspections';
import { containerClient, deviationsTable, readJson, writeJson } from '../lib/storage';
import { exportDeviationLogCsv, getDeviationLog } from './deviations';
import { getFollowUps, setFollowUp } from './follow-ups';
import { deleteInspection, saveInspection } from './inspections';

vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: () => undefined },
}));

const hooks = vi.hoisted(() => ({
  /** Runs once, just before the next deviation sync writes the table. */
  beforeTableWrite: undefined as (() => Promise<void>) | undefined,
}));
vi.mock('../lib/deviations', async (importOriginal) => {
  const actual = await importOriginal<typeof Deviations>();
  const storage = await import('../lib/storage');
  return {
    ...actual,
    syncDeviations: async (...args: Parameters<typeof actual.syncDeviations>) => {
      const hook = hooks.beforeTableWrite;
      if (!hook) return actual.syncDeviations(...args);
      hooks.beforeTableWrite = undefined;
      // The sync has read the follow-ups by the time it writes: run the hook just then.
      const table = storage.deviationsTable();
      const submit = table.submitTransaction.bind(table);
      const spy = vi.spyOn(table, 'submitTransaction').mockImplementationOnce(async (actions) => {
        spy.mockRestore();
        await hook();
        return submit(actions);
      });
      return actual.syncDeviations(...args);
    },
  };
});

const inspector = principal('sam.andersson@modig.se', ['inspector']);
const admin = principal('boss@modig.se', ['admin']);
const today = swedishDay(new Date());

beforeAll(useTestStorage);
beforeEach(async () => {
  await resetStorage();
  await writeSettings();
});
afterEach(() => {
  hooks.beforeTableWrite = undefined;
  vi.restoreAllMocks();
});

const etagOf = (response: HttpResponseInit) => new Headers(response.headers).get('ETag')!;
const errorOf = (response: HttpResponseInit): ApiError => ApiErrorSchema.parse(response.jsonBody);
const itemIds = (inspection: Inspection) =>
  inspection.templateSnapshot.sections.flatMap((section) => section.items.map((item) => item.id));

/**
 * An inspection stored with its deviations synced, as the API leaves it: rows 1.a and 2.a NOK
 * (D-01, D-02) and an extra deviation (D-03).
 */
async function stored(
  overrides: Partial<Inspection> = {},
  template = draftTemplate({ status: 'published', revision: 2 }),
) {
  const base = sampleInspection(overrides, template);
  const [a, , c] = itemIds(base);
  const inspection: Inspection = {
    ...base,
    results: {
      [a!]: {
        status: 'NOK',
        comment: 'Blue mark missing',
        resp: 'Mechanical',
        category: 'Markings & labels',
        severity: 'major',
      },
      [c!]: { status: 'NOK', comment: 'Cables not labelled', resp: 'Electrical' },
    },
    extraDeviations: [
      { id: newId(), description: 'Scratch on the door', resp: 'Mechanical', severity: 'minor' },
    ],
    ...overrides,
  };
  const etag = await writeInspection(inspection, { ifNoneMatch: '*' });
  await syncDeviations(inspection);
  return { inspection, etag, keys: [a!, c!, inspection.extraDeviations[0]!.id] as const };
}

function follow(id: string, key: string, body: FollowUpRequest | object, who = inspector) {
  return setFollowUp(
    request({ principal: who, method: 'PUT', params: { id, key }, body: JSON.stringify(body) }),
    context(),
  );
}

async function followUpsOf(id: string) {
  const response = await getFollowUps(request({ principal: inspector, params: { id } }), context());
  expect(response.status).toBe(200);
  return FollowUpsSchema.parse(response.jsonBody).followUps;
}

async function log(query: Record<string, string> = {}, who = inspector) {
  const response = await getDeviationLog(request({ principal: who, query }), context());
  expect(response.status).toBe(200);
  return DeviationLogSchema.parse(response.jsonBody);
}

/** The log's entries as "FI-2026-0007 · D-01 open" lines. */
async function logLines(query: Record<string, string> = {}) {
  return (await log(query)).entries.map(
    (entry) => `${entry.inspectionNumber} · ${entry.deviationNumber} ${entry.status}`,
  );
}

async function tableRow(inspection: Inspection, key: string) {
  return deviationsTable().getEntity<Record<string, unknown>>(
    inspection.front.modelCode,
    `${inspection.id}_${key}`,
  );
}

function draftOf({ front, results, extraDeviations }: Inspection): InspectionDraftInput {
  const { modelCode: _model, ...rest } = front;
  return { front: rest, results, extraDeviations };
}

describe('PUT /api/inspections/{id}/follow-ups/{key}', () => {
  it('closes a deviation with today, the signed-in person and the action', async () => {
    await storePeople([
      { email: 'sam.andersson@modig.se', name: 'Sam Andersson', role: 'inspector' },
    ]);
    const { inspection, keys } = await stored();
    const response = await follow(inspection.id, keys[0], {
      status: 'closed',
      action: '  New labels on the screws ',
    });
    expect(response.status).toBe(200);
    expect(FollowUpSchema.parse(response.jsonBody)).toEqual({
      status: 'closed',
      action: 'New labels on the screws',
      closedOn: today,
      closedBy: 'Sam Andersson',
      updatedAt: expect.any(String),
      updatedBy: 'sam.andersson@modig.se',
    });
    // Stored apart from the inspection, and carried by its row in the table.
    expect(await followUpsOf(inspection.id)).toEqual({ [keys[0]]: response.jsonBody });
    expect(await tableRow(inspection, keys[0])).toMatchObject({
      status: 'closed',
      action: 'New labels on the screws',
      closedOn: today,
      closedBy: 'Sam Andersson',
      deviationNumber: 'D-01',
    });
    expect(await tableRow(inspection, keys[1])).toMatchObject({ status: 'open', action: '' });
  });

  it('takes the day and who as given, keeps them when only the action changes, and reopens', async () => {
    const { inspection, keys } = await stored();
    const extra = keys[2];
    await follow(inspection.id, extra, {
      status: 'closed',
      action: 'Polished',
      closedOn: '2026-10-20',
      closedBy: 'Anna Andersson',
    });
    const edited = await follow(inspection.id, extra, { status: 'closed', action: 'Repainted' });
    expect(edited.jsonBody).toMatchObject({
      action: 'Repainted',
      closedOn: '2026-10-20',
      closedBy: 'Anna Andersson',
    });

    const reopened = await follow(inspection.id, extra, { status: 'open' });
    expect(reopened.status).toBe(200);
    // Whoever picks it up again sees what was tried.
    expect(reopened.jsonBody).toMatchObject({
      status: 'open',
      action: 'Repainted',
      closedOn: '',
      closedBy: '',
    });
    expect(await tableRow(inspection, extra)).toMatchObject({
      status: 'open',
      action: 'Repainted',
      closedOn: '',
    });
  });

  it('never changes the inspection: its version and findings stay', async () => {
    const { inspection, etag, keys } = await stored();
    await follow(inspection.id, keys[1], { status: 'closed' });
    const after = await loadInspection(inspection.id);
    expect(after?.etag).toBe(etag);
    expect(after?.data).toEqual(inspection);
    // So the open page's next autosave goes through.
    const saved = await saveInspection(
      request({
        principal: inspector,
        params: { id: inspection.id },
        body: JSON.stringify(draftOf(inspection)),
        headers: { 'If-Match': etag },
      }),
      context(),
    );
    expect(saved.status).toBe(200);
  });

  it('follows up a finalised inspection’s deviations, and a quality check’s', async () => {
    const done = await stored({ state: 'finalised', finalisedAt: '2026-10-08T08:00:00.000Z' });
    expect((await follow(done.inspection.id, done.keys[0], { status: 'closed' })).status).toBe(200);
    expect(await tableRow(done.inspection, done.keys[0])).toMatchObject({
      status: 'closed',
      finalised: true,
    });

    const check = await stored({ kind: 'quality', number: 'QC-2026-0004' });
    expect((await follow(check.inspection.id, check.keys[2], { status: 'closed' })).status).toBe(
      200,
    );
    expect(await tableRow(check.inspection, check.keys[2])).toMatchObject({
      kind: 'quality',
      status: 'closed',
    });
  });

  it('answers 404 for a key that is not a deviation now, and for an unknown inspection', async () => {
    const { inspection } = await stored();
    const [, okRow] = itemIds(inspection);
    for (const key of [okRow!, newId()]) {
      const response = await follow(inspection.id, key, { status: 'closed' });
      expect(response.status).toBe(404);
      expect(errorOf(response).message).toMatch(/not in the inspection/);
    }
    expect((await follow(newId(), newId(), { status: 'closed' })).status).toBe(404);
    expect(await followUpsOf(inspection.id)).toEqual({});
  });

  it('refuses a request it can’t read', async () => {
    const { inspection, keys } = await stored();
    for (const body of [
      {},
      { status: 'done' },
      { status: 'closed', closedOn: '6 Nov' },
      { status: 'closed', action: 'x'.repeat(2001) },
    ]) {
      expect((await follow(inspection.id, keys[0], body)).status).toBe(400);
    }
    const badKey = await setFollowUp(
      request({
        principal: inspector,
        method: 'PUT',
        params: { id: inspection.id, key: 'not_an-id' },
        body: JSON.stringify({ status: 'closed' }),
      }),
      context(),
    );
    expect(badKey.status).toBe(400);
  });

  it('is for inspectors and admins: no role is refused', async () => {
    const { inspection, keys } = await stored();
    expect((await follow(inspection.id, keys[0], { status: 'closed' }, admin)).status).toBe(200);
    const guest = principal('guest@outlook.com', []);
    expect((await follow(inspection.id, keys[1], { status: 'closed' }, guest)).status).toBe(403);
    const anonymous = await setFollowUp(
      request({ method: 'PUT', params: { id: inspection.id, key: keys[1] }, body: '{}' }),
      context(),
    );
    expect(anonymous.status).toBe(401);
  });

  it('keeps two deviations closed at once by two people', async () => {
    const { inspection, keys } = await stored();
    const responses = await Promise.all(
      keys.map((key) => follow(inspection.id, key, { status: 'closed', action: key })),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    const followUps = await followUpsOf(inspection.id);
    expect(Object.keys(followUps).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(await tableRow(inspection, key)).toMatchObject({ status: 'closed', action: key });
    }
  });
});

describe('a follow-up and the inspection’s writes', () => {
  it('stays in the table across the inspection’s saves and a rebuild from the blobs', async () => {
    const { inspection, etag, keys } = await stored();
    await follow(inspection.id, keys[0], { status: 'closed', action: 'Marked' });
    const saved = await saveInspection(
      request({
        principal: inspector,
        params: { id: inspection.id },
        body: JSON.stringify({
          ...draftOf(inspection),
          results: {
            ...inspection.results,
            [keys[0]]: { ...inspection.results[keys[0]], comment: 'Edited comment' },
          },
        }),
        headers: { 'If-Match': etag },
      }),
      context(),
    );
    expect(saved.status).toBe(200);
    expect(await tableRow(inspection, keys[0])).toMatchObject({
      comment: 'Edited comment',
      status: 'closed',
      action: 'Marked',
    });

    // The table lost (or rebuilt): a sync from the two blobs brings the follow-up back.
    await deviationsTable().deleteEntity(inspection.front.modelCode, `${inspection.id}_${keys[0]}`);
    await syncDeviations((await loadInspection(inspection.id))!.data);
    expect(await tableRow(inspection, keys[0])).toMatchObject({ status: 'closed' });
  });

  it('is never lost when a save’s sync read the follow-ups just before it was closed', async () => {
    const { inspection, etag, keys } = await stored();
    // The save's sync has read the follow-ups (none) and is about to write the table: the
    // follow-up's blob write lands now, and its own sync only after the save's.
    hooks.beforeTableWrite = async () => {
      await writeJson(CONTAINERS.followUps, blobNames.followUps(inspection.id), {
        inspectionId: inspection.id,
        followUps: {
          [keys[1]]: {
            status: 'closed',
            action: 'Labelled',
            closedOn: '2026-11-01',
            closedBy: 'Anna Andersson',
            updatedAt: '2026-11-01T10:00:00.000Z',
            updatedBy: 'anna.andersson@modig.se',
          },
        },
      });
    };
    const saved = await saveInspection(
      request({
        principal: inspector,
        params: { id: inspection.id },
        // A change to another deviation, so the save's sync has a row to write.
        body: JSON.stringify({
          ...draftOf(inspection),
          results: {
            ...inspection.results,
            [keys[0]]: { ...inspection.results[keys[0]], comment: 'Edited comment' },
          },
        }),
        headers: { 'If-Match': etag },
      }),
      context(),
    );
    expect(saved.status).toBe(200);
    // The save saw the follow-ups change after its sync and synced again.
    expect(await tableRow(inspection, keys[1])).toMatchObject({
      status: 'closed',
      action: 'Labelled',
    });
  });

  it('comes back with its deviation when a row is NOK again', async () => {
    const { inspection, etag, keys } = await stored();
    await follow(inspection.id, keys[1], { status: 'closed', action: 'Labelled' });
    const put = (results: Inspection['results'], ifMatch: string) =>
      saveInspection(
        request({
          principal: inspector,
          params: { id: inspection.id },
          body: JSON.stringify({ ...draftOf(inspection), results }),
          headers: { 'If-Match': ifMatch },
        }),
        context(),
      );
    const ok = await put({ ...inspection.results, [keys[1]]: { status: 'OK' } }, etag);
    await expect(tableRow(inspection, keys[1])).rejects.toMatchObject({ statusCode: 404 });
    await put(inspection.results, etagOf(ok));
    expect(await tableRow(inspection, keys[1])).toMatchObject({ status: 'closed' });
  });

  it('is deleted with its inspection', async () => {
    const { inspection, etag, keys } = await stored();
    await follow(inspection.id, keys[0], { status: 'closed' });
    const response = await deleteInspection(
      request({
        principal: admin,
        method: 'DELETE',
        params: { id: inspection.id },
        headers: { 'If-Match': etag },
      }),
      context(),
    );
    expect(response.status).toBe(204);
    expect(
      await readJson(CONTAINERS.followUps, blobNames.followUps(inspection.id), FollowUpsSchema),
    ).toBeNull();
    expect(await followUpsOf(inspection.id)).toEqual({});
  });
});

describe('GET /api/deviations', () => {
  /** Two final inspections on two models and a quality check, with some deviations closed. */
  async function logData() {
    const mt = draftTemplate({ status: 'published', revision: 2, modelCode: 'RMMT' });
    const older = await stored({
      number: 'FI-2026-0003',
      front: { ...sampleInspection().front, machineName: 'Boeing#2', date: '2026-09-01' },
    });
    const magellan = await stored(
      {
        number: 'FI-2026-0009',
        front: {
          ...sampleInspection({}, mt).front,
          machineName: 'Magellan#1',
          serialNumber: 'MG-0001',
          date: '2026-10-15',
        },
      },
      mt,
    );
    const check = await stored({
      kind: 'quality',
      number: 'QC-2026-0004',
      front: { ...sampleInspection().front, machineName: 'Magellan#1', location: '' },
    });
    await follow(older.inspection.id, older.keys[0], { status: 'closed', action: 'Marked' });
    await follow(magellan.inspection.id, magellan.keys[2], { status: 'closed' });
    await follow(check.inspection.id, check.keys[1], { status: 'closed' });
    return { older, magellan, check };
  }

  it('lists one kind’s open deviations by default, oldest inspection first, each by number', async () => {
    await logData();
    expect(await logLines()).toEqual([
      'FI-2026-0003 · D-02 open',
      'FI-2026-0003 · D-03 open',
      'FI-2026-0009 · D-01 open',
      'FI-2026-0009 · D-02 open',
    ]);
    expect(await logLines({ status: 'closed' })).toEqual([
      'FI-2026-0003 · D-01 closed',
      'FI-2026-0009 · D-03 closed',
    ]);
    expect(await logLines({ status: 'all' })).toHaveLength(6);
    expect(await logLines({ kind: 'quality', status: 'all' })).toEqual([
      'QC-2026-0004 · D-01 open',
      'QC-2026-0004 · D-02 closed',
      'QC-2026-0004 · D-03 open',
    ]);
  });

  it('gives each entry its key, found date and follow-up', async () => {
    const { older } = await logData();
    const [entry] = (await log({ status: 'closed', model: 'RMMG' })).entries;
    expect(entry).toMatchObject({
      key: older.keys[0],
      inspectionId: older.inspection.id,
      machineName: 'Boeing#2',
      displayRef: '1.a',
      deviationNumber: 'D-01',
      status: 'closed',
      action: 'Marked',
      closedOn: today,
      foundOn: today,
      finalised: false,
    });
  });

  it('filters by model, responsible, category and search words', async () => {
    await logData();
    expect(await logLines({ status: 'all', model: 'RMMT' })).toEqual([
      'FI-2026-0009 · D-01 open',
      'FI-2026-0009 · D-02 open',
      'FI-2026-0009 · D-03 closed',
    ]);
    // Responsible and category ignore case; "-" is the deviations without one.
    expect(await logLines({ status: 'all', resp: 'electrical' })).toEqual([
      'FI-2026-0003 · D-02 open',
      'FI-2026-0009 · D-02 open',
    ]);
    expect(await logLines({ category: 'MARKINGS & LABELS', status: 'all' })).toEqual([
      'FI-2026-0003 · D-01 closed',
      'FI-2026-0009 · D-01 open',
    ]);
    expect(await logLines({ category: '-' })).toEqual([
      'FI-2026-0003 · D-02 open',
      'FI-2026-0003 · D-03 open',
      'FI-2026-0009 · D-02 open',
    ]);
    // Every word somewhere: the machine, the ID, the text, the action…
    expect(await logLines({ q: 'magellan d-02' })).toEqual(['FI-2026-0009 · D-02 open']);
    expect(await logLines({ q: 'FI-2026-0003 · D-01', status: 'all' })).toEqual([
      'FI-2026-0003 · D-01 closed',
    ]);
    expect(await logLines({ q: 'marked', status: 'closed' })).toEqual([
      'FI-2026-0003 · D-01 closed',
    ]);
    expect(await logLines({ q: 'scratch', kind: 'quality' })).toEqual(['QC-2026-0004 · D-03 open']);
    expect(
      (
        await getDeviationLog(
          request({ principal: inspector, query: { status: 'done' } }),
          context(),
        )
      ).status,
    ).toBe(400);
  });

  it('reads rows written before the log as open final inspection deviations, numbered', async () => {
    const { inspection, keys } = await stored();
    // As written before quality checks and the log: no kind, number or follow-up.
    for (const key of keys) {
      const {
        etag: _etag,
        timestamp: _timestamp,
        kind: _kind,
        checkName: _name,
        deviationNumber: _number,
        status: _status,
        action: _action,
        closedOn: _on,
        closedBy: _by,
        ...older
      } = await tableRow(inspection, key);
      await deviationsTable().upsertEntity(
        older as { partitionKey: string; rowKey: string },
        'Replace',
      );
    }
    expect(await logLines()).toEqual([
      'FI-2026-0007 · D-01 open',
      'FI-2026-0007 · D-02 open',
      'FI-2026-0007 · D-03 open',
    ]);
    expect(await logLines({ kind: 'quality', status: 'all' })).toEqual([]);
  });

  it('leaves out the rows of an inspection that no longer exists', async () => {
    const { inspection } = await stored();
    await containerClient(CONTAINERS.inspections)
      .getBlobClient(blobNames.inspection(inspection.id))
      .delete();
    expect(await logLines({ status: 'all' })).toEqual([]);
  });

  it('is for inspectors and admins', async () => {
    await stored();
    expect((await log({}, admin)).entries).toHaveLength(3);
    const guest = await getDeviationLog(
      request({ principal: principal('guest@outlook.com', []) }),
      context(),
    );
    expect(guest.status).toBe(403);
  });
});

describe('GET /api/deviations/export.csv', () => {
  async function csv(query: Record<string, string>) {
    const response = await exportDeviationLogCsv(
      request({ principal: inspector, query }),
      context(),
    );
    expect(response.status).toBe(200);
    const body = String(response.body);
    expect(body.startsWith('\uFEFF')).toBe(true);
    expect(body.endsWith('\r\n')).toBe(true);
    return {
      lines: body.slice(1).trimEnd().split('\r\n'),
      headers: new Headers(response.headers),
    };
  }

  it('has the Excel log’s columns, one line per deviation under the filters', async () => {
    const { inspection, keys } = await stored({
      front: { ...sampleInspection().front, machineName: 'Magellan#1' },
    });
    await follow(inspection.id, keys[0], {
      status: 'closed',
      action: 'New labels; checked',
      closedOn: '2026-10-20',
      closedBy: 'Anna Andersson',
    });
    const { lines, headers } = await csv({ status: 'all' });
    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(headers.get('Content-Disposition')).toBe(
      `attachment; filename="Final inspection deviations ${today}, open and closed.csv"`,
    );
    expect(lines[0]).toBe(
      'Machine ID;Serial number;Model;Inspection;Date;Deviation ID;Description;Comment;Action;Category;Severity;Responsible;Status;Found;Closed;Closed by',
    );
    expect(lines.slice(1)).toEqual([
      `Magellan#1;SN-1007;RigiMill MG;FI-2026-0007;2026-10-07;FI-2026-0007 · D-01;1.a Lifting columns - Marked screws, blue/red/yellow;Blue mark missing;"New labels; checked";Markings & labels;Major;Mechanical;Closed;${today};2026-10-20;Anna Andersson`,
      `Magellan#1;SN-1007;RigiMill MG;FI-2026-0007;2026-10-07;FI-2026-0007 · D-02;2.a Main cabinet - Verify labeling on cables and components;Cables not labelled;;;Minor;Electrical;Open;${today};;`,
      `Magellan#1;SN-1007;RigiMill MG;FI-2026-0007;2026-10-07;FI-2026-0007 · D-03;Scratch on the door;;;;Minor;Mechanical;Open;${today};;`,
    ]);
    expect((await csv({})).lines).toHaveLength(3);
  });

  it('adds a quality check’s title after the machine, and names the file after the filters', async () => {
    await stored({
      kind: 'quality',
      number: 'QC-2026-0004',
      front: { ...sampleInspection().front, machineName: 'Magellan#1', location: '' },
      templateSnapshot: {
        ...sampleInspection().templateSnapshot,
        name: 'Quality check – Före start',
      },
    });
    const { lines, headers } = await csv({ kind: 'quality', model: 'RMMG', resp: 'Electrical' });
    expect(lines[0]).toMatch(
      /^Machine ID;Serial number;Quality check;Model;Quality check no\.;Date;/,
    );
    expect(lines.slice(1)).toEqual([
      expect.stringMatching(
        /^Magellan#1;SN-1007;Quality check – Före start;RigiMill MG;QC-2026-0004;2026-10-07;QC-2026-0004 · D-02;/,
      ),
    ]);
    expect(headers.get('Content-Disposition')).toBe(
      `attachment; filename="Quality check deviations ${today}, open, RMMG, responsible Electrical.csv"`,
    );
  });

  it('names one machine’s export after its Machine ID', () => {
    const query = { kind: 'quality', status: 'open', machine: 'Mach000000000001' } as const;
    expect(deviationLogFileName(query, '2026-11-06', 'Magellan#1')).toBe(
      'Quality check deviations 2026-11-06, open, Magellan#1.csv',
    );
    expect(deviationLogFileName(query, '2026-11-06', 'Spinner/2')).toBe(
      'Quality check deviations 2026-11-06, open, Spinner-2.csv',
    );
    expect(deviationLogFileName(query, '2026-11-06')).toBe(
      'Quality check deviations 2026-11-06, open, machine.csv',
    );
  });
});
