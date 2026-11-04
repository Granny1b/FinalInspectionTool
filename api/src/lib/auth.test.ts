import { blobNames, CONTAINERS, type Person, type Role } from '@modig/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePrincipal, principal, request } from '../../test/requests';
import { resetStorage, storePeople, useTestStorage } from '../../test/storage';
import { getUser, nameFromEmail, parseClientPrincipal, resolveUser } from './auth';
import { writeJson } from './storage';

const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('parseClientPrincipal', () => {
  it('decodes a valid header', () => {
    const value = principal('sam.andersson@modig.se', ['inspector']);
    expect(parseClientPrincipal(encodePrincipal(value))).toEqual(value);
  });

  it('returns null when the header is missing or empty', () => {
    expect(parseClientPrincipal(null)).toBeNull();
    expect(parseClientPrincipal(undefined)).toBeNull();
    expect(parseClientPrincipal('')).toBeNull();
  });

  it('returns null for bad base64', () => {
    expect(parseClientPrincipal('%%% not base64 %%%')).toBeNull();
  });

  it('returns null for bad JSON', () => {
    expect(parseClientPrincipal(base64('{"userId": '))).toBeNull();
  });

  it('returns null for the wrong shape', () => {
    expect(parseClientPrincipal(base64('null'))).toBeNull();
    expect(parseClientPrincipal(base64('[]'))).toBeNull();
    expect(
      parseClientPrincipal(encodePrincipal({ userId: 'x', userDetails: 'a@b.se' })),
    ).toBeNull();
    const { userRoles: _roles, ...noRoles } = principal('a@b.se', []);
    expect(parseClientPrincipal(encodePrincipal(noRoles))).toBeNull();
    expect(
      parseClientPrincipal(encodePrincipal({ ...principal('a@b.se', []), userRoles: 'admin' })),
    ).toBeNull();
  });

  it('ignores extra fields such as claims', () => {
    const value = principal('a@b.se', ['admin']);
    expect(parseClientPrincipal(encodePrincipal({ ...value, claims: [] }))).toEqual(value);
  });

  it('decodes as UTF-8 so å/ä/ö survive', () => {
    const value = principal('åsa.öberg-ärlig@modig.se', ['inspector']);
    expect(parseClientPrincipal(encodePrincipal(value))?.userDetails).toBe(
      'åsa.öberg-ärlig@modig.se',
    );
  });
});

const listed = (email: string, name: string, role: Role): Person => ({
  email,
  name,
  role,
  addedAt: '2026-10-01T08:00:00.000Z',
  addedBy: 'boss@modig.se',
});

describe('resolveUser', () => {
  it('lowercases the email, derives the name and keeps app roles only', () => {
    expect(resolveUser(principal('Sam.Andersson@Modig.se', ['inspector']), [])).toEqual({
      email: 'sam.andersson@modig.se',
      name: 'Sam Andersson',
      roles: ['inspector'],
      invitedRoles: ['inspector'],
      userId: 'd2f3c4b5a6e7f8091a2b3c4d5e6f7081',
      identityProvider: 'aad',
    });
  });

  it('matches role names case-insensitively, like SWA does', () => {
    const user = resolveUser(principal('a@b.se', ['Admin', 'INSPECTOR']), []);
    expect(user.roles).toEqual(['inspector', 'admin']);
  });

  it('keeps Swedish letters in the name', () => {
    expect(resolveUser(principal('Åsa.Öberg@modig.se', ['inspector']), []).name).toBe('Åsa Öberg');
  });

  it('takes the name and role from the people list, matched on the lowercased email', () => {
    const people = [listed('sam.andersson@modig.se', 'Samuel Andersson', 'admin')];
    const user = resolveUser(principal(' Sam.Andersson@Modig.se ', []), people);
    expect(user).toMatchObject({
      email: 'sam.andersson@modig.se',
      name: 'Samuel Andersson',
      roles: ['admin'],
      invitedRoles: [],
    });
  });

  it("lets the list's role replace the invitation's, also downwards", () => {
    const people = [listed('boss@modig.se', 'The Boss', 'inspector')];
    const user = resolveUser(principal('boss@modig.se', ['admin']), people);
    expect(user).toMatchObject({ roles: ['inspector'], invitedRoles: ['admin'] });
  });

  it('keeps the invitation for someone not on the list', () => {
    const people = [listed('boss@modig.se', 'The Boss', 'admin')];
    const user = resolveUser(principal('sam.andersson@modig.se', ['inspector']), people);
    expect(user).toMatchObject({ name: 'Sam Andersson', roles: ['inspector'] });
  });

  it('gives no role to someone neither invited nor listed', () => {
    const people = [listed('boss@modig.se', 'The Boss', 'admin')];
    expect(resolveUser(principal('guest@outlook.com', []), people).roles).toEqual([]);
  });

  it('matches only Microsoft sign-ins against the list', () => {
    const people = [listed('boss@modig.se', 'The Boss', 'admin')];
    const github = { ...principal('boss@modig.se', []), identityProvider: 'github' };
    expect(resolveUser(github, people)).toMatchObject({ name: 'boss', roles: [] });
  });
});

describe('getUser', () => {
  beforeAll(useTestStorage);
  beforeEach(resetStorage);
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null without a principal', async () => {
    expect(await getUser(request())).toBeNull();
  });

  it('resolves the caller against the stored people list', async () => {
    await storePeople([{ email: 'sam.andersson@modig.se', name: 'Sam A.', role: 'admin' }]);
    const user = await getUser(request({ principal: principal('sam.andersson@modig.se', []) }));
    expect(user).toMatchObject({ name: 'Sam A.', roles: ['admin'] });
  });

  it('works without a people list, from the invitation alone', async () => {
    const user = await getUser(request({ principal: principal('boss@modig.se', ['admin']) }));
    expect(user).toMatchObject({ name: 'boss', roles: ['admin'] });
  });

  it('keeps the list for a few seconds, then reads it again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const req = request({ principal: principal('sam.andersson@modig.se', []) });
    await storePeople([{ email: 'sam.andersson@modig.se', name: 'Sam', role: 'inspector' }]);
    expect((await getUser(req))?.roles).toEqual(['inspector']);

    // Changed behind the cache's back, as by a save on another Functions instance.
    await writeJson(CONTAINERS.config, blobNames.people, { ...peopleDocument, people: [] });
    expect((await getUser(req))?.roles).toEqual(['inspector']);
    vi.setSystemTime(Date.now() + 5_000);
    expect((await getUser(req))?.roles).toEqual([]);
  });

  it('does not keep a failed read', async () => {
    const req = request({ principal: principal('sam.andersson@modig.se', []) });
    await writeJson(CONTAINERS.config, blobNames.people, { people: 'not a list' });
    await expect(getUser(req)).rejects.toThrow(/people\.json is invalid/);

    await writeJson(CONTAINERS.config, blobNames.people, {
      ...peopleDocument,
      people: [listed('sam.andersson@modig.se', 'Sam', 'inspector')],
    });
    expect((await getUser(req))?.roles).toEqual(['inspector']);
  });
});

const peopleDocument = {
  people: [],
  updatedAt: '2026-10-01T08:00:00.000Z',
  updatedBy: 'boss@modig.se',
};

describe('nameFromEmail', () => {
  it.each([
    ['sam.andersson@modig.se', 'Sam Andersson'],
    ['anna_karin-svensson@modig.se', 'Anna Karin Svensson'],
    ['sam..andersson@modig.se', 'Sam Andersson'],
    ['sam@modig.se', 'sam'],
    ['.sam@modig.se', '.sam'],
    ['samandersson', 'samandersson'],
    ['@modig.se', '@modig.se'],
  ])('%s → %s', (email, name) => {
    expect(nameFromEmail(email)).toBe(name);
  });
});
