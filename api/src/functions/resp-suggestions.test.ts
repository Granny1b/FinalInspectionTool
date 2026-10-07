import type * as AzureFunctions from '@azure/functions';
import { RespSuggestionsSchema } from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import { resetStorage, sampleInspection, useTestStorage } from '../../test/storage';
import { syncDeviations } from '../lib/deviations';
import { getRespSuggestions } from './resp-suggestions';

// Record the registrations instead of letting the package (in "test mode") warn about them.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

beforeAll(useTestStorage);
beforeEach(resetStorage);

const get = (who = principal('sam@modig.se', ['inspector'])) =>
  getRespSuggestions(request({ principal: who }), context());

describe('GET /api/resp-suggestions', () => {
  it('registers a GET for inspectors', () => {
    expect(registrations).toEqual([
      [
        'respSuggestions',
        {
          methods: ['GET'],
          authLevel: 'anonymous',
          route: 'resp-suggestions',
          handler: getRespSuggestions,
        },
      ],
    ]);
  });

  it('401 without a client principal, 403 without an app role', async () => {
    expect((await getRespSuggestions(request(), context())).status).toBe(401);
    expect((await get(principal('x@modig.se', []))).status).toBe(403);
  });

  it('lists the Resp values of every inspection, each once', async () => {
    for (const resps of [
      ['Mechanics', 'Electrical'],
      ['mechanics ', ''],
    ]) {
      const inspection = sampleInspection();
      const ids = inspection.templateSnapshot.sections.flatMap((s) => s.items.map((i) => i.id));
      await syncDeviations({
        ...inspection,
        results: Object.fromEntries(
          resps.map((resp, index) => [ids[index]!, { status: 'NOK' as const, resp }]),
        ),
      });
    }
    const response = await get();
    expect(response.status).toBe(200);
    const suggestions = RespSuggestionsSchema.parse(response.jsonBody);
    expect(suggestions.map((value) => value.toLowerCase())).toEqual(['electrical', 'mechanics']);
  });
});
