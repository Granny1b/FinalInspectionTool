import { describe, expect, it } from 'vitest';
import { encodePrincipal, principal, request } from '../../test/requests';
import { getUser, nameFromEmail, parseClientPrincipal } from './auth';

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

describe('getUser', () => {
  it('returns null without a principal', () => {
    expect(getUser(request())).toBeNull();
  });

  it('lowercases the email, derives the name and keeps app roles only', () => {
    const req = request({ principal: principal('Sam.Andersson@Modig.se', ['inspector']) });
    expect(getUser(req)).toEqual({
      email: 'sam.andersson@modig.se',
      name: 'Sam Andersson',
      roles: ['inspector'],
      userId: 'd2f3c4b5a6e7f8091a2b3c4d5e6f7081',
      identityProvider: 'aad',
    });
  });

  it('matches role names case-insensitively, like SWA does', () => {
    const req = request({ principal: principal('a@b.se', ['Admin', 'INSPECTOR']) });
    expect(getUser(req)?.roles).toEqual(['inspector', 'admin']);
  });

  it('keeps Swedish letters in the name', () => {
    const req = request({ principal: principal('Åsa.Öberg@modig.se', ['inspector']) });
    expect(getUser(req)?.name).toBe('Åsa Öberg');
  });
});

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
