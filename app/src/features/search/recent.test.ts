import { describe, expect, it } from 'vitest';
import { recentKindOf } from './recent';

describe('recentKindOf', () => {
  it('knows the pages worth coming back to', () => {
    expect(recentKindOf('/machines/abc123')).toBe('machine');
    expect(recentKindOf('/machines/abc123/assembly/def456')).toBe('machine-assembly');
    expect(recentKindOf('/assembly/abc123')).toBe('instruction');
    expect(recentKindOf('/assembly/abc123/revisions/2')).toBe('instruction');
    expect(recentKindOf('/inspections/abc123')).toBe('final');
    expect(recentKindOf('/quality-checks/abc123')).toBe('quality');
    expect(recentKindOf('/templates/abc123')).toBe('template');
    expect(recentKindOf('/templates/abc123/quality-checks/def456')).toBe('template');
  });

  it('leaves lists, forms and admin pages out', () => {
    for (const path of [
      '/machines',
      '/machines/new',
      '/assembly',
      '/inspections/new',
      '/settings',
    ]) {
      expect(recentKindOf(path), path).toBeNull();
    }
  });
});
