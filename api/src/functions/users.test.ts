import type * as AzureFunctions from '@azure/functions';
import type { HttpHandler, HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONFLICT_MESSAGE,
  CONTAINERS,
  PeopleDirectorySchema,
  PeopleSchema,
  type ApiError,
  type PeopleInput,
} from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientPrincipal } from '../lib/auth';
import { ConflictError } from '../lib/http';
import { writePeople } from '../lib/people';
import { readJson } from '../lib/storage';
import { context, principal, request } from '../../test/requests';
import { resetStorage, storePeople, useTestStorage } from '../../test/storage';
import { getMe } from './me';
import { getPeople, getUsers, saveUsers } from './users';

// Record the registrations instead of letting the package (in "test mode") warn about them.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

/** Invited through Static Web Apps, not on the list: how the first admin starts. */
const invitedAdmin = principal('Boss@Modig.se', ['admin']);
const inspector = principal('sam.andersson@modig.se', ['inspector']);

beforeAll(useTestStorage);
beforeEach(resetStorage);

const etagOf = (response: HttpResponseInit) => new Headers(response.headers).get('ETag');
const errorOf = (response: HttpResponseInit): ApiError => ApiErrorSchema.parse(response.jsonBody);
const stored = () => readJson(CONTAINERS.config, blobNames.people, PeopleSchema);

function get(who: ClientPrincipal = invitedAdmin) {
  return getUsers(request({ principal: who }), context());
}

function put(body: unknown, headers: Record<string, string>, who: ClientPrincipal = invitedAdmin) {
  return saveUsers(request({ principal: who, body: JSON.stringify(body), headers }), context());
}

const FIRST = { 'If-None-Match': '*' };

const boss = { email: 'boss@modig.se', name: 'Birgitta Boss', role: 'admin' } as const;
const sam = { email: 'sam.andersson@modig.se', name: 'Sam Andersson', role: 'inspector' } as const;
const erik = { email: 'erik.lund@modig.se', name: 'Erik Lund', role: 'inspector' } as const;

describe('registration', () => {
  const registered = (name: string) => {
    const found = registrations.find(([registeredName]) => registeredName === name);
    return found?.[1] as { methods: string[]; route: string; handler: HttpHandler } | undefined;
  };

  it('registers /api/users (GET and PUT) and /api/people, SWA doing authentication', () => {
    // Leaving out GET /api/me, which these tests import too.
    const own = registrations.filter(([name]) => name !== 'me');
    expect(own).toEqual([
      [
        'users',
        {
          methods: ['GET', 'PUT'],
          authLevel: 'anonymous',
          route: 'users',
          handler: expect.any(Function),
        },
      ],
      ['people', { methods: ['GET'], authLevel: 'anonymous', route: 'people', handler: getPeople }],
    ]);
  });

  it('dispatches by method', async () => {
    const users = registered('users')!.handler;
    const getAnswer = await users(request({ principal: invitedAdmin }), context());
    expect(getAnswer).toMatchObject({ status: 200, jsonBody: { people: [] } });
    const putRequest = request({
      principal: invitedAdmin,
      body: JSON.stringify({ people: [boss] }),
      headers: FIRST,
    });
    expect((await users(putRequest, context())).status).toBe(200);
  });
});

describe.each([
  ['GET /api/users', getUsers],
  ['PUT /api/users', saveUsers],
])('%s access', (_name, handler) => {
  it('401 without a client principal', async () => {
    expect((await handler(request(), context())).status).toBe(401);
  });

  it('403 for an inspector, also one made inspector by the list', async () => {
    expect((await handler(request({ principal: inspector }), context())).status).toBe(403);
    await storePeople([boss, { ...erik, role: 'inspector' }]);
    const listed = request({ principal: principal('erik.lund@modig.se', ['admin']) });
    expect((await handler(listed, context())).status).toBe(403);
  });
});

describe('GET /api/users', () => {
  it('is an empty list without an ETag before anyone was added', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({ people: [] });
    expect(etagOf(response)).toBeNull();
  });

  it('returns the stored list and its ETag', async () => {
    const { data, etag } = await storePeople([boss, sam]);
    const response = await get();
    expect(response.status).toBe(200);
    expect(PeopleSchema.parse(response.jsonBody)).toEqual(data);
    expect(etagOf(response)).toBe(etag);
  });

  it('is open to an admin who is on the list without any invitation', async () => {
    await storePeople([boss]);
    const response = await get(principal('boss@modig.se', []));
    expect(response.status).toBe(200);
  });
});

describe('PUT /api/users', () => {
  it('saves the first list with If-None-Match: *, filling in who added each person and when', async () => {
    const before = Date.now();
    const response = await put(
      { people: [boss, { ...sam, email: ' Sam.Andersson@Modig.se ' }] },
      FIRST,
    );

    expect(response.status).toBe(200);
    const saved = PeopleSchema.parse(response.jsonBody);
    expect(saved.people).toEqual([
      { ...boss, addedAt: saved.updatedAt, addedBy: 'boss@modig.se' },
      { ...sam, addedAt: saved.updatedAt, addedBy: 'boss@modig.se' },
    ]);
    expect(saved.updatedBy).toBe('boss@modig.se');
    expect(Date.parse(saved.updatedAt)).toBeGreaterThanOrEqual(before);
    const blob = await stored();
    expect(blob?.data).toEqual(saved);
    expect(etagOf(response)).toBe(blob?.etag);
  });

  it('keeps addedAt and addedBy of people already on the list, and their new name and role', async () => {
    const { etag } = await storePeople([boss, sam]);
    const response = await put(
      { people: [boss, { ...sam, name: 'Samuel Andersson', role: 'admin' }, erik] },
      { 'If-Match': etag },
    );

    expect(response.status).toBe(200);
    const saved = PeopleSchema.parse(response.jsonBody);
    expect(saved.people).toEqual([
      { ...boss, addedAt: '2026-10-01T08:00:00.000Z', addedBy: 'boss@modig.se' },
      {
        ...sam,
        name: 'Samuel Andersson',
        role: 'admin',
        addedAt: '2026-10-01T08:00:00.000Z',
        addedBy: 'boss@modig.se',
      },
      { ...erik, addedAt: saved.updatedAt, addedBy: 'boss@modig.se' },
    ]);
    expect(etagOf(response)).not.toBe(etag);
  });

  it('sets addedAt again for someone removed and added back', async () => {
    const first = await storePeople([boss, sam]);
    const removed = await put({ people: [boss] }, { 'If-Match': first.etag });
    const back = await put({ people: [boss, sam] }, { 'If-Match': etagOf(removed)! });
    const saved = PeopleSchema.parse(back.jsonBody);
    expect(saved.people[1]?.addedAt).toBe(saved.updatedAt);
  });

  it('lets a person added just now in at once, by name', async () => {
    const response = await put({ people: [boss, erik] }, FIRST);
    expect(response.status).toBe(200);
    // Same Functions instance: the save cleared its cache of the list.
    const me = await getMe(request({ principal: principal('erik.lund@modig.se', []) }), context());
    expect(me).toMatchObject({
      status: 200,
      jsonBody: { name: 'Erik Lund', roles: ['inspector'] },
    });
  });

  it('takes access away at once from someone removed', async () => {
    const { etag } = await storePeople([boss, erik]);
    const erikRequest = () => request({ principal: principal('erik.lund@modig.se', []) });
    expect((await getMe(erikRequest(), context())).status).toBe(200);
    expect((await put({ people: [boss] }, { 'If-Match': etag })).status).toBe(200);
    expect((await getMe(erikRequest(), context())).status).toBe(403);
  });

  describe('versions', () => {
    it('412 for a stale If-Match, with nothing changed', async () => {
      const { etag } = await storePeople([boss]);
      await storePeople([boss, sam]);
      const response = await put({ people: [boss, erik] }, { 'If-Match': etag });
      expect(response.status).toBe(412);
      expect(errorOf(response)).toEqual({
        error: 'precondition_failed',
        message: CONFLICT_MESSAGE,
      });
      expect((await stored())?.data.people.map((person) => person.email)).toEqual([
        boss.email,
        sam.email,
      ]);
    });

    it('412 for If-None-Match: * once another admin has saved a list', async () => {
      await storePeople([boss]);
      const response = await put({ people: [boss, erik] }, FIRST);
      expect(response.status).toBe(412);
      expect(errorOf(response).error).toBe('precondition_failed');
    });

    it('412 for an If-Match when there is no list (it was never there, or was removed)', async () => {
      const response = await put({ people: [boss] }, { 'If-Match': '"0x8DC1"' });
      expect(response.status).toBe(412);
      expect(await stored()).toBeNull();
    });

    it.each([
      ['neither header', {}],
      ['both headers', { 'If-Match': '"0x8DC1"', 'If-None-Match': '*' }],
      ['If-None-Match other than *', { 'If-None-Match': '"0x8DC1"' }],
      ['If-Match: *', { 'If-Match': '*' }],
    ])('400 for %s', async (_what, headers) => {
      const response = await put({ people: [boss] }, headers);
      expect(response.status).toBe(400);
      expect(errorOf(response).error).toBe('bad_request');
      expect(await stored()).toBeNull();
    });

    it('a first write that loses the race fails its condition in storage too', async () => {
      // What saveUsers turns into a 412 when another admin's first list lands in between.
      await storePeople([boss]);
      const document = { people: [], updatedAt: new Date().toISOString(), updatedBy: 'x' };
      await expect(writePeople(document, { ifNoneMatch: '*' })).rejects.toBeInstanceOf(
        ConflictError,
      );
    });
  });

  describe('body', () => {
    it.each<[string, unknown]>([
      ['not a list', { people: 'boss@modig.se' }],
      [
        'a duplicate email (ignoring case)',
        { people: [boss, { ...boss, email: 'BOSS@modig.se' }] },
      ],
      ['a bad email', { people: [boss, { ...sam, email: 'sam' }] }],
      ['an empty name', { people: [boss, { ...sam, name: '  ' }] }],
      ['an unknown role', { people: [boss, { ...sam, role: 'owner' }] }],
    ])('400 for %s', async (_what, body) => {
      const response = await put(body, FIRST);
      expect(response.status).toBe(400);
      expect(errorOf(response)).toMatchObject({ error: 'bad_request', details: expect.any(Array) });
      expect(await stored()).toBeNull();
    });
  });

  describe('lockout rules', () => {
    const listedBoss = principal('boss@modig.se', []);

    it('400 when an admin on the list takes away their own admin role', async () => {
      const { etag } = await storePeople([boss, { ...sam, role: 'admin' }]);
      const response = await put(
        {
          people: [
            { ...boss, role: 'inspector' },
            { ...sam, role: 'admin' },
          ],
        },
        { 'If-Match': etag },
        listedBoss,
      );
      expect(response.status).toBe(400);
      expect(errorOf(response).message).toBe(
        "You can't take away your own admin role. Ask another admin to change it.",
      );
    });

    it('400 when an admin on the list (not invited) removes themselves', async () => {
      const { etag } = await storePeople([boss, { ...sam, role: 'admin' }]);
      const response = await put(
        { people: [{ ...sam, role: 'admin' }] },
        { 'If-Match': etag },
        listedBoss,
      );
      expect(response.status).toBe(400);
      expect(errorOf(response).message).toMatch(/^You can't remove yourself/);
    });

    it('400 when an invited admin puts themselves on the list as inspector', async () => {
      const response = await put(
        {
          people: [
            { ...boss, role: 'inspector' },
            { ...sam, role: 'admin' },
          ],
        },
        FIRST,
      );
      expect(response.status).toBe(400);
      expect(errorOf(response).message).toMatch(/own admin role/);
    });

    it('lets an invited admin take themselves off the list: the invitation still counts', async () => {
      const { etag } = await storePeople([boss, { ...sam, role: 'admin' }]);
      const response = await put({ people: [{ ...sam, role: 'admin' }] }, { 'If-Match': etag });
      expect(response.status).toBe(200);
    });

    it('400 for people without any admin among them', async () => {
      const response = await put({ people: [sam, erik] }, FIRST);
      expect(response.status).toBe(400);
      expect(errorOf(response).message).toBe(
        'The list needs at least one admin. Add yourself as an admin first.',
      );
      expect(await stored()).toBeNull();
    });

    it('lets an invited admin empty the list', async () => {
      const { etag } = await storePeople([boss, sam]);
      const response = await put({ people: [] }, { 'If-Match': etag });
      expect(response.status).toBe(200);
      expect(PeopleSchema.parse(response.jsonBody).people).toEqual([]);
    });

    it("checks the caller's role after the change, not the people's", async () => {
      // Another admin may be demoted, as long as one is left.
      const { etag } = await storePeople([boss, { ...sam, role: 'admin' }]);
      const body: PeopleInput = { people: [boss, sam] };
      expect((await put(body, { 'If-Match': etag }, listedBoss)).status).toBe(200);
    });
  });
});

describe('GET /api/people', () => {
  const call = (who: ClientPrincipal) => getPeople(request({ principal: who }), context());

  it('is empty before anyone was added', async () => {
    expect(await call(inspector)).toMatchObject({ status: 200, jsonBody: [] });
  });

  it('gives inspectors the name of everyone on the list, by email', async () => {
    await storePeople([boss, sam]);
    const response = await call(inspector);
    expect(response.status).toBe(200);
    expect(PeopleDirectorySchema.parse(response.jsonBody)).toEqual([
      { email: 'boss@modig.se', name: 'Birgitta Boss' },
      { email: 'sam.andersson@modig.se', name: 'Sam Andersson' },
    ]);
  });

  it('401 without a principal, 403 for a sign-in without any role', async () => {
    expect((await getPeople(request(), context())).status).toBe(401);
    expect((await call(principal('guest@outlook.com', []))).status).toBe(403);
  });
});
