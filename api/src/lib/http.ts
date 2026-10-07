/**
 * The small wrapper every function uses: resolve the caller, check the role, run the handler and
 * turn errors into `ApiError` JSON. Handlers report expected failures by throwing an HttpError
 * subclass; anything else is logged and answered with a bare 500 (no stack traces to clients).
 */
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CONFLICT_MESSAGE, hasRole, IdSchema, type ApiError, type Role } from '@modig/shared';
import type { z } from 'zod';
import { getUser, type User } from './auth';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiError['error'],
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(400, 'bad_request', message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor() {
    super(401, 'unauthorized', 'Please sign in.');
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'You do not have access to this.') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found.') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'This already exists – reload to see the latest version.') {
    super(409, 'conflict', message);
  }
}

/** ETag mismatch on save: someone else saved in between (brief §3). */
export class PreconditionFailedError extends HttpError {
  constructor() {
    super(412, 'precondition_failed', CONFLICT_MESSAGE);
  }
}

/** A storage step failed before anything changed: the client can send the same request again. */
export class ServiceUnavailableError extends HttpError {
  constructor(message: string) {
    super(503, 'unavailable', message);
  }
}

export type EndpointHandler = (
  req: HttpRequest,
  context: InvocationContext,
  user: User,
) => Promise<HttpResponseInit>;

/** What `app.http()` gets as its handler. */
type Endpoint = (req: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

/** `role` is the minimum role: admins pass every `inspector` check (see `hasRole`). */
export function endpoint(options: { role: Role }, handler: EndpointHandler): Endpoint {
  return async (req, context) => {
    try {
      // Re-checked here although SWA route rules gate /api/* too (defence in depth).
      const user = getUser(req);
      if (!user) throw new UnauthorizedError();
      if (!hasRole(user.roles, options.role)) throw new ForbiddenError();
      return await handler(req, context, user);
    } catch (error) {
      return errorResponse(error, context);
    }
  };
}

function errorResponse(error: unknown, context: InvocationContext): HttpResponseInit {
  if (error instanceof HttpError) {
    const { status, code, message, details } = error;
    return json(status, { error: code, message, details } satisfies ApiError);
  }
  context.error('Unhandled error', error);
  return json(500, {
    error: 'internal',
    message: 'Something went wrong on the server.',
  } satisfies ApiError);
}

export function json(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): HttpResponseInit {
  return { status, jsonBody: body, headers };
}

/** Parses and validates the JSON body; anything else is a 400 with the zod issues as details. */
export async function readJsonBody<T>(req: HttpRequest, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new BadRequestError('The request body must be valid JSON.');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestError('The request body is invalid.', result.error.issues);
  }
  return result.data;
}

/** The `{id}` route parameter. Only well-formed ids get near a blob path. */
export function idParam(req: HttpRequest): string {
  const result = IdSchema.safeParse(req.params.id);
  if (!result.success) throw new BadRequestError('The id in the URL is not valid.');
  return result.data;
}

/** Response header carrying a document's blob ETag; the client sends it back as If-Match. */
export function etagHeader(etag: string): Record<string, string> {
  return { ETag: etag };
}

/** Every save is conditional (brief §3), so a missing If-Match is a client bug, not "overwrite". */
export function requireIfMatch(req: HttpRequest): string {
  const value = req.headers.get('if-match')?.trim();
  if (!value) throw new BadRequestError('The If-Match header is required.');
  // Proxies that compress responses may weaken the ETag; the blob only knows the strong form.
  const etag = value.startsWith('W/') ? value.slice(2) : value;
  // One ETag from an earlier read: "*" or a list would let a save skip the version check.
  if (etag === '*' || etag.includes(',')) {
    throw new BadRequestError('If-Match must be the ETag from an earlier read.');
  }
  return etag;
}
