import type * as AzureFunctions from '@azure/functions';
import { ApiErrorSchema, SettingsSchema } from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import { resetStorage, useTestStorage, writeSettings } from '../../test/storage';
import { getSettings } from './settings';

// Record the registration instead of letting the package (in "test mode") warn about it.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

const inspector = principal('sam.andersson@modig.se', ['inspector']);

beforeAll(useTestStorage);
beforeEach(resetStorage);

describe('GET /api/settings', () => {
  it('is registered as GET /api/settings', () => {
    expect(registrations).toEqual([
      [
        'settings',
        { methods: ['GET'], authLevel: 'anonymous', route: 'settings', handler: getSettings },
      ],
    ]);
  });

  it('401 without a client principal, 403 without an app role', async () => {
    expect((await getSettings(request(), context())).status).toBe(401);
    const guest = request({ principal: principal('guest@outlook.com', []) });
    expect((await getSettings(guest, context())).status).toBe(403);
  });

  it('returns the settings to an inspector', async () => {
    const settings = await writeSettings();
    const response = await getSettings(request({ principal: inspector }), context());
    expect(response.status).toBe(200);
    expect(SettingsSchema.parse(response.jsonBody)).toEqual(settings);
  });

  it('404 before the seed has created them', async () => {
    const response = await getSettings(request({ principal: inspector }), context());
    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.jsonBody).error).toBe('not_found');
  });
});
