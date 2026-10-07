import type * as AzureFunctions from '@azure/functions';
import type { HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  InspectionSchema,
  newId,
  type ApiError,
  type FinaliseIssue,
  type Inspection,
  type RowResult,
} from '@modig/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import { resetStorage, sampleInspection, useTestStorage } from '../../test/storage';
import type { ClientPrincipal } from '../lib/auth';
import type * as Deviations from '../lib/deviations';
import { syncDeviations } from '../lib/deviations';
import { loadInspection, writeInspection } from '../lib/inspections';
import type * as Storage from '../lib/storage';
import { deviationsTable } from '../lib/storage';
import { finaliseInspection, reopenInspection } from './inspection-state';
import { saveInspection } from './inspections';

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
}));
vi.mock('../lib/deviations', async (importOriginal) => {
  const actual = await importOriginal<typeof Deviations>();
  return {
    ...actual,
    syncDeviations: async (...args: Parameters<typeof actual.syncDeviations>) => {
      if (hooks.failSync) throw new Error('Table storage is down');
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
const admin = principal('Boss@modig.se', ['admin']);

beforeAll(useTestStorage);
beforeEach(resetStorage);
afterEach(() => {
  hooks.failSync = false;
  hooks.beforeWrite = undefined;
});

const etagOf = (response: HttpResponseInit) => new Headers(response.headers).get('ETag');
const errorOf = (response: HttpResponseInit): ApiError => ApiErrorSchema.parse(response.jsonBody);
const inspectionOf = (response: HttpResponseInit) => InspectionSchema.parse(response.jsonBody);

function post(
  handler: typeof finaliseInspection,
  id: string,
  ifMatch: string | null,
  who: ClientPrincipal | null,
  ctx = context(),
) {
  return handler(
    request({
      principal: who ?? undefined,
      method: 'POST',
      params: { id },
      headers: ifMatch ? { 'If-Match': ifMatch } : {},
    }),
    ctx,
  );
}

const finalise = (id: string, ifMatch: string | null, who: ClientPrincipal | null = inspector) =>
  post(finaliseInspection, id, ifMatch, who);
const reopen = (id: string, ifMatch: string | null, who: ClientPrincipal | null = admin) =>
  post(reopenInspection, id, ifMatch, who);

/**
 * A stored, synced inspection whose first row is NOK and the others OK (or `results`), with an
 * extra deviation, like a filled-in inspection about to be finalised.
 */
async function storedInspection(
  results?: (itemIds: string[]) => Record<string, RowResult>,
  overrides: Partial<Inspection> = {},
): Promise<{ inspection: Inspection; etag: string }> {
  const base = sampleInspection(overrides);
  const ids = base.templateSnapshot.sections.flatMap((s) => s.items.map((item) => item.id));
  const inspection: Inspection = {
    ...base,
    results:
      results?.(ids) ??
      Object.fromEntries(
        ids.map((id, index) => [id, { status: index === 0 ? 'NOK' : 'OK', comment: 'c' }]),
      ),
    extraDeviations: [{ id: newId(), description: 'Scratch on door', severity: 'minor' }],
  };
  const etag = await writeInspection(inspection, { ifNoneMatch: '*' });
  await syncDeviations(inspection);
  return { inspection, etag };
}

/** `finalised` of every deviation row, by RowKey. */
async function finalisedFlags(): Promise<Record<string, unknown>> {
  const flags: Record<string, unknown> = {};
  for await (const entity of deviationsTable().listEntities()) {
    flags[entity.rowKey!] = entity.finalised;
  }
  return flags;
}

function allFlags(inspection: Inspection, finalised: boolean) {
  const keys = [
    inspection.templateSnapshot.sections[0]!.items[0]!.id,
    ...inspection.extraDeviations.map((extra) => extra.id),
  ];
  return Object.fromEntries(keys.map((key) => [`${inspection.id}_${key}`, finalised]));
}

describe('registration', () => {
  it('registers finalise and reopen, SWA doing authentication', () => {
    expect(registrations).toEqual(
      expect.arrayContaining([
        [
          'inspectionFinalise',
          {
            methods: ['POST'],
            authLevel: 'anonymous',
            route: 'inspections/{id}/finalise',
            handler: finaliseInspection,
          },
        ],
        [
          'inspectionReopen',
          {
            methods: ['POST'],
            authLevel: 'anonymous',
            route: 'inspections/{id}/reopen',
            handler: reopenInspection,
          },
        ],
      ]),
    );
  });
});

describe('POST /api/inspections/{id}/finalise', () => {
  it('401 without a client principal, 403 without an app role', async () => {
    const { inspection, etag } = await storedInspection();
    expect((await finalise(inspection.id, etag, null)).status).toBe(401);
    expect((await finalise(inspection.id, etag, principal('x@modig.se', []))).status).toBe(403);
  });

  it('locks the inspection and marks its deviation rows finalised', async () => {
    const { inspection, etag } = await storedInspection();
    expect(await finalisedFlags()).toEqual(allFlags(inspection, false));

    const response = await finalise(inspection.id, etag);
    expect(response.status).toBe(200);
    const finalised = inspectionOf(response);
    expect(finalised).toEqual({
      ...inspection,
      state: 'finalised',
      finalisedAt: expect.any(String),
      finalisedBy: 'sam.andersson@modig.se',
      updatedAt: finalised.finalisedAt,
      updatedBy: 'sam.andersson@modig.se',
    });
    expect(Date.now() - Date.parse(finalised.finalisedAt!)).toBeLessThan(60_000);
    expect(await loadInspection(inspection.id)).toEqual({
      data: finalised,
      etag: etagOf(response),
    });
    expect(await finalisedFlags()).toEqual(allFlags(inspection, true));

    // Read-only from now on.
    const save = await saveInspection(
      request({
        principal: inspector,
        params: { id: inspection.id },
        body: JSON.stringify({ front: inspection.front, results: {}, extraDeviations: [] }),
        headers: { 'If-Match': etagOf(response)! },
      }),
      context(),
    );
    expect(save.status).toBe(409);
  });

  it('400 listing every problem while rows have no status, changing nothing', async () => {
    const { inspection, etag } = await storedInspection(
      ([a, b]) => ({ [a!]: { status: 'OK' }, [b!]: { comment: 'no status yet' } }),
      { front: { ...sampleInspection().front, serialNumber: ' ' } },
    );
    const [section1, section2] = inspection.templateSnapshot.sections;
    const response = await finalise(inspection.id, etag);

    expect(response.status).toBe(400);
    expect(errorOf(response)).toEqual({
      error: 'bad_request',
      message: 'Fix 3 problems before finalising.',
      details: [
        {
          target: { kind: 'front', field: 'serialNumber' },
          message: 'The front page needs a serial number.',
        },
        {
          target: { kind: 'row', sectionId: section1!.id, itemId: section1!.items[1]!.id },
          message: 'Row 1.b has no status.',
        },
        {
          target: { kind: 'row', sectionId: section2!.id, itemId: section2!.items[0]!.id },
          message: 'Row 2.a has no status.',
        },
      ] satisfies FinaliseIssue[],
    });
    expect(await loadInspection(inspection.id)).toEqual({ data: inspection, etag });
  });

  it('says "one problem" for one', async () => {
    const { inspection, etag } = await storedInspection(([a, b]) => ({
      [a!]: { status: 'OK' },
      [b!]: { status: 'OK' },
    }));
    expect(errorOf(await finalise(inspection.id, etag)).message).toBe(
      'Fix one problem before finalising.',
    );
  });

  it('503 when the deviation table fails, changing nothing, so it can be retried', async () => {
    const { inspection, etag } = await storedInspection();
    hooks.failSync = true;
    const ctx = context();
    const logged = vi.spyOn(ctx, 'error');
    const failed = await post(finaliseInspection, inspection.id, etag, inspector, ctx);

    expect(failed.status).toBe(503);
    expect(errorOf(failed)).toEqual({
      error: 'unavailable',
      message: 'The deviation records could not be updated, so nothing was changed. Try again.',
    });
    expect(logged).toHaveBeenCalledWith(
      `Syncing the deviations of inspection ${inspection.id} failed`,
      expect.any(Error),
    );
    expect(await loadInspection(inspection.id)).toEqual({ data: inspection, etag });
    expect(await finalisedFlags()).toEqual(allFlags(inspection, false));

    hooks.failSync = false;
    expect((await finalise(inspection.id, etag)).status).toBe(200);
    expect(await finalisedFlags()).toEqual(allFlags(inspection, true));
  });

  it('answers a repeat with the same inspection, and syncs the table again', async () => {
    const { inspection, etag } = await storedInspection();
    const first = await finalise(inspection.id, etag);
    const [rowKey] = Object.keys(allFlags(inspection, true));
    await deviationsTable().deleteEntity('RMMG', rowKey!);

    const again = await finalise(inspection.id, etagOf(first));
    expect(again.status).toBe(200);
    expect(again.jsonBody).toEqual(first.jsonBody);
    expect(etagOf(again)).toBe(etagOf(first));
    expect(await finalisedFlags()).toEqual(allFlags(inspection, true));
  });

  it('412 for an outdated page, before any other check', async () => {
    const { inspection, etag } = await storedInspection(() => ({}));
    const newer = await writeInspection(
      { ...inspection, updatedBy: 'kim@modig.se' },
      { ifMatch: etag },
    );
    // Rows without a status would be a 400, but the page is outdated.
    expect((await finalise(inspection.id, etag)).status).toBe(412);
    expect((await loadInspection(inspection.id))?.etag).toBe(newer);
  });

  it('puts the table back in line when someone saves between its sync and its write', async () => {
    const { inspection, etag } = await storedInspection();
    const [a] = inspection.templateSnapshot.sections[0]!.items;
    // Someone else's save lands after the table was marked finalised; it changes a comment
    // (and, say, its own sync has not run yet).
    const theirs = {
      ...inspection,
      results: { ...inspection.results, [a!.id]: { status: 'NOK' as const, comment: 'Theirs' } },
    };
    hooks.beforeWrite = async () => {
      await writeInspection(theirs, { ifMatch: etag });
    };

    const response = await finalise(inspection.id, etag);
    expect(response.status).toBe(412);
    expect((await loadInspection(inspection.id))?.data.state).toBe('in_progress');
    expect(await finalisedFlags()).toEqual(allFlags(inspection, false));
    const row = await deviationsTable().getEntity('RMMG', `${inspection.id}_${a!.id}`);
    expect(row.comment).toBe('Theirs');
  });

  it('400 without If-Match, 404 for an unknown inspection, 400 for a malformed id', async () => {
    const { inspection } = await storedInspection();
    expect((await finalise(inspection.id, null)).status).toBe(400);
    expect((await finalise(newId(), '"0x1"')).status).toBe(404);
    expect((await finalise('a/b', '"0x1"')).status).toBe(400);
  });
});

describe('POST /api/inspections/{id}/reopen', () => {
  async function finalisedInspection() {
    const { inspection, etag } = await storedInspection();
    const response = await finalise(inspection.id, etag);
    return { inspection, finalised: inspectionOf(response), etag: etagOf(response)! };
  }

  it('is for admins only', async () => {
    const { inspection, etag } = await finalisedInspection();
    expect((await reopen(inspection.id, etag, null)).status).toBe(401);
    const asInspector = await reopen(inspection.id, etag, inspector);
    expect(asInspector.status).toBe(403);
    expect(errorOf(asInspector).error).toBe('forbidden');
  });

  it('unlocks the inspection and marks its deviation rows in progress again', async () => {
    const { inspection, etag } = await finalisedInspection();
    const response = await reopen(inspection.id, etag);
    expect(response.status).toBe(200);
    const reopened = inspectionOf(response);
    expect(reopened).toEqual({
      ...inspection,
      state: 'in_progress',
      updatedAt: expect.any(String),
      updatedBy: 'boss@modig.se',
    });
    expect(reopened).not.toHaveProperty('finalisedAt');
    expect(reopened).not.toHaveProperty('finalisedBy');
    expect(await loadInspection(inspection.id)).toEqual({ data: reopened, etag: etagOf(response) });
    expect(await finalisedFlags()).toEqual(allFlags(inspection, false));

    // Editable again.
    const save = await saveInspection(
      request({
        principal: inspector,
        params: { id: inspection.id },
        body: JSON.stringify({ front: inspection.front, results: {}, extraDeviations: [] }),
        headers: { 'If-Match': etagOf(response)! },
      }),
      context(),
    );
    expect(save.status).toBe(200);
  });

  it('answers a repeat with the same inspection', async () => {
    const { inspection, etag } = await finalisedInspection();
    const first = await reopen(inspection.id, etag);
    const again = await reopen(inspection.id, etagOf(first));
    expect(again.status).toBe(200);
    expect(again.jsonBody).toEqual(first.jsonBody);
    expect(etagOf(again)).toBe(etagOf(first));
  });

  it('503 when the deviation table fails, leaving it finalised', async () => {
    const { inspection, finalised, etag } = await finalisedInspection();
    hooks.failSync = true;
    const response = await reopen(inspection.id, etag);
    expect(response.status).toBe(503);
    expect(errorOf(response).error).toBe('unavailable');
    expect(await loadInspection(inspection.id)).toEqual({ data: finalised, etag });
    expect(await finalisedFlags()).toEqual(allFlags(inspection, true));
  });

  it('400 without If-Match, 412 for an outdated page, 404 for an unknown inspection', async () => {
    const { inspection, etag } = await storedInspection();
    const finalised = await finalise(inspection.id, etag);
    expect(finalised.status).toBe(200);
    expect((await reopen(inspection.id, null)).status).toBe(400);
    expect((await reopen(inspection.id, etag)).status).toBe(412);
    expect((await reopen(newId(), etag)).status).toBe(404);
  });
});
