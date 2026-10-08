import { describe, expect, it } from 'vitest';
import {
  CreateInspectionRequestSchema,
  EXTRA_DEVIATION_REF,
  InspectionDraftInputSchema,
  deriveDeviations,
  formatInspectionNumber,
  inspectionProgress,
  snapshotTemplate,
  validateForFinalise,
} from './inspections';
import type { Inspection, Template } from './schemas';

const template: Template = {
  id: 'tpl1',
  name: 'Final inspection – RigiMill MG',
  modelCode: 'RMMG',
  revision: 2,
  status: 'published',
  printSettings: { spareRowsPerSection: 3 },
  sections: [
    {
      id: 's1',
      title: 'Loading area',
      items: [
        { id: 'i1', text: 'Light curtains - Correct height' },
        { id: 'i2', text: 'Pallet mover - Chains slack' },
      ],
    },
    {
      id: 's2',
      title: 'Electrical Cabinets',
      items: [
        { id: 'i3', text: 'Main Cabinet - Verify labeling' },
        { id: 'i4', text: 'Main Cabinet - AC set to 35°C' },
      ],
    },
  ],
  updatedAt: '2026-10-06T09:00:00.000Z',
  updatedBy: 'sam@modig.se',
};

function inspection(overrides: Partial<Inspection> = {}): Inspection {
  return {
    id: 'insp1',
    number: 'FI-2026-0001',
    templateId: template.id,
    templateRevision: 2,
    templateSnapshot: snapshotTemplate(template),
    front: {
      machineName: 'RigiMill MG #7',
      modelCode: 'RMMG',
      serialNumber: 'SN-123',
      participants: ['Sam'],
      location: 'Kalmar, Sweden',
      date: '2026-10-07',
    },
    results: {},
    extraDeviations: [],
    state: 'in_progress',
    createdAt: '2026-10-07T08:00:00.000Z',
    createdBy: 'sam@modig.se',
    updatedAt: '2026-10-07T08:00:00.000Z',
    updatedBy: 'sam@modig.se',
    ...overrides,
  };
}

describe('formatInspectionNumber', () => {
  it('pads the yearly sequence to four digits', () => {
    expect(formatInspectionNumber(2026, 42)).toBe('FI-2026-0042');
    expect(formatInspectionNumber(2026, 12345)).toBe('FI-2026-12345');
  });
});

describe('snapshotTemplate', () => {
  it('freezes name, sections and print settings', () => {
    const snap = snapshotTemplate(template);
    expect(snap).toEqual({
      name: template.name,
      sections: template.sections,
      printSettings: template.printSettings,
    });
  });

  it('is a deep copy: later template edits never reach the inspection', () => {
    const live = JSON.parse(JSON.stringify(template)) as Template;
    const snap = snapshotTemplate(live);
    live.sections[0]!.items[0]!.text = 'Reworded';
    live.sections[0]!.items.push({ id: 'i9', text: 'New row' });
    live.printSettings.spareRowsPerSection = 9;
    expect(snap.sections[0]!.items.map((i) => i.text)).toEqual([
      'Light curtains - Correct height',
      'Pallet mover - Chains slack',
    ]);
    expect(snap.printSettings.spareRowsPerSection).toBe(3);
  });
});

describe('deriveDeviations', () => {
  it('lists NOK rows in checklist order, then extra deviations, numbered D-01…', () => {
    const devs = deriveDeviations(
      inspection({
        results: {
          i4: { status: 'NOK', comment: 'Set to 30', severity: 'major', resp: 'Electrical' },
          i1: { status: 'NOK' },
          i2: { status: 'OK', comment: 'fine' },
          i3: { status: 'NA' },
        },
        extraDeviations: [
          { id: 'x1', description: 'Scratch on outer sheet', severity: 'minor', resp: 'Assembly' },
        ],
      }),
    );
    expect(devs.map((d) => [d.number, d.ref, d.kind, d.key])).toEqual([
      ['D-01', '1.a', 'row', 'i1'],
      ['D-02', '2.b', 'row', 'i4'],
      ['D-03', EXTRA_DEVIATION_REF, 'extra', 'x1'],
    ]);
    expect(devs[0]).toMatchObject({
      severity: 'minor',
      comment: '',
      resp: '',
      sectionTitle: 'Loading area',
    });
    expect(devs[1]).toMatchObject({
      text: 'Main Cabinet - AC set to 35°C',
      comment: 'Set to 30',
      severity: 'major',
      resp: 'Electrical',
    });
    expect(devs[2]).toMatchObject({
      itemId: null,
      text: 'Scratch on outer sheet',
      sectionTitle: '',
    });
  });

  it('is empty when nothing is NOK', () => {
    expect(deriveDeviations(inspection({ results: { i1: { status: 'OK' } } }))).toEqual([]);
  });

  it('ignores results for ids that are not in the snapshot', () => {
    expect(deriveDeviations(inspection({ results: { ghost: { status: 'NOK' } } }))).toEqual([]);
  });
});

describe('inspectionProgress', () => {
  it('counts filled and NOK rows', () => {
    expect(
      inspectionProgress(
        inspection({
          results: {
            i1: { status: 'OK' },
            i2: { status: 'NOK' },
            i3: { comment: 'no status yet' },
          },
        }),
      ),
    ).toEqual({ total: 4, filled: 2, nok: 1 });
  });
});

describe('validateForFinalise', () => {
  it('passes when every row has a status and the front page names the machine', () => {
    const all = {
      i1: { status: 'OK' },
      i2: { status: 'OK' },
      i3: { status: 'NA' },
      i4: { status: 'NOK' },
    } as const;
    expect(validateForFinalise(inspection({ results: all }))).toEqual([]);
  });

  it('lists every row without a status by ref, plus front page and extra deviation gaps', () => {
    const issues = validateForFinalise(
      inspection({
        front: { ...inspection().front, serialNumber: ' ' },
        results: { i1: { status: 'OK' }, i3: { status: 'NA' } },
        extraDeviations: [{ id: 'x1', description: '', severity: 'minor' }],
      }),
    );
    expect(issues.map((i) => i.message)).toEqual([
      'The front page needs a serial number.',
      'Row 1.b has no status.',
      'Row 2.b has no status.',
      'Deviation D-01 needs a description.',
    ]);
    expect(issues[1]!.target).toEqual({ kind: 'row', sectionId: 's1', itemId: 'i2' });
    expect(issues[3]!.target).toEqual({ kind: 'extra', extraId: 'x1' });
  });
});

describe('request schemas', () => {
  it('create needs a template, machine name and serial number', () => {
    const front = {
      machineName: ' ',
      serialNumber: 'SN',
      participants: [],
      location: 'Kalmar, Sweden',
      date: '2026-10-07',
    };
    expect(CreateInspectionRequestSchema.safeParse({ templateId: 'tpl1', front }).success).toBe(
      false,
    );
    expect(
      CreateInspectionRequestSchema.parse({
        templateId: 'tpl1',
        front: { ...front, machineName: ' RM #7 ' },
      }).front.machineName,
    ).toBe('RM #7');
  });

  it('draft input keeps only client-owned fields', () => {
    const full = inspection({ state: 'finalised', number: 'FI-2026-9999' });
    const parsed = InspectionDraftInputSchema.parse(full);
    expect(Object.keys(parsed).sort()).toEqual(['extraDeviations', 'front', 'results']);
    expect('modelCode' in parsed.front).toBe(false);
  });
});

describe('deviation photos', () => {
  const photo = {
    imageId: 'img1',
    annotations: [{ kind: 'arrow' as const, points: [0.1, 0.1, 0.5, 0.5], color: '#E02424' }],
    renderedImageId: 'img1r',
  };

  it('carries the photos of NOK rows and extra deviations', () => {
    const devs = deriveDeviations(
      inspection({
        results: { i2: { status: 'NOK', photos: [photo] } },
        extraDeviations: [
          {
            id: 'x1',
            description: 'Dent',
            severity: 'minor',
            photos: [photo, { imageId: 'img2', annotations: [] }],
          },
        ],
      }),
    );
    expect(devs.map((d) => d.photos.length)).toEqual([1, 2]);
    expect(devs[0]!.photos[0]).toEqual(photo);
  });

  it('gives deviations without photos an empty list', () => {
    expect(deriveDeviations(inspection({ results: { i1: { status: 'NOK' } } }))[0]!.photos).toEqual(
      [],
    );
  });

  it('caps photos per deviation', () => {
    const three = [photo, photo, photo];
    expect(
      InspectionDraftInputSchema.safeParse({
        ...InspectionDraftInputSchema.parse(inspection()),
        results: { i1: { status: 'NOK', photos: three } },
      }).success,
    ).toBe(false);
  });
});
