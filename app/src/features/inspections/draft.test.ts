import type { Inspection, InspectionDraftInput } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { draftOf, sameDraft } from './draft';

const inspection: Inspection = {
  id: 'Insp000000000001',
  number: 'FI-2026-0001',
  templateId: 'Tmpl000000000001',
  templateRevision: 2,
  templateSnapshot: {
    name: 'Final inspection',
    sections: [],
    printSettings: { spareRowsPerSection: 3 },
  },
  front: {
    machineName: 'RigiMill MG',
    modelCode: 'RMMG',
    serialNumber: '1042',
    participants: ['Anna'],
    location: 'Kalmar, Sweden',
    date: '2026-10-07',
  },
  results: { Item000000000001: { status: 'NOK', comment: 'Loose', severity: 'major' } },
  extraDeviations: [{ id: 'Extr000000000001', description: 'Paint', severity: 'minor' }],
  state: 'in_progress',
  createdAt: '2026-10-07T08:00:00.000Z',
  createdBy: 'anna@modig.se',
  updatedAt: '2026-10-07T08:00:00.000Z',
  updatedBy: 'anna@modig.se',
};

describe('draftOf', () => {
  it('takes only what the client may send: front without the model, results, extras', () => {
    const draft = draftOf(inspection);
    expect(Object.keys(draft).sort()).toEqual(['extraDeviations', 'front', 'results']);
    expect(draft.front).not.toHaveProperty('modelCode');
    expect(draft.front.machineName).toBe('RigiMill MG');
    expect(draft.results).toBe(inspection.results);
  });
});

describe('sameDraft', () => {
  const draft = draftOf(inspection);

  it('ignores key order at every level', () => {
    const reordered: InspectionDraftInput = {
      extraDeviations: [{ severity: 'minor', description: 'Paint', id: 'Extr000000000001' }],
      results: { Item000000000001: { severity: 'major', comment: 'Loose', status: 'NOK' } },
      front: {
        date: '2026-10-07',
        location: 'Kalmar, Sweden',
        participants: ['Anna'],
        serialNumber: '1042',
        machineName: 'RigiMill MG',
      },
    };
    expect(sameDraft(draft, reordered)).toBe(true);
  });

  it('treats a missing and an undefined photo alike (JSON drops undefined)', () => {
    expect(sameDraft(draft, { ...draft, front: { ...draft.front, photoId: undefined } })).toBe(
      true,
    );
  });

  it('sees any change of content, including the order of lists', () => {
    expect(sameDraft(draft, { ...draft, front: { ...draft.front, serialNumber: '1043' } })).toBe(
      false,
    );
    expect(
      sameDraft(
        { ...draft, front: { ...draft.front, participants: ['Anna', 'Erik'] } },
        { ...draft, front: { ...draft.front, participants: ['Erik', 'Anna'] } },
      ),
    ).toBe(false);
    expect(sameDraft(draft, { ...draft, results: {} })).toBe(false);
  });
});
