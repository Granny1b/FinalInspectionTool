import { describe, expect, it } from 'vitest';
import type { GuideImage, Section } from './schemas';
import {
  checklistIds,
  QualityCheckExportSchema,
  qualityCheckExport,
  TemplateExportSchema,
  templateExport,
  templateImageIds,
  withAvailableImages,
  withNewIds,
} from './templateTransfer';

const image = (imageId: string, renderedImageId?: string): GuideImage => ({
  imageId,
  annotations: [],
  ...(renderedImageId && { renderedImageId }),
  verdict: 'good',
});

const sections: Section[] = [
  {
    id: 's1',
    title: 'Loading area',
    items: [
      { id: 'i1', text: 'Lifting columns', guide: { images: [image('p1', 'r1'), image('p2')] } },
      { id: 'i2', text: 'Pallet mover', guide: { description: 'Slack', images: [image('p3')] } },
      { id: 'i3', text: 'Light curtains', guide: { images: [image('p4')] } },
    ],
  },
  { id: 's2', title: 'Tool arena', items: [{ id: 'i4', text: 'Magazine' }] },
];
const template = {
  name: 'Final inspection – RigiMill MG',
  modelCode: 'RMMG',
  coverImageId: 'cover',
  sections,
};

describe('templateExport', () => {
  it('writes a file the schema accepts, with the model name', () => {
    const file = templateExport(template, 'RigiMill MG', '2026-11-04T08:00:00.000Z');
    expect(TemplateExportSchema.parse(file)).toEqual({
      format: 'modig-final-inspection/template',
      version: 1,
      exportedAt: '2026-11-04T08:00:00.000Z',
      template: { ...template, modelName: 'RigiMill MG' },
    });
  });

  it('leaves out a missing cover and model name', () => {
    const file = templateExport(
      { ...template, coverImageId: undefined },
      undefined,
      '2026-11-04T08:00:00.000Z',
    );
    expect(Object.keys(file.template)).toEqual(['name', 'modelCode', 'sections']);
  });
});

describe('qualityCheckExport', () => {
  const quality = {
    position: 'QC4',
    operation: 'Pre start up',
    department: 'Quality',
    documentNumber: '1.22.2',
    madeBy: 'Sam Andersson',
    date: '2026-11-05',
  };
  const rows: Section[] = [
    {
      id: 's1',
      title: 'Safety features',
      items: [
        {
          id: 'i1',
          text: 'Safety decals on the X motors',
          how: 'Visible',
          references: ['ISO 7010'],
          timeHours: 0.1,
          guide: { description: 'Both sides', images: [image('p1', 'r1')] },
        },
      ],
    },
  ];

  it('writes a file of its own format: front page, model and rows with every field', () => {
    const file = qualityCheckExport(
      { modelCode: 'RMMG', quality, sections: rows },
      'RigiMill MG',
      '2026-11-05T08:00:00.000Z',
    );
    expect(QualityCheckExportSchema.parse(file)).toEqual({
      format: 'modig-final-inspection/quality-check',
      version: 1,
      exportedAt: '2026-11-05T08:00:00.000Z',
      qualityCheck: { quality, modelCode: 'RMMG', modelName: 'RigiMill MG', sections: rows },
    });
    // Neither file passes for the other.
    expect(TemplateExportSchema.safeParse(file).success).toBe(false);
    const templateFile = templateExport(template, undefined, '2026-11-05T08:00:00.000Z');
    expect(QualityCheckExportSchema.safeParse(templateFile).success).toBe(false);
  });

  it('writes an empty front page for a check without one', () => {
    const file = qualityCheckExport(
      { modelCode: 'RMMG', quality: undefined, sections: [] },
      undefined,
      '2026-11-05T08:00:00.000Z',
    );
    expect(file.qualityCheck.quality.position).toBe('');
    expect(Object.keys(file.qualityCheck)).toEqual(['quality', 'modelCode', 'sections']);
  });
});

describe('TemplateExportSchema', () => {
  it('reads a file exported before spare lines were removed, without them, still as version 1', () => {
    // As an earlier version wrote it: print settings, and a section with its own spare lines.
    const old = {
      format: 'modig-final-inspection/template',
      version: 1,
      exportedAt: '2026-10-20T08:00:00.000Z',
      template: {
        name: 'Final inspection – RigiMill MG',
        modelCode: 'RMMG',
        modelName: 'RigiMill MG',
        coverImageId: 'cover',
        printSettings: { spareRowsPerSection: 3 },
        sections: [
          { id: 's1', title: 'Loading area', spareRows: 5, items: [{ id: 'i1', text: 'Lifting' }] },
          { id: 's2', title: 'Tool arena', spareRows: 0, items: [] },
        ],
      },
    };
    const parsed = TemplateExportSchema.parse(old);
    expect(parsed).toEqual({
      format: 'modig-final-inspection/template',
      version: 1,
      exportedAt: '2026-10-20T08:00:00.000Z',
      template: {
        name: 'Final inspection – RigiMill MG',
        modelCode: 'RMMG',
        modelName: 'RigiMill MG',
        coverImageId: 'cover',
        sections: [
          { id: 's1', title: 'Loading area', items: [{ id: 'i1', text: 'Lifting' }] },
          { id: 's2', title: 'Tool arena', items: [] },
        ],
      },
    });
    expect('printSettings' in parsed.template).toBe(false);
    expect(parsed.template.sections.some((section) => 'spareRows' in section)).toBe(false);
  });
});

describe('images', () => {
  it('lists the cover, every guide image and every marked-up copy once', () => {
    expect(templateImageIds(template)).toEqual(['cover', 'p1', 'r1', 'p2', 'p3', 'p4']);
    expect(templateImageIds({ sections: [] })).toEqual([]);
  });

  it('keeps a template whose images are all here as it is', () => {
    const all = new Set(templateImageIds(template));
    expect(withAvailableImages(template, all)).toEqual({ template, dropped: 0 });
  });

  it('drops what is missing: a guide image without its photo, a marked-up copy, an empty guide', () => {
    const { template: kept, dropped } = withAvailableImages(template, new Set(['p1', 'p2', 'r9']));
    expect(dropped).toBe(4); // cover, r1, p3, p4
    expect('coverImageId' in kept).toBe(false);
    const [first, second, third] = kept.sections[0]!.items;
    expect(first!.guide).toEqual({ images: [image('p1'), image('p2')] });
    // The description stays when its only image goes; a guide left empty goes.
    expect(second!.guide).toEqual({ description: 'Slack', images: [] });
    expect(third).toEqual({ id: 'i3', text: 'Light curtains' });
    expect(kept.sections[1]).toEqual(sections[1]);
    // The input is left as it was.
    expect(templateImageIds(template)).toHaveLength(6);
  });
});

describe('ids', () => {
  it('lists every section and row id', () => {
    expect(checklistIds(sections)).toEqual(['s1', 'i1', 'i2', 'i3', 's2', 'i4']);
  });

  it('gives every section and row a fresh id and keeps the rest', () => {
    let n = 0;
    const renewed = withNewIds(sections, () => `new${++n}`);
    expect(checklistIds(renewed)).toEqual(['new1', 'new2', 'new3', 'new4', 'new5', 'new6']);
    expect(renewed[0]).toMatchObject({ title: 'Loading area' });
    expect(renewed[0]!.items[0]!.guide).toEqual(sections[0]!.items[0]!.guide);
    expect(checklistIds(sections)[0]).toBe('s1');
  });
});
