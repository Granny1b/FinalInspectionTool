import { describe, expect, it } from 'vitest';
import { ID_LENGTH, ID_PATTERN, newId } from './ids';
import {
  AnnotatedImageSchema,
  AnnotationSchema,
  ExtraDeviationSchema,
  GUIDE_VERDICT_LABELS,
  GuideImageSchema,
  GuideSchema,
  MAX_GUIDE_IMAGES,
  MAX_PHOTOS_PER_DEVIATION,
  InspectionSchema,
  ModelCodeSchema,
  TemplateSchema,
} from './schemas';
import { blobNames, deviationKeys } from './storage';

const now = '2026-10-06T09:00:00.000Z';

describe('ids', () => {
  it('generates path- and RowKey-safe ids', () => {
    for (let i = 0; i < 200; i++) {
      const id = newId();
      expect(id).toHaveLength(ID_LENGTH);
      expect(id).toMatch(ID_PATTERN);
    }
  });
});

describe('TemplateSchema', () => {
  const template = {
    id: newId(),
    name: 'Final inspection – RigiMill MG',
    modelCode: 'RMMG',
    revision: 2,
    status: 'published',
    sections: [
      {
        id: newId(),
        title: 'Loading area',
        items: [{ id: newId(), text: 'Light curtains - Correct height' }],
      },
    ],
    updatedAt: now,
    updatedBy: 'seed',
  };

  it('accepts a valid template; one stored before quality checks existed is a final inspection', () => {
    expect(TemplateSchema.parse(template)).toEqual({ ...template, kind: 'final' });
    expect(TemplateSchema.parse({ ...template, kind: 'final' })).toEqual({
      ...template,
      kind: 'final',
    });
  });

  it('reads a quality check: its machine, front page and rows with how, references and time', () => {
    const parentId = newId();
    const check = {
      ...template,
      kind: 'quality',
      parentId,
      name: 'QC4 · Pre start up',
      quality: {
        position: 'QC4',
        operation: 'Pre start up',
        department: 'Quality',
        documentNumber: '1.22.2',
        madeBy: 'Sam Andersson',
        date: '2026-11-05',
      },
      sections: [
        {
          id: newId(),
          title: 'Safety features',
          items: [
            {
              id: newId(),
              text: 'Check and verify safety decals on balancing tubes.',
              how: 'Should be visible and not turned inward.',
              references: ['ISO 12100', 'ISO 7010'],
              timeHours: 0.2,
            },
          ],
        },
      ],
    };
    expect(TemplateSchema.parse(check)).toEqual(check);
    // An undated front page is allowed; a date that isn't one is not.
    const undated = { ...check, quality: { ...check.quality, date: '' } };
    expect(TemplateSchema.safeParse(undated).success).toBe(true);
    const misdated = { ...check, quality: { ...check.quality, date: '05/11/2026' } };
    expect(TemplateSchema.safeParse(misdated).success).toBe(false);
  });

  it('checks the new row fields: references short and not blank, time not negative', () => {
    const withItem = (item: Record<string, unknown>) => ({
      ...template,
      sections: [{ id: newId(), title: 'A', items: [{ id: newId(), text: 'x', ...item }] }],
    });
    expect(TemplateSchema.safeParse(withItem({ references: ['  '] })).success).toBe(false);
    expect(TemplateSchema.safeParse(withItem({ references: ['x'.repeat(101)] })).success).toBe(
      false,
    );
    expect(TemplateSchema.safeParse(withItem({ timeHours: -0.1 })).success).toBe(false);
    expect(TemplateSchema.safeParse(withItem({ timeHours: 0 })).success).toBe(true);
    expect(TemplateSchema.safeParse({ ...template, kind: 'other' }).success).toBe(false);
    // Trimmed as stored.
    const parsed = TemplateSchema.parse(withItem({ references: [' ISO 4413 '] }));
    expect(parsed.sections[0]!.items[0]!.references).toEqual(['ISO 4413']);
  });

  it('allows empty row text in drafts', () => {
    const draft = {
      ...template,
      status: 'draft',
      sections: [{ id: newId(), title: '', items: [{ id: newId(), text: '' }] }],
    };
    expect(TemplateSchema.safeParse(draft).success).toBe(true);
  });

  it('rejects unsafe ids (they become blob paths)', () => {
    expect(TemplateSchema.safeParse({ ...template, id: '../etc' }).success).toBe(false);
  });

  it('rejects model codes that cannot be a Table Storage PartitionKey', () => {
    expect(TemplateSchema.safeParse({ ...template, modelCode: 'RM/MG' }).success).toBe(false);
  });

  it('reads a template stored before spare lines were removed, without them', () => {
    const stored = {
      ...template,
      printSettings: { spareRowsPerSection: 3 },
      sections: template.sections.map((section) => ({ ...section, spareRows: 5 })),
    };
    const parsed = TemplateSchema.parse(stored);
    expect(parsed).toEqual({ ...template, kind: 'final' });
    expect('printSettings' in parsed).toBe(false);
    expect('spareRows' in parsed.sections[0]!).toBe(false);
  });
});

describe('ModelCodeSchema', () => {
  it('allows letters and digits only', () => {
    for (const code of ['RMMG', 'HHVSingle', 'IM8']) {
      expect(ModelCodeSchema.safeParse(code).success).toBe(true);
    }
    for (const code of ['', 'RM/MG', 'RM#MG', 'RM?MG', 'RM\\MG', 'RM MG', 'A\u0001']) {
      expect(ModelCodeSchema.safeParse(code).success).toBe(false);
    }
  });
});

describe('AnnotationSchema', () => {
  it('discriminates on kind', () => {
    expect(
      AnnotationSchema.safeParse({ kind: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, color: '#ff0000' })
        .success,
    ).toBe(true);
    expect(
      AnnotationSchema.safeParse({
        kind: 'ellipse',
        x: 0.1,
        y: 0.1,
        w: 0.2,
        h: 0.2,
        color: '#ff0000',
      }).success,
    ).toBe(true);
    expect(AnnotationSchema.safeParse({ kind: 'text', x: 0, y: 0, color: '#fff' }).success).toBe(
      false,
    );
    expect(AnnotationSchema.safeParse({ kind: 'star', x: 0, y: 0 }).success).toBe(false);
  });
});

describe('InspectionSchema', () => {
  it('accepts a fresh inspection with N/A stored as NA', () => {
    const itemId = newId();
    const inspection = {
      id: newId(),
      number: 'FI-2026-0042',
      templateId: newId(),
      templateRevision: 2,
      templateSnapshot: {
        name: 'Final inspection – RigiMill MG',
        sections: [
          { id: newId(), title: 'Gantry', items: [{ id: itemId, text: 'Motors - Safety decals' }] },
        ],
      },
      front: {
        machineName: 'RigiMill MG #7',
        modelCode: 'RMMG',
        serialNumber: '12345',
        participants: ['Sam'],
        location: 'Kalmar, Sweden',
        date: '2026-10-06',
      },
      results: { [itemId]: { status: 'NA' } },
      extraDeviations: [],
      state: 'in_progress',
      createdAt: '2026-10-06T09:00:00.000Z',
      createdBy: 'sam@modig.se',
      updatedAt: '2026-10-06T09:05:00.000Z',
      updatedBy: 'sam@modig.se',
    };
    expect(InspectionSchema.safeParse(inspection).success).toBe(true);
    expect(InspectionSchema.safeParse({ ...inspection, number: 'X-1' }).success).toBe(false);
    const badModel = { ...inspection, front: { ...inspection.front, modelCode: 'RM/MG' } };
    expect(InspectionSchema.safeParse(badModel).success).toBe(false);
  });

  it('reads an inspection stored before spare lines were removed: its snapshot without them', () => {
    const itemId = newId();
    const snapshot = {
      name: 'Final inspection – RigiMill MG',
      sections: [{ id: newId(), title: 'Gantry', items: [{ id: itemId, text: 'Motors' }] }],
    };
    const stored = {
      id: newId(),
      number: 'FI-2026-0007',
      templateId: newId(),
      templateRevision: 1,
      // As an earlier version froze it: the print settings and a section's own spare lines.
      templateSnapshot: {
        ...snapshot,
        sections: snapshot.sections.map((section) => ({ ...section, spareRows: 2 })),
        printSettings: { spareRowsPerSection: 3 },
      },
      front: {
        machineName: 'RigiMill MG #3',
        modelCode: 'RMMG',
        serialNumber: '123',
        participants: [],
        location: 'Kalmar, Sweden',
        date: '2026-09-30',
      },
      results: { [itemId]: { status: 'OK' } },
      extraDeviations: [],
      state: 'finalised',
      finalisedAt: '2026-09-30T15:00:00.000Z',
      finalisedBy: 'sam@modig.se',
      createdAt: '2026-09-30T09:00:00.000Z',
      createdBy: 'sam@modig.se',
      updatedAt: '2026-09-30T15:00:00.000Z',
      updatedBy: 'sam@modig.se',
    };
    const parsed = InspectionSchema.parse(stored);
    expect(parsed.templateSnapshot).toEqual(snapshot);
    expect(parsed).toEqual({ ...stored, templateSnapshot: snapshot });
  });
});

describe('storage conventions', () => {
  it('builds blob names and deviation keys', () => {
    expect(blobNames.templateDraft('abc')).toBe('abc/draft.json');
    expect(blobNames.templateRevision('abc', 3)).toBe('abc/rev-3.json');
    expect('rev-12.json'.match(blobNames.templateRevisionPattern)?.[1]).toBe('12');
    expect(deviationKeys('RMMG', 'insp', 'item')).toEqual({
      partitionKey: 'RMMG',
      rowKey: 'insp_item',
    });
  });
});

describe('AnnotatedImageSchema / GuideImageSchema', () => {
  it('a guide image is an annotated image with a verdict', () => {
    const image = { imageId: 'img1', annotations: [], caption: 'Good weld' };
    expect(AnnotatedImageSchema.parse(image)).toEqual(image);
    expect(GuideImageSchema.safeParse(image).success).toBe(false);
    expect(GuideImageSchema.parse({ ...image, verdict: 'good' }).verdict).toBe('good');
  });
});

describe('GuideSchema', () => {
  const image = { imageId: 'img1', annotations: [], verdict: 'bad' as const };

  it('caps the images per guide', () => {
    expect(GuideSchema.safeParse({ images: Array(MAX_GUIDE_IMAGES).fill(image) }).success).toBe(
      true,
    );
    expect(GuideSchema.safeParse({ images: Array(MAX_GUIDE_IMAGES + 1).fill(image) }).success).toBe(
      false,
    );
  });

  it('labels every verdict', () => {
    expect(Object.keys(GUIDE_VERDICT_LABELS).sort()).toEqual(['bad', 'good', 'info']);
  });
});

describe('ExtraDeviationSchema', () => {
  const photo = { imageId: 'img1', annotations: [] };
  const extra = { id: 'x1', description: 'Paint damage', severity: 'minor' as const };

  it('takes up to MAX_PHOTOS_PER_DEVIATION photos, like a row', () => {
    const photos = (count: number) => Array<typeof photo>(count).fill(photo);
    expect(ExtraDeviationSchema.safeParse(extra).success).toBe(true);
    expect(
      ExtraDeviationSchema.safeParse({ ...extra, photos: photos(MAX_PHOTOS_PER_DEVIATION) })
        .success,
    ).toBe(true);
    expect(
      ExtraDeviationSchema.safeParse({ ...extra, photos: photos(MAX_PHOTOS_PER_DEVIATION + 1) })
        .success,
    ).toBe(false);
  });
});
