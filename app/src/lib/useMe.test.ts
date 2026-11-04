import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, isNoAccess, REFUSAL_KEY } from './api';
import { fetchMe } from './useMe';

const assign = vi.fn<(url: string) => void>();
const fetchMock = vi.fn<typeof fetch>();
const storage = new Map<string, string>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { assign } });
  vi.stubGlobal('sessionStorage', {
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  storage.clear();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Resolves to 'pending' if the promise hasn't settled after the current task. */
async function settled(promise: Promise<unknown>): Promise<'pending' | 'settled'> {
  const marker = new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 20));
  return Promise.race([
    promise.then(
      () => 'settled' as const,
      () => 'settled' as const,
    ),
    marker,
  ]);
}

describe('fetchMe', () => {
  it('returns the signed-in user', async () => {
    const me = { name: 'Erik Lund', email: 'erik.lund@modig.se', roles: ['inspector'] };
    fetchMock.mockResolvedValue(json(200, me));

    await expect(fetchMe()).resolves.toEqual(me);
    expect(assign).not.toHaveBeenCalled();
  });

  it("goes to the no-access page on the API's 403, recording it so that page never bounces back", async () => {
    fetchMock.mockResolvedValue(
      json(403, { error: 'forbidden', message: "You don't have access to Final Inspection yet." }),
    );

    expect(await settled(fetchMe())).toBe('pending');
    expect(assign).toHaveBeenCalledWith('/forbidden.html');
    expect(JSON.parse(storage.get(REFUSAL_KEY)!)).toEqual({
      path: '/api/me',
      status: 403,
      at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
    });
  });

  it('still navigates when sessionStorage is blocked', async () => {
    vi.stubGlobal('sessionStorage', {
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    fetchMock.mockResolvedValue(json(403, { error: 'forbidden', message: 'No access' }));

    expect(await settled(fetchMe())).toBe('pending');
    expect(assign).toHaveBeenCalledWith('/forbidden.html');
  });

  it('throws any other failure for the account error screen', async () => {
    fetchMock.mockResolvedValue(json(500, { error: 'internal', message: 'Boom' }));

    await expect(fetchMe()).rejects.toMatchObject({ status: 500, message: 'Boom' });
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('isNoAccess', () => {
  it("is only the API's own 403", () => {
    expect(isNoAccess(new ApiRequestError(403, { error: 'forbidden', message: 'x' }))).toBe(true);
    expect(isNoAccess(new ApiRequestError(401, { error: 'unauthorized', message: 'x' }))).toBe(
      false,
    );
    expect(isNoAccess(new TypeError('Failed to fetch'))).toBe(false);
  });
});
