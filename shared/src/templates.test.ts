import { describe, expect, it } from 'vitest';
import { TemplateSchema, type Guide, type Item, type Template } from './schemas';
import { qualityCheckExport, templateExport } from './templateTransfer';
import {
  CreateAnyTemplateRequestSchema,
  CreateQualityCheckRequestSchema,
  CreateTemplateRequestSchema,
  ImportAnyTemplateRequestSchema,
  ImportQualityCheckRequestSchema,
  ImportTemplateRequestSchema,
  TemplateDraftInputSchema,
  hasUnpublishedChanges,
  newModelConflict,
  sameTemplateContent,
  validateForPublish,
} from './templates';

const base: Template = {
  id: 'tpl1',
  kind: 'final',
  name: 'Final inspection – RigiMill MG',
  modelCode: 'RMMG',
  revision: 3,
  status: 'draft',
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

  it('flags a missing name, untitled sections and no sections at all', () => {
    expect(validateForPublish({ name: ' ', sections: [] }).map((i) => i.message)).toEqual([
      'The template needs a name.',
      'Add at least one section.',
    ]);
    const issues = validateForPublish({
      name: 'x',
      sections: [
        { id: 's2', title: '', items: [] },
        { id: 's3', title: 'Tool arena', items: [{ id: 'i1', text: 'Tool magazine' }] },
      ],
    });
    expect(issues).toEqual([
      { target: { kind: 'section', sectionId: 's2' }, message: 'Section 1 needs a title.' },
    ]);
  });

  it('accepts sections without rows (headings to fill in later), keeping their numbers', () => {
    const sections = [
      { id: 's1', title: 'Loading area', items: [] },
      { id: 's2', title: 'Tool arena', items: [{ id: 'i1', text: 'Tool magazine' }] },
      { id: 's3', title: 'Electrical cabinet', items: [] },
      { id: 's4', title: 'Chip conveyor', items: [{ id: 'i2', text: '' }] },
    ];
    expect(validateForPublish({ name: 'x', sections })).toEqual([
      // Section 4 is still 4, though two sections before it have no rows.
      { target: { kind: 'item', sectionId: 's4', itemId: 'i2' }, message: 'Row 4.a is empty.' },
    ]);
  });

  it('refuses a checklist without a single row: an inspection would have nothing to check', () => {
    const issues = validateForPublish({
      name: 'x',
      sections: [
        { id: 's1', title: 'Loading area', items: [] },
        { id: 's2', title: '', items: [] },
      ],
    });
    expect(issues).toEqual([
      { target: { kind: 'template' }, message: 'Add at least one row.' },
      { target: { kind: 'section', sectionId: 's2' }, message: 'Section 2 needs a title.' },
    ]);
  });

  it('lists the problems in document order', () => {
    const issues = validateForPublish({
      name: 'x',
      sections: [
        { id: 's1', title: 'Loading area', items: [{ id: 'i1', text: '' }] },
        { id: 's2', title: '', items: [{ id: 'i2', text: '' }] },
      ],
    });
    expect(issues.map((i) => i.message)).toEqual([
      'Row 1.a is empty.',
      'Section 2 needs a title.',
      'Row 2.a is empty.',
    ]);
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

  it('detects reworded, reordered and moved rows, and cover changes', () => {
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
    expect(hasUnpublishedChanges({ ...base, coverImageId: 'img1' }, published)).toBe(true);
  });

  it('sees no change in the spare lines an older stored revision still carries', () => {
    const s = base.sections[0]!;
    // A revision published before spare lines were removed, as it is stored.
    const stored = {
      ...published,
      printSettings: { spareRowsPerSection: 5 },
      sections: [{ ...s, spareRows: 2 }],
    };
    const parsed = TemplateSchema.parse(stored);
    expect('printSettings' in parsed).toBe(false);
    expect('spareRows' in parsed.sections[0]!).toBe(false);
    // The draft as saved now: the same checklist without those fields.
    expect(hasUnpublishedChanges(base, parsed)).toBe(false);
    // Even unparsed, they are no part of what is compared.
    expect(hasUnpublishedChanges(base, stored as Template)).toBe(false);
    expect(
      hasUnpublishedChanges(TemplateSchema.parse({ ...stored, status: 'draft' }), published),
    ).toBe(false);
  });

  it('detects a guide added, changed or removed, but not the same guide again', () => {
    const s = base.sections[0]!;
    const guide: Guide = {
      description: 'Screws marked',
      images: [{ imageId: 'img2', verdict: 'good', annotations: [] }],
    };
    const withGuide = (g: Guide | undefined): Template => ({
      ...base,
      sections: [{ ...s, items: [{ ...s.items[0]!, ...(g && { guide: g }) }, s.items[1]!] }],
    });
    const guided: Template = { ...withGuide(guide), status: 'published' };
    expect(hasUnpublishedChanges(withGuide(guide), published)).toBe(true);
    expect(hasUnpublishedChanges(withGuide({ ...guide, description: 'Marked' }), guided)).toBe(
      true,
    );
    expect(
      hasUnpublishedChanges(
        withGuide({ ...guide, images: [{ ...guide.images[0]!, verdict: 'bad' }] }),
        guided,
      ),
    ).toBe(true);
    expect(hasUnpublishedChanges(withGuide(undefined), guided)).toBe(true);
    // A copy, as a reload or the next autosave brings it.
    expect(
      hasUnpublishedChanges(withGuide(JSON.parse(JSON.stringify(guide)) as Guide), guided),
    ).toBe(false);
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
    expect(Object.keys(parsed).sort()).toEqual(['modelCode', 'name', 'sections']);
  });

  it('draft input from an editor that still sends spare lines saves without them', () => {
    const parsed = TemplateDraftInputSchema.parse({
      ...base,
      printSettings: { spareRowsPerSection: 3 },
      sections: base.sections.map((section) => ({ ...section, spareRows: 1 })),
    });
    expect('printSettings' in parsed).toBe(false);
    expect(parsed.sections).toEqual(base.sections);
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

  it("a new model must carry the template's model code", () => {
    const newModel = { code: 'HMC800', name: 'HMC 800' };
    expect(CreateTemplateRequestSchema.parse({ name: 'X', modelCode: 'HMC800', newModel })).toEqual(
      { name: 'X', modelCode: 'HMC800', newModel },
    );
    const mismatch = CreateTemplateRequestSchema.safeParse({
      name: 'X',
      modelCode: 'IM',
      newModel,
    });
    expect(mismatch.error?.issues).toEqual([
      expect.objectContaining({ path: ['newModel', 'code'] }),
    ]);
    expect(
      CreateTemplateRequestSchema.safeParse({
        name: 'X',
        modelCode: 'HMC800',
        newModel: { code: 'HMC800', name: ' ' },
      }).success,
    ).toBe(false);
  });

  it('import takes a template file, the model and the name', () => {
    const file = templateExport(base, 'RigiMill MG', '2026-11-04T08:00:00.000Z');
    const request = { name: 'Copy', modelCode: 'IM', file };
    expect(ImportTemplateRequestSchema.parse(request)).toEqual(request);
    expect(
      ImportTemplateRequestSchema.safeParse({ ...request, file: { ...file, version: 2 } }).success,
    ).toBe(false);
    expect(
      ImportTemplateRequestSchema.safeParse({
        ...request,
        newModel: { code: 'RMMG', name: 'RigiMill MG' },
      }).success,
    ).toBe(false);
  });

  it('import takes a file exported before spare lines were removed, and drops them', () => {
    const current = templateExport(base, 'RigiMill MG', '2026-10-20T08:00:00.000Z');
    const old = {
      ...current,
      template: {
        ...current.template,
        printSettings: { spareRowsPerSection: 3 },
        sections: current.template.sections.map((section) => ({ ...section, spareRows: 4 })),
      },
    };
    const parsed = ImportTemplateRequestSchema.parse({ name: 'Copy', modelCode: 'IM', file: old });
    expect(parsed.file).toEqual(current);
  });
});

describe('new machine models', () => {
  const models = [
    { code: 'RMMG', name: 'RigiMill MG' },
    { code: 'IM', name: 'IM8' },
  ];

  it('refuses a code or a name another model has, whatever the case', () => {
    expect(newModelConflict(models, { code: 'HMC800', name: 'HMC 800' })).toBeNull();
    expect(newModelConflict(models, { code: 'rmmg', name: 'New' })).toEqual({
      field: 'code',
      message: 'RMMG is already the code of RigiMill MG.',
    });
    expect(newModelConflict(models, { code: 'IM9', name: ' im8 ' })).toEqual({
      field: 'name',
      message: 'There is already a machine model called IM8 (IM).',
    });
  });
});

describe('quality checks', () => {
  const check: Template = {
    ...base,
    id: 'qc1',
    kind: 'quality',
    parentId: 'tpl1',
    name: 'Quality check – Pre start up',
    quality: {
      name: 'Pre start up',
      department: 'Quality',
      documentNumber: '1.22.2',
      madeBy: 'Sam Andersson',
      date: '2026-11-05',
    },
    sections: [
      {
        id: 's1',
        title: 'Safety features',
        items: [
          {
            id: 'i1',
            text: 'Check the safety decals on the X motors.',
            how: 'Visible, not turned inward.',
            references: ['ISO 12100', 'ISO 7010'],
            timeHours: 0.2,
          },
        ],
      },
    ],
  };
  const published: Template = { ...check, status: 'published', revision: 1 };
  const withItem = (patch: Partial<Item>): Template => ({
    ...check,
    sections: [{ ...check.sections[0]!, items: [{ ...check.sections[0]!.items[0]!, ...patch }] }],
  });

  it('publish needs a name (the title follows from it), and says rows need What', () => {
    expect(validateForPublish(check)).toEqual([]);
    const blank = { ...check, quality: { ...check.quality!, name: ' ' } };
    expect(validateForPublish(blank).map((issue) => issue.message)).toEqual([
      'The quality check needs a name.',
    ]);
    // The front page's name is what counts, not the title kept in step with it.
    expect(validateForPublish({ ...check, quality: undefined })[0]?.message).toBe(
      'The quality check needs a name.',
    );
    expect(validateForPublish(withItem({ text: ' ' })).map((issue) => issue.message)).toEqual([
      'Row 1.a needs “What to check”.',
    ]);
    // The other rules are the template's.
    expect(validateForPublish({ ...check, sections: [] })[0]?.message).toBe(
      'Add at least one section.',
    );
    // A final inspection template still needs its name, whatever a front page says.
    expect(
      validateForPublish({ ...base, name: ' ', quality: check.quality }).map((i) => i.message),
    ).toEqual(['The template needs a name.']);
  });

  it('counts changes to the front page and to how, references and time', () => {
    expect(hasUnpublishedChanges(check, published)).toBe(false);
    for (const field of ['name', 'department', 'documentNumber', 'madeBy'] as const) {
      const changed = { ...check, quality: { ...check.quality!, [field]: 'Changed' } };
      expect(hasUnpublishedChanges(changed, published), field).toBe(true);
    }
    expect(
      hasUnpublishedChanges({ ...check, quality: { ...check.quality!, date: '' } }, published),
    ).toBe(true);
    expect(hasUnpublishedChanges(withItem({ how: 'Turned outward.' }), published)).toBe(true);
    expect(hasUnpublishedChanges(withItem({ references: ['ISO 12100'] }), published)).toBe(true);
    expect(hasUnpublishedChanges(withItem({ timeHours: 0.3 }), published)).toBe(true);
    expect(hasUnpublishedChanges(withItem({ timeHours: undefined }), published)).toBe(true);
  });

  it('sees a blank how or no references as none', () => {
    const bare = withItem({ how: undefined, references: undefined });
    expect(sameTemplateContent(withItem({ how: '', references: [] }), bare)).toBe(true);
    // A final inspection template without the fields is unchanged by them being absent.
    expect(sameTemplateContent(base, { ...base })).toBe(true);
  });

  it('draft input keeps the front page', () => {
    const parsed = TemplateDraftInputSchema.parse({ ...check, kind: 'final', parentId: 'x' });
    expect(Object.keys(parsed).sort()).toEqual(['modelCode', 'name', 'quality', 'sections']);
    expect(parsed.quality).toEqual(check.quality);
  });

  it('create takes the machine and a name', () => {
    const request = { kind: 'quality', parentId: 'tpl1', name: ' Pre start up ' };
    expect(CreateQualityCheckRequestSchema.parse(request)).toEqual({
      ...request,
      name: 'Pre start up',
    });
    expect(CreateQualityCheckRequestSchema.safeParse({ ...request, name: ' ' }).success).toBe(
      false,
    );
    expect(
      CreateQualityCheckRequestSchema.safeParse({ ...request, parentId: '../x' }).success,
    ).toBe(false);
    // POST /api/templates tells the two apart by kind.
    expect(CreateAnyTemplateRequestSchema.parse(request)).toMatchObject({ kind: 'quality' });
    const final = { name: 'Final inspection – IM8', modelCode: 'IM' };
    expect(CreateAnyTemplateRequestSchema.parse(final)).toEqual(final);
    // A quality check missing its machine is never taken for a final inspection template.
    expect(CreateAnyTemplateRequestSchema.safeParse({ ...final, kind: 'quality' }).success).toBe(
      false,
    );
  });

  it('import takes a quality check file only, and the template import refuses one', () => {
    const file = qualityCheckExport(check, 'RigiMill MG', '2026-11-05T08:00:00.000Z');
    const request = { kind: 'quality', parentId: 'tpl1', name: 'Pre start up', file };
    expect(ImportQualityCheckRequestSchema.parse(request)).toEqual(request);
    expect(ImportAnyTemplateRequestSchema.parse(request)).toEqual(request);
    const templateFile = templateExport(base, 'RigiMill MG', '2026-11-05T08:00:00.000Z');
    expect(
      ImportQualityCheckRequestSchema.safeParse({ ...request, file: templateFile }).success,
    ).toBe(false);
    expect(
      ImportTemplateRequestSchema.safeParse({ name: 'Copy', modelCode: 'IM', file }).success,
    ).toBe(false);
    expect(
      ImportAnyTemplateRequestSchema.safeParse({ ...request, file: templateFile }).success,
    ).toBe(false);
    // A template file imports as before.
    const old = { name: 'Copy', modelCode: 'IM', file: templateFile };
    expect(ImportAnyTemplateRequestSchema.parse(old)).toEqual(old);
  });
});
