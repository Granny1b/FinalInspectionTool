import { describe, expect, it } from 'vitest';
import { ID_LENGTH, ID_PATTERN, newId } from './ids';
import { AnnotationSchema, InspectionSchema, ModelCodeSchema, TemplateSchema } from './schemas';
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
    printSettings: { spareRowsPerSection: 3 },
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

  it('accepts a valid template', () => {
    expect(TemplateSchema.parse(template)).toEqual(template);
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
    };
    expect(InspectionSchema.safeParse(inspection).success).toBe(true);
    expect(InspectionSchema.safeParse({ ...inspection, number: 'X-1' }).success).toBe(false);
    const badModel = { ...inspection, front: { ...inspection.front, modelCode: 'RM/MG' } };
    expect(InspectionSchema.safeParse(badModel).success).toBe(false);
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
