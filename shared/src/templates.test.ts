import { describe, expect, it } from 'vitest';
import type { Template } from './schemas';
import {
  CreateTemplateRequestSchema,
  TemplateDraftInputSchema,
  hasUnpublishedChanges,
  validateForPublish,
} from './templates';

const base: Template = {
  id: 'tpl1',
  name: 'Final inspection – RigiMill MG',
  modelCode: 'RMMG',
  revision: 3,
  status: 'draft',
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
  ],
  updatedAt: '2026-10-06T09:00:00.000Z',
  updatedBy: 'sam@modig.se',
};

describe('validateForPublish', () => {
  it('accepts a complete template', () => {
    expect(validateForPublish(base)).toEqual([]);
  });

  it('points at the empty row by its derived ref', () => {
    const t = {
      ...base,
      sections: [
        { ...base.sections[0]!, items: [base.sections[0]!.items[0]!, { id: 'i9', text: '  ' }] },
      ],
    };
    expect(validateForPublish(t)).toEqual([
      { target: { kind: 'item', sectionId: 's1', itemId: 'i9' }, message: 'Row 1.b is empty.' },
    ]);
  });

  it('flags missing name, untitled and empty sections, and no sections at all', () => {
    expect(validateForPublish({ name: ' ', sections: [] }).map((i) => i.message)).toEqual([
      'The template needs a name.',
      'Add at least one section.',
    ]);
    const issues = validateForPublish({
      name: 'x',
      sections: [{ id: 's2', title: '', items: [] }],
    });
    expect(issues.map((i) => i.message)).toEqual([
      'Section 1 needs a title.',
      'Section 1 has no rows.',
    ]);
    expect(issues[0]!.target).toEqual({ kind: 'section', sectionId: 's2' });
  });
});

describe('hasUnpublishedChanges', () => {
  const published: Template = { ...base, status: 'published', revision: 2, changeNote: 'first' };

  it('is true when nothing is published yet', () => {
    expect(hasUnpublishedChanges(base, null)).toBe(true);
  });

  it('ignores metadata (revision, status, dates, who, change note)', () => {
    expect(
      hasUnpublishedChanges(
        { ...base, updatedAt: '2026-10-07T09:00:00.000Z', updatedBy: 'x' },
        published,
      ),
    ).toBe(false);
  });

  it('detects reworded, reordered and moved rows, and print setting / cover changes', () => {
    const s = base.sections[0]!;
    expect(
      hasUnpublishedChanges(
        {
          ...base,
          sections: [{ ...s, items: [{ ...s.items[0]!, text: 'Light curtains' }, s.items[1]!] }],
        },
        published,
      ),
    ).toBe(true);
    expect(
      hasUnpublishedChanges(
        { ...base, sections: [{ ...s, items: [s.items[1]!, s.items[0]!] }] },
        published,
      ),
    ).toBe(true);
    expect(
      hasUnpublishedChanges({ ...base, printSettings: { spareRowsPerSection: 5 } }, published),
    ).toBe(true);
    expect(hasUnpublishedChanges({ ...base, coverImageId: 'img1' }, published)).toBe(true);
  });
});

describe('request schemas', () => {
  it('draft input keeps only editor-owned fields', () => {
    const parsed = TemplateDraftInputSchema.parse({
      ...base,
      revision: 99,
      status: 'published',
      updatedBy: 'evil',
    });
    expect(Object.keys(parsed).sort()).toEqual(['modelCode', 'name', 'printSettings', 'sections']);
  });

  it('create needs a name and a valid model code', () => {
    expect(CreateTemplateRequestSchema.safeParse({ name: ' ', modelCode: 'RMMG' }).success).toBe(
      false,
    );
    expect(CreateTemplateRequestSchema.safeParse({ name: 'X', modelCode: 'RM/MG' }).success).toBe(
      false,
    );
    expect(CreateTemplateRequestSchema.parse({ name: ' X ', modelCode: 'RMMG' })).toEqual({
      name: 'X',
      modelCode: 'RMMG',
    });
  });
});
