import { describe, expect, it } from 'vitest';
import { appRoles, hasRole, isRole } from './roles';

describe('roles', () => {
  it('admin implies inspector', () => {
    expect(hasRole(['authenticated', 'admin'], 'inspector')).toBe(true);
    expect(hasRole(['authenticated', 'admin'], 'admin')).toBe(true);
  });

  it('inspector is not admin', () => {
    expect(hasRole(['inspector'], 'inspector')).toBe(true);
    expect(hasRole(['inspector'], 'admin')).toBe(false);
  });

  it('built-in SWA roles grant nothing', () => {
    expect(hasRole(['anonymous', 'authenticated'], 'inspector')).toBe(false);
    expect(appRoles(['anonymous', 'authenticated', 'admin'])).toEqual(['admin']);
  });

  it('recognises app roles only', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('authenticated')).toBe(false);
  });
});
