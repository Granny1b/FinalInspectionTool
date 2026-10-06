import { CONFLICT_MESSAGE, MeSchema } from '@modig/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiRequestError } from './api';
import { shouldRetry } from './queryClient';

const assign = vi.fn<(url: string) => void>();
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { location: { assign } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** What fetch returns for a 3xx under `redirect: 'manual'`; it can't be built with `new Response`. */
function opaqueRedirect(): Response {
  const res = new Response(null);
  Object.defineProperties(res, { type: { value: 'opaqueredirect' }, status: { value: 0 } });
  return res;
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

const me = { name: 'Sam', email: 'sam@modig.se', roles: ['admin'] };

describe('apiFetch', () => {
  it('validates the body with the schema and exposes the ETag', async () => {
    fetchMock.mockResolvedValue(json(200, me, { ETag: '"0x8D1"' }));

    const result = await apiFetch('/api/me', { schema: MeSchema });

    expect(result).toEqual({ data: me, etag: '"0x8D1"' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/me');
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'same-origin' });
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
  });

  it('sends a JSON body and If-Match when saving', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await apiFetch('/api/templates/abc', {
      method: 'PUT',
      body: { name: 'RigiMill MG' },
      ifMatch: '"0x8D1"',
    });

    expect(result).toEqual({ data: undefined, etag: null });
    const init = fetchMock.mock.calls[0]![1]!;
    const headers = new Headers(init.headers);
    expect(init.body).toBe('{"name":"RigiMill MG"}');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('If-Match')).toBe('"0x8D1"');
  });

  it('sends an expired session (SWA redirect) to the login page and never settles', async () => {
    fetchMock.mockResolvedValue(opaqueRedirect());

    expect(await settled(apiFetch('/api/me'))).toBe('pending');
    expect(assign).toHaveBeenCalledWith('/login.html');
  });

  it("sends SWA's own 401 (no ApiError body) to the login page", async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));

    expect(await settled(apiFetch('/api/me'))).toBe('pending');
    expect(assign).toHaveBeenCalledWith('/login.html');
  });

  it("throws the API's own 401 instead of navigating (no loop via the login page)", async () => {
    fetchMock.mockResolvedValue(json(401, { error: 'unauthorized', message: 'Please sign in.' }));

    await expect(apiFetch('/api/me')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 401,
      code: 'unauthorized',
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends SWA's own 403 (no app role) to the forbidden page", async () => {
    fetchMock.mockResolvedValue(new Response('<!doctype html>', { status: 403 }));

    expect(await settled(apiFetch('/api/me'))).toBe('pending');
    expect(assign).toHaveBeenCalledWith('/forbidden.html');
  });

  it("throws the API's own 403 so the page can explain it", async () => {
    fetchMock.mockResolvedValue(json(403, { error: 'forbidden', message: 'Admins only' }));

    await expect(apiFetch('/api/insights')).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 403,
      code: 'forbidden',
      message: 'Admins only',
    });
    expect(assign).not.toHaveBeenCalled();
  });

  it('turns 412 into the shared conflict message', async () => {
    fetchMock.mockResolvedValue(
      json(412, { error: 'precondition_failed', message: 'ETag mismatch' }),
    );

    await expect(apiFetch('/api/templates/abc', { method: 'PUT', body: {} })).rejects.toMatchObject(
      {
        status: 412,
        code: 'precondition_failed',
        message: CONFLICT_MESSAGE,
      },
    );
  });

  it('carries the ApiError body of other failures', async () => {
    fetchMock.mockResolvedValue(
      json(400, { error: 'bad_request', message: 'Name is required', details: ['name'] }),
    );

    const error = await apiFetch('/api/templates', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 400, code: 'bad_request', details: ['name'] });
  });

  it('describes failures that have no ApiError body', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));

    await expect(apiFetch('/api/me')).rejects.toMatchObject({ status: 502, code: 'internal' });
  });

  it('rejects a 2xx that is not JSON (e.g. an HTML page)', async () => {
    fetchMock.mockResolvedValue(new Response('<!doctype html>', { status: 200 }));

    await expect(apiFetch('/api/me', { schema: MeSchema })).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('rejects data that does not match the schema', async () => {
    fetchMock.mockResolvedValue(json(200, { name: 'Sam' }));

    await expect(apiFetch('/api/me', { schema: MeSchema })).rejects.toMatchObject({
      code: 'internal',
      message: 'The server sent data in an unexpected format.',
    });
  });
});

describe('shouldRetry', () => {
  it('never retries client errors', () => {
    const notFound = new ApiRequestError(404, { error: 'not_found', message: 'Not found' });
    expect(shouldRetry(0, notFound)).toBe(false);
  });

  it('retries server and network errors twice', () => {
    const serverError = new ApiRequestError(500, { error: 'internal', message: 'Oops' });
    expect(shouldRetry(0, serverError)).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(2, serverError)).toBe(false);
  });
});
