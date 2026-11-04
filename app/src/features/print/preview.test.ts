import type { Inspection, InspectionDraftInput } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { inspectionPrint } from './model';
import { fitScale, inspectionOnScreen, SHEET_WIDTH_PX } from './preview';

const stored: Inspection = {
  id: 'Insp000000000001',
  number: 'FI-2026-0042',
  templateId: 'Tmpl000000000001',
  templateRevision: 2,
  templateSnapshot: {
    name: 'Final inspection – RigiMill MG',
    sections: [
      {
        id: 'Sect000000000001',
        title: 'Loading area',
        items: [{ id: 'Item000000000001', text: 'Door seals intact' }],
      },
    ],
    printSettings: { spareRowsPerSection: 3 },
  },
  front: {
    machineName: 'RigiMill MG',
    modelCode: 'RMMG',
    serialNumber: '',
    participants: [],
    location: 'Kalmar, Sweden',
    date: '2026-10-07',
  },
  results: {},
  extraDeviations: [],
  state: 'in_progress',
  createdAt: '2026-10-07T08:00:00.000Z',
  createdBy: 'anna@modig.se',
  updatedAt: '2026-10-07T08:00:00.000Z',
  updatedBy: 'anna@modig.se',
};

/** Typed on screen, not saved yet. */
const draft: InspectionDraftInput = {
  front: {
    machineName: 'RigiMill MG – Volvo Skövde',
    serialNumber: 'RM-2026-031',
    participants: ['Erik Lund'],
    location: 'Kalmar, Sweden',
    date: '2026-10-08',
  },
  results: {
    Item000000000001: { status: 'NOK', comment: 'Seal torn at the hinge', severity: 'major' },
  },
  extraDeviations: [{ id: 'Xdev000000000001', description: 'Paint chipped', severity: 'minor' }],
};

const CONTEXT = { companyName: 'Modig Machine Tool', modelLabel: 'RigiMill MG' };

describe('inspectionOnScreen', () => {
  it('takes the edits from the draft and the model and checklist from the stored inspection', () => {
    const shown = inspectionOnScreen(stored, draft, {
      state: 'in_progress',
      finalisedAt: undefined,
      finalisedBy: undefined,
    });
    expect(shown.front).toEqual({ ...draft.front, modelCode: 'RMMG' });
    expect(shown.results).toBe(draft.results);
    expect(shown.extraDeviations).toBe(draft.extraDeviations);
    expect(shown.templateSnapshot).toBe(stored.templateSnapshot);
    expect(shown.number).toBe('FI-2026-0042');
  });

  it('takes the state from the server, as finalising or reopening left it', () => {
    const shown = inspectionOnScreen(stored, draft, {
      state: 'finalised',
      finalisedAt: '2026-10-08T14:32:00.000Z',
      finalisedBy: 'anna@modig.se',
    });
    expect(shown).toMatchObject({ state: 'finalised', finalisedBy: 'anna@modig.se' });
  });

  it('prints the unsaved findings in the report', () => {
    const model = inspectionPrint(
      inspectionOnScreen(stored, draft, { state: 'in_progress' }),
      'report',
      CONTEXT,
    );
    expect(model.deviations).toMatchObject({
      kind: 'cards',
      cards: [
        { number: 'D-01', ref: '1.a', comment: 'Seal torn at the hinge', severity: 'major' },
        { number: 'D-02', ref: null, text: 'Paint chipped', severity: 'minor' },
      ],
    });
    expect(model.front.fields).toContainEqual({
      label: 'Serial number',
      value: 'RM-2026-031',
    });
  });
});

describe('fitScale', () => {
  it('keeps the real size when the sheet fits', () => {
    expect(fitScale(SHEET_WIDTH_PX)).toBe(1);
    expect(fitScale(1600)).toBe(1);
  });

  it('shrinks the sheet to the width there is', () => {
    expect(fitScale(SHEET_WIDTH_PX / 2)).toBeCloseTo(0.5);
    expect(fitScale(600)).toBeCloseTo(600 / SHEET_WIDTH_PX);
  });

  it('stops at a readable size, and treats an unmeasured width as the real size', () => {
    expect(fitScale(120)).toBe(0.375);
    expect(fitScale(0)).toBe(1);
    expect(fitScale(Number.NaN)).toBe(1);
  });
});
