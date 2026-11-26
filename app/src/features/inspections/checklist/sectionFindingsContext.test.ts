import type { InspectionDeviation } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { GENERAL_FINDINGS, groupFindings } from './sectionFindingsContext';

function deviation(overrides: Partial<InspectionDeviation>): InspectionDeviation {
  return {
    number: 'D-01',
    kind: 'extra',
    key: 'x1',
    itemId: null,
    sectionTitle: '',
    ref: '—',
    text: '',
    comment: '',
    severity: 'minor',
    resp: '',
    category: '',
    photos: [],
    ...overrides,
  };
}

describe('groupFindings', () => {
  it('groups the extra findings by section, the general ones apart, and leaves rows out', () => {
    const grouped = groupFindings([
      deviation({ kind: 'row', key: 'i1', itemId: 'i1', ref: '1.a' }),
      deviation({ key: 'x1', sectionId: 's1' }),
      deviation({ key: 'x2' }),
      deviation({ key: 'x3', sectionId: 's1' }),
    ]);
    expect(grouped.get('s1')?.map(({ key }) => key)).toEqual(['x1', 'x3']);
    expect(grouped.get(GENERAL_FINDINGS)?.map(({ key }) => key)).toEqual(['x2']);
    expect([...grouped.keys()]).toHaveLength(2);
  });
});
