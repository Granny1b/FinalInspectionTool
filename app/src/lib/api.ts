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
  /** Instead of `ifMatch` when the read found no document: create it, 412 if one appeared. */
  ifNoneMatch?: '*';
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
  { method = 'GET', body, schema, ifMatch, ifNoneMatch, signal }: ApiFetchOptions<T> = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  if (ifMatch) headers.set('If-Match', ifMatch);
  if (ifNoneMatch) headers.set('If-None-Match', ifNoneMatch);

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

  if (res.type === 'opaqueredirect') return sessionEnded(method, 401, path);

  const payload = await readJson(res);
  const apiError = ApiErrorSchema.safeParse(payload);

  // A 401/403 without our JSON error body comes from SWA itself: the session has expired, or
  // something in front of the API refused. One *with* it comes from a function and is thrown for
  // the page to show (useMe sends the API's "no access" 403 to the no-access page itself). The
  // pre-login pages send anyone the API lets in straight back to '/', so navigating on the API's
  // own 401 would loop whenever the SWA gate and the API's checks disagree.
  if (!apiError.success && (res.status === 401 || res.status === 403)) {
    return sessionEnded(method, res.status, path);
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

/**
 * A file from the API (a CSV export), with the name its Content-Disposition gives. Errors, an
 * ended session and a missing role are handled as for `apiFetch`.
 */
export async function apiDownload(
  path: string,
  { signal }: { signal?: AbortSignal } = {},
): Promise<{ blob: Blob; fileName: string | null }> {
  const res = await fetch(path, { credentials: 'same-origin', redirect: 'manual', signal });
  if (res.type === 'opaqueredirect') return sessionEnded('GET', 401, path);
  if (!res.ok) {
    const apiError = ApiErrorSchema.safeParse(await readJson(res));
    if (!apiError.success && (res.status === 401 || res.status === 403)) {
      return sessionEnded('GET', res.status, path);
    }
    throw new ApiRequestError(
      res.status,
      apiError.success ? apiError.data : fallbackError(res.status),
    );
  }
  const fileName = dispositionFileName(res.headers.get('Content-Disposition') ?? '');
  return { blob: await res.blob(), fileName };
}

/**
 * The file name a Content-Disposition gives: its `filename*` (UTF-8, percent-encoded, for names
 * such as "Quality check deviations …, Före start.csv") when it has one, else its `filename`.
 */
export function dispositionFileName(disposition: string): string | null {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      // Not valid percent-encoding: the plain name below.
    }
  }
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? null;
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

/** 404, or 400 for an id that can't exist: either way there is nothing at this address. */
export function isMissing(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 404 || error.status === 400);
}

export function isConflict(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 412;
}

/** What to tell the user when a request failed (apiFetch already words a 412 as a conflict). */
export function errorMessage(error: unknown): string {
  return error instanceof ApiRequestError
    ? error.message
    : "Couldn't reach the server. Check your connection and try again.";
}

/** What a save gets when the session ended: unsaved work stays on the page, with a way back. */
export const SIGNED_OUT_MESSAGE =
  'You were signed out. Sign in again in a new tab, then try again.';
const NO_ACCESS_MESSAGE = 'Your account no longer has access to this app.';

/**
 * SWA turned the request away: the session has ended (401) or something in front of the API
 * refused it (403). A read leaves the SPA for the static auth page; its promise never settles,
 * because the page is unloading and settling would only flash an error state on the way out. A
 * write is thrown instead: the page may hold unsaved work, whose leave warning can keep the page
 * open, and a request that never settled would then leave the save hanging for good.
 */
function sessionEnded(method: string, status: 401 | 403, path: string): Promise<never> {
  if (method !== 'GET') {
    throw status === 401
      ? new ApiRequestError(401, { error: 'unauthorized', message: SIGNED_OUT_MESSAGE })
      : new ApiRequestError(403, { error: 'forbidden', message: NO_ACCESS_MESSAGE });
  }
  return leaveFor(status === 401 ? LOGIN_PAGE : FORBIDDEN_PAGE, { path, status });
}

/**
 * The API's 403 for /api/me: this sign-in has no role at all (not on the people list, not
 * invited). Anything else, such as an inspector asking for an admin endpoint, stays in the app.
 */
export function isNoAccess(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403 && error.code === 'forbidden';
}

/**
 * Off to the no-access page, which says who is signed in and how to get access. Like a refused
 * read, the promise never settles: the app is unloading.
 */
export function leaveForNoAccess(path: string): Promise<never> {
  return leaveFor(FORBIDDEN_PAGE, { path, status: 403 });
}

function leaveFor(page: string, refused: Omit<Refusal, 'at'>): Promise<never> {
  recordRefusal({ ...refused, at: new Date().toISOString() });
  window.location.assign(page);
  return new Promise<never>(() => {});
}

/**
 * Read by the pre-login pages (public/login-assets/auth.js), which send anyone the API lets in
 * straight back into the app. If the app was refused although the API lets the sign-in in (or
 * the two disagree for a moment, as when a person was just added or removed), they would bounce
 * between each other; with this record the page stays and says which request was refused, so the
 * cause can be seen instead of guessed. The app records one before every trip to those pages.
 */
export const REFUSAL_KEY = 'auth.refused';
export type Refusal = { path: string; status: number; at: string };

function recordRefusal(refusal: Refusal): void {
  try {
    sessionStorage.setItem(REFUSAL_KEY, JSON.stringify(refusal));
  } catch {
    // Storage blocked: the pre-login page then behaves as before.
  }
}
