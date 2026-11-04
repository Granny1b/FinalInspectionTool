import type * as AzureFunctions from '@azure/functions';
import type { HttpHandler, HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  SettingsSchema,
  type ApiError,
  type SettingsInput,
} from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import { resetStorage, useTestStorage, writeSettings } from '../../test/storage';
import { loadStoredSettings } from '../lib/settings';
import { readJson, writeJson } from '../lib/storage';
import { getSettings, saveSettings } from './settings';

// Record the registration instead of letting the package (in "test mode") warn about it.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

const admin = principal('Anna.Andersson@Modig.se', ['admin']);
const inspector = principal('sam.andersson@modig.se', ['inspector']);

beforeAll(useTestStorage);
beforeEach(resetStorage);

const etagOf = (response: HttpResponseInit) => new Headers(response.headers).get('ETag');
const errorOf = (response: HttpResponseInit): ApiError => ApiErrorSchema.parse(response.jsonBody);

/** What the Settings page sends. */
const edited: SettingsInput = {
  machineModels: [
    { code: 'RMMG', name: 'RigiMill MG' },
    { code: 'HMC5', name: 'HMC 500' },
  ],
  defaultLocation: 'Skövde, Sweden',
  companyName: 'Modig Machine Tool AB',
  logoImageId: 'Logo000000000001',
  responsibles: ['Mechanical', 'Electrical', 'Hydraulics'],
  deviationCategories: ['Markings & labels', 'Missing parts'],
};

function put(body: unknown, ifMatch?: string | null, who = admin) {
  return saveSettings(
    request({
      principal: who,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: ifMatch ? { 'If-Match': ifMatch } : {},
    }),
    context(),
  );
}

async function storedEtag(): Promise<string> {
  return (await loadStoredSettings())!.etag;
}

describe('registration', () => {
  it('is one function for GET and PUT /api/settings, SWA doing authentication', () => {
    expect(registrations).toEqual([
      [
        'settings',
        {
          methods: ['GET', 'PUT'],
          authLevel: 'anonymous',
          route: 'settings',
          handler: expect.any(Function),
        },
      ],
    ]);
  });

  it('dispatches by method, each with its own role', async () => {
    await writeSettings();
    const handler = (registrations[0]![1] as { handler: HttpHandler }).handler;
    const asInspector = (method: string) => request({ principal: inspector, method });
    expect((await handler(asInspector('GET'), context())).status).toBe(200);
    expect((await handler(asInspector('PUT'), context())).status).toBe(403);
  });
});

describe('GET /api/settings', () => {
  it('401 without a client principal, 403 without an app role', async () => {
    expect((await getSettings(request(), context())).status).toBe(401);
    const guest = request({ principal: principal('guest@outlook.com', []) });
    expect((await getSettings(guest, context())).status).toBe(403);
  });

  it('returns the settings to an inspector, with their ETag', async () => {
    const settings = await writeSettings();
    const response = await getSettings(request({ principal: inspector }), context());
    expect(response.status).toBe(200);
    expect(SettingsSchema.parse(response.jsonBody)).toEqual(settings);
    expect(etagOf(response)).toBe(await storedEtag());
  });

  it('fills in the default lists for settings written before they existed', async () => {
    const { responsibles: _r, deviationCategories: _c, ...older } = await writeSettings();
    await writeJson(CONTAINERS.config, blobNames.settings, older);
    const response = await getSettings(request({ principal: inspector }), context());
    expect(response.status).toBe(200);
    const settings = SettingsSchema.parse(response.jsonBody);
    expect(settings.responsibles).toContain('Mechanical');
    expect(settings.deviationCategories).toContain('Missing parts');
  });

  it('404 before the seed has created them', async () => {
    const response = await getSettings(request({ principal: inspector }), context());
    expect(response.status).toBe(404);
    expect(errorOf(response).error).toBe('not_found');
  });
});

describe('PUT /api/settings', () => {
  it('401 without a client principal, 403 for an inspector', async () => {
    await writeSettings();
    const etag = await storedEtag();
    const anonymous = request({ body: JSON.stringify(edited), headers: { 'If-Match': etag } });
    expect((await saveSettings(anonymous, context())).status).toBe(401);
    expect((await put(edited, etag, inspector)).status).toBe(403);
    expect((await loadStoredSettings())!.data.companyName).toBe('Modig Machine Tool');
  });

  it('saves the editable fields, stamped with the admin and the time, and returns the new ETag', async () => {
    await writeSettings();
    const before = Date.now();
    const response = await put(edited, await storedEtag());
    expect(response.status).toBe(200);
    const saved = SettingsSchema.parse(response.jsonBody);
    expect(saved).toEqual({
      ...edited,
      updatedAt: expect.any(String),
      updatedBy: 'anna.andersson@modig.se',
    });
    expect(Date.parse(saved.updatedAt)).toBeGreaterThanOrEqual(before);
    const stored = await readJson(CONTAINERS.config, blobNames.settings, SettingsSchema);
    expect(stored!.data).toEqual(saved);
    expect(etagOf(response)).toBe(stored!.etag);
  });

  it('trims, removes the logo when it is left out, and ignores the server-owned fields', async () => {
    await writeSettings();
    const { logoImageId: _logo, ...withoutLogo } = edited;
    const response = await put(
      {
        ...withoutLogo,
        companyName: '  Modig  ',
        responsibles: [' Mechanical '],
        updatedAt: '2020-01-01T00:00:00.000Z',
        updatedBy: 'someone-else@modig.se',
      },
      await storedEtag(),
    );
    expect(response.status).toBe(200);
    const saved = (await loadStoredSettings())!.data;
    expect(saved.companyName).toBe('Modig');
    expect(saved.responsibles).toEqual(['Mechanical']);
    expect(saved).not.toHaveProperty('logoImageId');
    expect(saved.updatedBy).toBe('anna.andersson@modig.se');
    expect(saved.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  it('400 without If-Match, and with "*"', async () => {
    await writeSettings();
    for (const ifMatch of [null, '*']) {
      const response = await put(edited, ifMatch);
      expect(response.status).toBe(400);
      expect(errorOf(response).error).toBe('bad_request');
    }
  });

  it('412 for an outdated ETag, leaving the newer save in place', async () => {
    await writeSettings();
    const etag = await storedEtag();
    expect((await put({ ...edited, companyName: 'First' }, etag)).status).toBe(200);
    const stale = await put({ ...edited, companyName: 'Second' }, etag);
    expect(stale.status).toBe(412);
    expect(errorOf(stale).error).toBe('precondition_failed');
    expect((await loadStoredSettings())!.data.companyName).toBe('First');
  });

  it('accepts a weakened ETag (W/ from a compressing proxy)', async () => {
    await writeSettings();
    expect((await put(edited, `W/${await storedEtag()}`)).status).toBe(200);
  });

  it.each<[string, unknown, string[]]>([
    [
      'a model code with other characters',
      { machineModels: [{ code: 'RM-MG', name: 'RigiMill MG' }] },
      ['machineModels.0.code'],
    ],
    [
      'two models with the same code, ignoring case',
      {
        machineModels: [
          { code: 'RMMG', name: 'RigiMill MG' },
          { code: 'rmmg', name: 'RigiMill MG2' },
        ],
      },
      ['machineModels.1.code'],
    ],
    [
      'two models with the same name, ignoring case',
      {
        machineModels: [
          { code: 'RMMG', name: 'RigiMill MG' },
          { code: 'RMMT', name: 'rigimill mg' },
        ],
      },
      ['machineModels.1.name'],
    ],
    ['an empty Responsible', { responsibles: ['Mechanical', ' '] }, ['responsibles.1']],
    [
      'a category twice',
      { deviationCategories: ['Leakage', 'LEAKAGE'] },
      ['deviationCategories.1'],
    ],
    [
      'too many entries',
      { responsibles: Array.from({ length: 51 }, (_, i) => `R${i}`) },
      ['responsibles'],
    ],
    ['a company name that is too long', { companyName: 'x'.repeat(201) }, ['companyName']],
    ['a malformed logo id', { logoImageId: '../../etc' }, ['logoImageId']],
    ['a missing list', { deviationCategories: undefined }, ['deviationCategories']],
  ])('400 with the zod issues for %s', async (_case, change, paths) => {
    await writeSettings();
    const response = await put({ ...edited, ...(change as object) }, await storedEtag());
    expect(response.status).toBe(400);
    const issues = errorOf(response).details as { path: (string | number)[] }[];
    expect(issues.map((issue) => issue.path.join('.'))).toEqual(paths);
    expect((await loadStoredSettings())!.data.companyName).toBe('Modig Machine Tool');
  });

  it('400 for a body that is not JSON', async () => {
    await writeSettings();
    const response = await put('{not json', await storedEtag());
    expect(response.status).toBe(400);
    expect(errorOf(response).message).toBe('The request body must be valid JSON.');
  });

  it('404 before the seed has created them', async () => {
    const response = await put(edited, '"0x8DCE00000000000"');
    expect(response.status).toBe(404);
    expect(errorOf(response).error).toBe('not_found');
  });
});
