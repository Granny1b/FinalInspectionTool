import type { TemplateSummary } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { qualityCheckHref, qualityChecksHref, templateHref } from './queries';
import { qualityCheckPositions, qualityChecksByMachine } from './qualityCheckList';

function summary(patch: Partial<TemplateSummary>): TemplateSummary {
  return {
    id: 'Tmpl000000000001',
    kind: 'final',
    name: 'Final inspection – RigiMill MG',
    modelCode: 'RMMG',
    publishedRevision: 1,
    publishedName: null,
    publishedModelCode: null,
    draftRevision: 2,
    hasUnpublishedChanges: false,
    itemCount: 0,
    updatedAt: '2026-11-05T08:00:00.000Z',
    updatedBy: 'anna@modig.se',
    ...patch,
  };
}

const front = (position: string) => ({
  position,
  operation: 'Op',
  department: 'Quality',
  documentNumber: '',
  madeBy: '',
  date: '',
});

describe('qualityCheckPositions', () => {
  it('lists the positions, a never published one as a draft', () => {
    expect(
      qualityCheckPositions([
        summary({ kind: 'quality', quality: front('QC1'), publishedRevision: null }),
        summary({ kind: 'quality', quality: front('QC4') }),
      ]),
    ).toBe('QC1 (draft), QC4');
    // Without a position, its name; without either, "Untitled".
    expect(
      qualityCheckPositions([
        summary({ kind: 'quality', name: 'Pre start up', quality: front(' ') }),
        summary({ kind: 'quality', name: '', quality: undefined }),
      ]),
    ).toBe('Pre start up, Untitled');
    expect(qualityCheckPositions([])).toBe('');
  });
});

describe('qualityChecksByMachine', () => {
  it('groups the quality checks under their machine, leaving out the final templates', () => {
    const a = summary({ id: 'Qc00000000000001', kind: 'quality', parentId: 'MachineA00000001' });
    const b = summary({ id: 'Qc00000000000002', kind: 'quality', parentId: 'MachineA00000001' });
    const c = summary({ id: 'Qc00000000000003', kind: 'quality', parentId: 'MachineB00000001' });
    const byMachine = qualityChecksByMachine([summary({}), a, b, c]);
    expect([...byMachine.keys()]).toEqual(['MachineA00000001', 'MachineB00000001']);
    expect(byMachine.get('MachineA00000001')).toEqual([a, b]);
  });
});

describe('links', () => {
  it('lead to a final template’s editor, or a quality check’s under its machine', () => {
    expect(templateHref(summary({}))).toBe('/templates/Tmpl000000000001');
    expect(
      templateHref(
        summary({ id: 'Qc00000000000001', kind: 'quality', parentId: 'M0000000000001' }),
      ),
    ).toBe('/templates/M0000000000001/quality-checks/Qc00000000000001');
    expect(qualityChecksHref('M0000000000001')).toBe('/templates/M0000000000001/quality-checks');
    expect(qualityCheckHref('M', 'Q')).toBe('/templates/M/quality-checks/Q');
  });
});
