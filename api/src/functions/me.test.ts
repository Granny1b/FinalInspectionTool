import type * as AzureFunctions from '@azure/functions';
import { ApiErrorSchema, MeSchema } from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import { resetStorage, storePeople, useTestStorage } from '../../test/storage';
import { NO_ACCESS_MESSAGE } from '../lib/http';
import { getMe } from './me';

// Record the registration instead of letting the package (in "test mode") warn about it.
// A plain array, because Vitest clears vi.fn() calls before each test.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

const callMe = (req = request()) => getMe(req, context());

beforeAll(useTestStorage);
beforeEach(resetStorage);

describe('GET /api/me', () => {
  it('is registered as GET /api/me with SWA doing authentication', () => {
    expect(registrations).toEqual([
      ['me', { methods: ['GET'], authLevel: 'anonymous', route: 'me', handler: getMe }],
    ]);
  });

  it('401 without a client principal', async () => {
    const response = await callMe();
    expect(response.status).toBe(401);
    expect(ApiErrorSchema.parse(response.jsonBody).error).toBe('unauthorized');
  });

  it('403 with the no-access message for a sign-in neither invited nor on the list', async () => {
    await storePeople([{ email: 'boss@modig.se', name: 'The Boss', role: 'admin' }]);
    const response = await callMe(request({ principal: principal('guest@outlook.com', []) }));
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(response.jsonBody)).toEqual({
      error: 'forbidden',
      message: NO_ACCESS_MESSAGE,
    });
  });

  it('200 for an invited inspector, named from the email', async () => {
    const req = request({ principal: principal('Sam.Andersson@modig.se', ['inspector']) });
    const response = await callMe(req);
    expect(response.status).toBe(200);
    expect(MeSchema.parse(response.jsonBody)).toEqual({
      name: 'Sam Andersson',
      email: 'sam.andersson@modig.se',
      roles: ['inspector'],
    });
  });

  it('200 for an invited admin, with built-in roles left out', async () => {
    const response = await callMe(request({ principal: principal('boss@modig.se', ['admin']) }));
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ name: 'boss', email: 'boss@modig.se', roles: ['admin'] });
  });

  it('200 with the name and role from the people list, without any invitation', async () => {
    await storePeople([{ email: 'erik.lund@modig.se', name: 'Erik Lund', role: 'inspector' }]);
    const response = await callMe(request({ principal: principal('Erik.Lund@modig.se', []) }));
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({
      name: 'Erik Lund',
      email: 'erik.lund@modig.se',
      roles: ['inspector'],
    });
  });

  it("uses the list's name for an invited admin who is on it too", async () => {
    await storePeople([{ email: 'boss@modig.se', name: 'Birgitta Boss', role: 'admin' }]);
    const response = await callMe(request({ principal: principal('boss@modig.se', ['admin']) }));
    expect(response.jsonBody).toEqual({
      name: 'Birgitta Boss',
      email: 'boss@modig.se',
      roles: ['admin'],
    });
  });
});
