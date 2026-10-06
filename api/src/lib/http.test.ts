import { ApiErrorSchema, CONFLICT_MESSAGE, MachineModelSchema } from '@modig/shared';
import { describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import {
  BadRequestError,
  ConflictError,
  endpoint,
  etagHeader,
  ForbiddenError,
  json,
  NotFoundError,
  PreconditionFailedError,
  readJsonBody,
  requireIfMatch,
  type EndpointHandler,
} from './http';

const inspector = principal('sam.andersson@modig.se', ['inspector']);
const admin = principal('boss@modig.se', ['admin']);

/** Runs `handler` behind endpoint() as a signed-in inspector. */
function run(handler: EndpointHandler, req = request({ principal: inspector })) {
  return endpoint({ role: 'inspector' }, handler)(req, context());
}

describe('endpoint', () => {
  it('passes the resolved user to the handler', async () => {
    const response = await run(async (_req, _context, user) => json(200, { email: user.email }));
    expect(response).toEqual({ status: 200, jsonBody: { email: 'sam.andersson@modig.se' } });
  });

  it('answers 401 / 403 before the handler runs', async () => {
    const handler = vi.fn<EndpointHandler>();
    const adminOnly = endpoint({ role: 'admin' }, handler);
    expect((await adminOnly(request(), context())).status).toBe(401);
    expect((await adminOnly(request({ principal: inspector }), context())).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets admins through inspector endpoints', async () => {
    const response = await run(async () => json(204, null), request({ principal: admin }));
    expect(response.status).toBe(204);
  });

  it.each([
    [new BadRequestError('Nope.', [{ path: ['x'] }]), 400, 'bad_request', 'Nope.'],
    [new ForbiddenError(), 403, 'forbidden', 'You do not have access to this.'],
    [new NotFoundError('No such template.'), 404, 'not_found', 'No such template.'],
    [
      new ConflictError(),
      409,
      'conflict',
      'This already exists – reload to see the latest version.',
    ],
    [new PreconditionFailedError(), 412, 'precondition_failed', CONFLICT_MESSAGE],
  ])('maps %s to its status and ApiError body', async (error, status, code, message) => {
    const response = await run(async () => {
      throw error;
    });
    expect(response.status).toBe(status);
    expect(ApiErrorSchema.parse(response.jsonBody)).toEqual({
      error: code,
      message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  });

  it('logs unknown errors and answers 500 without leaking details', async () => {
    const ctx = context();
    const errorLog = vi.spyOn(ctx, 'error');
    const boom = new Error('secret connection string in here');
    const response = await endpoint({ role: 'inspector' }, async () => {
      throw boom;
    })(request({ principal: inspector }), ctx);

    expect(response.status).toBe(500);
    // Exactly this body: no message, stack or details from the original error.
    expect(response.jsonBody).toEqual({
      error: 'internal',
      message: 'Something went wrong on the server.',
    });
    expect(errorLog).toHaveBeenCalledWith('Unhandled error', boom);
  });
});

describe('readJsonBody', () => {
  const putModel: EndpointHandler = async (req) =>
    json(200, await readJsonBody(req, MachineModelSchema));
  const withBody = (body: string) => request({ principal: inspector, body });

  it('returns the parsed body', async () => {
    const response = await run(putModel, withBody('{"code":"RMMG","name":"RigiMill MG"}'));
    expect(response).toEqual({ status: 200, jsonBody: { code: 'RMMG', name: 'RigiMill MG' } });
  });

  it('400 for a body that is not JSON', async () => {
    const response = await run(putModel, withBody('{"code":'));
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.jsonBody).error).toBe('bad_request');
  });

  it('400 with the zod issues as details when validation fails', async () => {
    const response = await run(putModel, withBody('{"code":"RM MG"}'));
    expect(response.status).toBe(400);
    const body = ApiErrorSchema.parse(response.jsonBody);
    expect(body.error).toBe('bad_request');
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['code'] }),
        expect.objectContaining({ path: ['name'] }),
      ]),
    );
  });
});

describe('ETag helpers', () => {
  it('sets the ETag response header', () => {
    expect(json(200, {}, etagHeader('"0x8DC1"'))).toEqual({
      status: 200,
      jsonBody: {},
      headers: { ETag: '"0x8DC1"' },
    });
  });

  it('reads If-Match, undoing a proxy-weakened ETag', () => {
    expect(requireIfMatch(request({ headers: { 'If-Match': '"0x8DC1"' } }))).toBe('"0x8DC1"');
    expect(requireIfMatch(request({ headers: { 'if-match': 'W/"0x8DC1"' } }))).toBe('"0x8DC1"');
  });

  it('rejects a save without If-Match', () => {
    expect(() => requireIfMatch(request())).toThrow(BadRequestError);
  });
});
