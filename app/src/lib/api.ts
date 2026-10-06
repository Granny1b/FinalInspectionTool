/**
 * The one way the app talks to /api. Every request goes through apiFetch so session expiry,
 * missing roles, error shapes and ETags are handled the same everywhere.
 */
import { ApiErrorSchema, CONFLICT_MESSAGE, type ApiError } from '@modig/shared';
import { FORBIDDEN_PAGE, LOGIN_PAGE } from './auth';

type ApiErrorCode = ApiError['error'];

/** Anything with a zod-style `parse`, such as the schemas in @modig/shared. */
export type Parser<T> = { parse(data: unknown): T };

export type ApiFetchOptions<T> = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Sent as JSON. */
  body?: unknown;
  /** Validates the response body; without it the data is `unknown`. */
  schema?: Parser<T>;
  /** ETag from an earlier read; the API answers 412 if the document changed since. */
  ifMatch?: string;
  signal?: AbortSignal;
};

export type ApiResponse<T> = {
  data: T;
  /** The document version, to send back as `ifMatch` when saving. */
  etag: string | null;
};

/** A non-2xx answer from the API, carrying its `ApiError` body (or a stand-in when it had none). */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(status: number, body: ApiError, options?: ErrorOptions) {
    super(body.message, options);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.error;
    this.details = body.details;
  }
}

const INVALID_JSON = Symbol('invalid JSON');

export async function apiFetch<T = unknown>(
  path: string,
  { method = 'GET', body, schema, ifMatch, signal }: ApiFetchOptions<T> = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (ifMatch) headers.set('If-Match', ifMatch);

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
    // SWA answers an expired session with a 302 to /login.html; following it would hand us
    // the login page's HTML with status 200.
    redirect: 'manual',
    signal,
  });

  if (res.type === 'opaqueredirect') return sessionEnded(method, 401);

  const payload = await readJson(res);
  const apiError = ApiErrorSchema.safeParse(payload);

  // A 401/403 without our JSON error body comes from SWA itself: the session has expired, or the
  // user is signed in without an app role. One *with* it comes from a function and is thrown for
  // the page to show. The pre-login pages send role holders straight back to '/', so navigating
  // on the API's own 401 would loop whenever the SWA gate and the API's checks disagree.
  if (!apiError.success && (res.status === 401 || res.status === 403)) {
    return sessionEnded(method, res.status);
  }

  if (!res.ok) {
    if (res.status === 412) {
      throw new ApiRequestError(412, { error: 'precondition_failed', message: CONFLICT_MESSAGE });
    }
    throw new ApiRequestError(
      res.status,
      apiError.success ? apiError.data : fallbackError(res.status),
    );
  }

  if (payload === INVALID_JSON) {
    throw new ApiRequestError(res.status, {
      error: 'internal',
      message: 'The server sent a response the app could not read.',
    });
  }
  const etag = res.headers.get('ETag');
  if (!schema) return { data: payload as T, etag };

  try {
    return { data: schema.parse(payload), etag };
  } catch (cause) {
    throw new ApiRequestError(
      res.status,
      { error: 'internal', message: 'The server sent data in an unexpected format.' },
      { cause },
    );
  }
}

/** `undefined` for an empty body (e.g. 204), INVALID_JSON for anything that isn't JSON. */
async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return INVALID_JSON;
  }
}

/** Stand-in for error responses that carry no ApiError body (gateway errors, platform 404s…). */
function fallbackError(status: number): ApiError {
  const codes: Partial<Record<number, ApiErrorCode>> = {
    400: 'bad_request',
    404: 'not_found',
    409: 'conflict',
  };
  const message =
    status >= 500
      ? 'The server ran into a problem. Please try again.'
      : `The request failed (HTTP ${status}).`;
  return { error: codes[status] ?? 'internal', message };
}

/** What a save gets when the session ended: unsaved work stays on the page, with a way back. */
export const SIGNED_OUT_MESSAGE =
  'You were signed out. Sign in again in a new tab, then try again.';
const NO_ACCESS_MESSAGE = 'Your account no longer has access to this app.';

/**
 * SWA turned the request away: the session has ended (401) or the user has no app role (403).
 * A read leaves the SPA for the static auth page; its promise never settles, because the page is
 * unloading and settling would only flash an error state on the way out. A write is thrown
 * instead: the page may hold unsaved work, whose leave warning can keep the page open, and a
 * request that never settled would then leave the save hanging for good.
 */
function sessionEnded(method: string, status: 401 | 403): Promise<never> {
  if (method !== 'GET') {
    throw status === 401
      ? new ApiRequestError(401, { error: 'unauthorized', message: SIGNED_OUT_MESSAGE })
      : new ApiRequestError(403, { error: 'forbidden', message: NO_ACCESS_MESSAGE });
  }
  window.location.assign(status === 401 ? LOGIN_PAGE : FORBIDDEN_PAGE);
  return new Promise<never>(() => {});
}
