import type * as AzureFunctions from '@azure/functions';
import { ApiErrorSchema, MeSchema } from '@modig/shared';
import { describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import { getMe } from './me';

// Record the registration instead of letting the package (in "test mode") warn about it.
// A plain array, because Vitest clears vi.fn() calls before each test.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

const callMe = (req = request()) => getMe(req, context());

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

  it('403 for a signed-in user without an app role', async () => {
    const response = await callMe(request({ principal: principal('guest@outlook.com', []) }));
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(response.jsonBody).error).toBe('forbidden');
  });

  it('200 for an inspector', async () => {
    const req = request({ principal: principal('Sam.Andersson@modig.se', ['inspector']) });
    const response = await callMe(req);
    expect(response.status).toBe(200);
    expect(MeSchema.parse(response.jsonBody)).toEqual({
      name: 'Sam Andersson',
      email: 'sam.andersson@modig.se',
      roles: ['inspector'],
    });
  });

  it('200 for an admin, with built-in roles left out', async () => {
    const response = await callMe(request({ principal: principal('boss@modig.se', ['admin']) }));
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ name: 'boss', email: 'boss@modig.se', roles: ['admin'] });
  });
});
