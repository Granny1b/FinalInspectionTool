import type { FinaliseIssue } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { extraIssues, FRONT_FIELD_IDS, frontIssues, issueTarget } from './issues';

const issues: FinaliseIssue[] = [
  {
    target: { kind: 'front', field: 'serialNumber' },
    message: 'The front page needs a serial number.',
  },
  {
    target: { kind: 'row', sectionId: 'Sect000000000001', itemId: 'Item000000000001' },
    message: 'Row 1.a has no status.',
  },
  {
    target: { kind: 'extra', extraId: 'Extr000000000001' },
    message: 'Deviation D-02 needs a description.',
  },
];

describe('issueTarget', () => {
  it('sends a front-page problem to its field, at the top of the Checklist tab', () => {
    expect(issueTarget({ kind: 'front', field: 'machineName' })).toEqual({
      tab: 'checklist',
      elementId: FRONT_FIELD_IDS.machineName,
    });
  });

  it('sends a row to the checklist sheet’s row element', () => {
    expect(
      issueTarget({ kind: 'row', sectionId: 'Sect000000000001', itemId: 'Item000000000001' }),
    ).toEqual({
      tab: 'checklist',
      elementId: 'row-Item000000000001',
    });
  });

  it('sends an extra deviation to its description in the Deviations tab', () => {
    expect(issueTarget({ kind: 'extra', extraId: 'Extr000000000001' })).toEqual({
      tab: 'deviations',
      elementId: 'extra-Extr000000000001-description',
    });
  });
});

describe('issues by place', () => {
  it('picks the front-page messages by field', () => {
    expect(frontIssues(issues)).toEqual({ serialNumber: 'The front page needs a serial number.' });
    expect(frontIssues([])).toEqual({});
  });

  it('picks the extra-deviation messages by id', () => {
    expect([...extraIssues(issues)]).toEqual([
      ['Extr000000000001', 'Deviation D-02 needs a description.'],
    ]);
  });
});
