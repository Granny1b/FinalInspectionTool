import type { GuideImage, Inspection, Item, Section, Template } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  appendixEntries,
  appendixImageIds,
  captionLabel,
  chunk,
  type AppendixEntry,
} from './appendix';
import { inspectionPrint, printedImageIds, templatePrint } from './model';

const CONTEXT = { companyName: 'Modig Machine Tool', modelLabel: 'RigiMill MG' };

/** 16-character ids, as the schemas want them. */
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(16 - prefix.length, '0')}`;
const image = (n: number, patch: Partial<GuideImage> = {}): GuideImage => ({
  imageId: id('Orig', n),
  verdict: 'good',
  annotations: [],
  ...patch,
});
const item = (n: number, patch: Partial<Item> = {}): Item => ({
  id: id('Item', n),
  text: `Checkpoint ${n}`,
  ...patch,
});

const SECTIONS: Section[] = [
  {
    id: id('Sect', 1),
    title: 'Loading area',
    items: [
      item(1),
      item(2, {
        text: ' Lifting columns - Marked screws ',
        guide: {
          description: '  All four screws marked blue.  ',
          images: [
            image(1, { renderedImageId: id('Rend', 1), caption: ' Marked screw ' }),
            image(2, { verdict: 'bad', caption: 'No mark' }),
            image(3, { verdict: 'info' }),
          ],
        },
      }),
      // A guide with a description only has no images to print.
      item(3, { guide: { description: 'Text only', images: [] } }),
    ],
  },
  { id: id('Sect', 2), title: 'Empty', items: [] },
  {
    id: id('Sect', 3),
    title: 'Electrical cabinets',
    items: [
      item(4),
      item(5),
      item(6, { guide: { images: [image(4, { verdict: 'bad' }), image(5)] } }),
    ],
  },
];

describe('the reference image appendix', () => {
  const entries = appendixEntries(SECTIONS);

  it('lists the rows with guide images in checklist order, with their refs', () => {
    expect(entries.map((entry) => [entry.ref, entry.text])).toEqual([
      ['1.b', 'Lifting columns - Marked screws'],
      ['3.c', 'Checkpoint 6'],
    ]);
  });

  it('skips rows without a guide, and guides without images', () => {
    expect(entries.some((entry) => entry.ref === '1.a' || entry.ref === '1.c')).toBe(false);
    expect(appendixEntries([SECTIONS[1]!])).toEqual([]);
  });

  it('puts the images two to a row, the last row holding what is left', () => {
    expect(entries[0]!.rows.map((row) => row.map((image) => image.imageId))).toEqual([
      [id('Rend', 1), id('Orig', 2)],
      [id('Orig', 3)],
    ]);
    expect(entries[1]!.rows).toHaveLength(1);
    expect(entries[1]!.rows[0]).toHaveLength(2);
  });

  it('prints the marked-up copy when there is one, else the image itself', () => {
    expect(appendixImageIds(entries)).toEqual([
      id('Rend', 1),
      id('Orig', 2),
      id('Orig', 3),
      id('Orig', 4),
      id('Orig', 5),
    ]);
  });

  it('captions every image with the ref and the verdict as symbol and word', () => {
    const images = entries.flatMap((entry) => entry.rows.flat());
    expect(images.map(captionLabel)).toEqual([
      '1.b · ✓ Good',
      '1.b · ✗ Bad',
      '1.b · ⓘ Info',
      '3.c · ✗ Bad',
      '3.c · ✓ Good',
    ]);
    expect(images.map((image) => image.caption)).toEqual(['Marked screw', 'No mark', '', '', '']);
  });

  it('keeps the description, trimmed, or none', () => {
    expect(entries.map((entry) => entry.description)).toEqual(['All four screws marked blue.', '']);
  });

  it('numbers rows past z like the checklist', () => {
    const many: Section = {
      id: id('Sect', 9),
      title: 'Many',
      items: Array.from({ length: 28 }, (_, index) =>
        item(100 + index, index === 27 ? { guide: { images: [image(9)] } } : {}),
      ),
    };
    expect(appendixEntries([many]).map((entry: AppendixEntry) => entry.ref)).toEqual(['1.ab']);
  });
});

describe('chunk', () => {
  it('splits a list into rows of a size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 2)).toEqual([[1, 2]]);
    expect(chunk([], 2)).toEqual([]);
  });
});

describe('the appendix in a printout', () => {
  const template: Template = {
    id: id('Tmpl', 1),
    name: 'Final inspection – RigiMill MG',
    modelCode: 'RMMG',
    revision: 3,
    status: 'draft',
    printSettings: { spareRowsPerSection: 0 },
    sections: SECTIONS,
    updatedAt: '2026-10-07T08:00:00.000Z',
    updatedBy: 'anna@modig.se',
  };

  it('comes from the template for a preview, its images loaded only when printed', () => {
    const model = templatePrint(template, { ...CONTEXT, draft: true });
    expect(model.appendix.map((entry) => entry.ref)).toEqual(['1.b', '3.c']);
    expect(printedImageIds(model, { appendix: false })).toEqual([]);
    expect(printedImageIds(model, { appendix: true })).toEqual(appendixImageIds(model.appendix));
  });

  it("comes from an inspection's frozen checklist, in blank and report mode alike", () => {
    const inspection: Inspection = {
      id: id('Insp', 1),
      number: 'FI-2026-0042',
      templateId: template.id,
      templateRevision: 2,
      templateSnapshot: {
        name: template.name,
        sections: SECTIONS,
        printSettings: { spareRowsPerSection: 0 },
      },
      front: {
        machineName: 'RigiMill MG',
        modelCode: 'RMMG',
        serialNumber: 'RM-1',
        participants: [],
        location: 'Kalmar',
        date: '2026-10-07',
        photoId: id('Phot', 1),
      },
      results: {},
      extraDeviations: [],
      state: 'in_progress',
      createdAt: '2026-10-07T08:00:00.000Z',
      createdBy: 'anna@modig.se',
      updatedAt: '2026-10-07T08:00:00.000Z',
      updatedBy: 'anna@modig.se',
    };
    for (const mode of ['blank', 'report'] as const) {
      const model = inspectionPrint(inspection, mode, CONTEXT);
      expect(model.appendix).toEqual(appendixEntries(SECTIONS));
      expect(printedImageIds(model, { appendix: true })).toEqual([
        id('Phot', 1),
        ...appendixImageIds(model.appendix),
      ]);
    }
  });
});
