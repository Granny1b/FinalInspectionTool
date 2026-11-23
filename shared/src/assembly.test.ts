import { describe, expect, it } from 'vitest';
import {
  ASSEMBLY_EXPORT_FORMAT,
  assemblyExport,
  AssemblyExportSchema,
  assemblyFileSections,
  cleanAssemblyStep,
  documentName,
  formatFasteners,
  formatMinutes,
  isWebLink,
  parseDocumentLine,
  parseFastenerLine,
  parseFasteners,
  parseMinutes,
  parsePartNumbers,
  stepRef,
  totalMinutes,
} from './assembly';
import { TemplateSchema, type Section } from './schemas';
import { sameTemplateContent, validateForPublish } from './templates';

describe('bolt lists', () => {
  it.each([
    ['8 pcs - M6S M8x25', { quantity: 8, designation: 'M6S M8x25' }],
    ['24 Pcs MC6S M6x16', { quantity: 24, designation: 'MC6S M6x16' }],
    ['24 PCS MC6S M8X25', { quantity: 24, designation: 'MC6S M8X25' }],
    ['6 PCS NB 6X22X1,5 FZB', { quantity: 6, designation: 'NB 6X22X1,5 FZB' }],
    ['K6SF M6x16 9st', { quantity: 9, designation: 'K6SF M6x16' }],
    ['8 x MC6S M8x30', { quantity: 8, designation: 'MC6S M8x30' }],
    ['8 - MC6S M8x30', { quantity: 8, designation: 'MC6S M8x30' }],
    ['MC6S M8x25', { designation: 'MC6S M8x25' }],
    ['427009-NBR sealing', { designation: '427009-NBR sealing' }],
    ['2 Pcs M6S M8 x20  ', { quantity: 2, designation: 'M6S M8 x20' }],
  ])('reads %j', (line, fastener) => {
    expect(parseFastenerLine(line)).toEqual(fastener);
  });

  it('reads a pasted list, skipping blank lines, and writes it back', () => {
    const list = parseFasteners('8 pcs - M6S M8x25\n8 pcs - TBRSB M8 FZB\n\n');
    expect(list).toEqual([
      { quantity: 8, designation: 'M6S M8x25' },
      { quantity: 8, designation: 'TBRSB M8 FZB' },
    ]);
    expect(formatFasteners(list)).toBe('8 pcs M6S M8x25\n8 pcs TBRSB M8 FZB');
    expect(parseFasteners(formatFasteners(list))).toEqual(list);
  });
});

describe('documents', () => {
  it('reads a path, a quoted path and a named one', () => {
    expect(parseDocumentLine('\\\\SRV102\\share\\I 82423-02.pdf')).toEqual({
      target: '\\\\SRV102\\share\\I 82423-02.pdf',
    });
    expect(parseDocumentLine('"K:\\Ritningsarkiv\\86265-00.pdf"')).toEqual({
      target: 'K:\\Ritningsarkiv\\86265-00.pdf',
    });
    expect(parseDocumentLine('Drawing | https://example.com/a.pdf')).toEqual({
      label: 'Drawing',
      target: 'https://example.com/a.pdf',
    });
    expect(parseDocumentLine('   ')).toBeNull();
  });

  it('knows a web address from a path, and names a document by its file', () => {
    expect(isWebLink('https://example.com/a.pdf')).toBe(true);
    expect(isWebLink('\\\\SRV102\\share\\a.pdf')).toBe(false);
    expect(isWebLink('K:\\a.pdf')).toBe(false);
    expect(documentName({ target: '\\\\SRV102\\share\\I 82423-02 Operator panel.pdf' })).toBe(
      'I 82423-02 Operator panel.pdf',
    );
    expect(documentName({ target: 'https://example.com/docs/My%20file.pdf' })).toBe('My file.pdf');
    expect(documentName({ label: 'Drawing', target: 'K:\\a.pdf' })).toBe('Drawing');
  });
});

describe('time, parts and numbers', () => {
  it('formats and reads minutes', () => {
    expect(formatMinutes(10)).toBe('10 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(parseMinutes('')).toBeUndefined();
    expect(parseMinutes('90')).toBe(90);
    expect(parseMinutes('90 min')).toBe(90);
    expect(parseMinutes('1,5 h')).toBe(90);
    expect(parseMinutes('1h 30')).toBe(90);
    expect(parseMinutes('soon')).toBeNull();
    expect(parseMinutes('-5')).toBeNull();
  });

  it('splits part numbers and drops duplicates', () => {
    expect(parsePartNumbers('80065, 82053;80065\n199112230')).toEqual([
      '80065',
      '82053',
      '199112230',
    ]);
  });

  it('counts steps and sums their time', () => {
    expect(stepRef(2, 11)).toBe('3.12');
    expect(
      totalMinutes([
        { items: [{ assembly: { minutes: 30 } }, {}] },
        { items: [{ assembly: { minutes: 15 } }] },
      ]),
    ).toBe(45);
  });

  it('leaves empty fields out of a step', () => {
    expect(cleanAssemblyStep({ department: ' ', fasteners: [], fromPreAssembly: false })).toBe(
      undefined,
    );
    expect(cleanAssemblyStep({ department: ' Mechanics ', minutes: 0 })).toEqual({
      department: 'Mechanics',
      minutes: 0,
    });
  });
});

const sections: Section[] = [
  {
    id: 'task1',
    title: 'Task 1',
    items: [
      {
        id: 'step1',
        text: 'Mount Pan 80069',
        guide: { description: 'Mind the gasket.', images: [] },
        assembly: {
          department: 'Mechanics',
          minutes: 10,
          fasteners: [{ quantity: 4, designation: 'MC6S M10x25' }],
          partNumbers: ['80069'],
          assyNumber: '82265',
          assyName: 'Base, HHV3',
          documents: [{ target: 'K:\\a.pdf' }],
        },
      },
      { id: 'step2', text: 'Mount Coolant pipes in base' },
    ],
  },
];

describe('the assembly instruction file', () => {
  it('goes out and comes back with the same content under new ids', () => {
    const file = assemblyExport(
      { name: 'HHV-3 24-Tools scheme', modelCode: 'HHV3', sections },
      'HHV 3',
      '2026-11-23T10:00:00.000Z',
    );
    expect(file.format).toBe(ASSEMBLY_EXPORT_FORMAT);
    expect(file.instruction.tasks[0]?.steps[0]).toMatchObject({
      text: 'Mount Pan 80069',
      description: 'Mind the gasket.',
      minutes: 10,
    });
    let n = 0;
    const back = assemblyFileSections(AssemblyExportSchema.parse(file), () => `id${++n}`);
    expect(back.map((s) => s.id)).toEqual(['id1']);
    expect(back[0]?.items.map((i) => i.id)).toEqual(['id2', 'id3']);
    const withoutIds = (list: Section[]) =>
      list.map((s) => ({ ...s, id: '', items: s.items.map((i) => ({ ...i, id: '' })) }));
    expect(withoutIds(back)).toEqual(withoutIds(sections));
  });

  it('takes a file written by hand: no ids, bolts and documents as text', () => {
    const file = AssemblyExportSchema.parse({
      format: ASSEMBLY_EXPORT_FORMAT,
      version: 1,
      instruction: {
        name: 'By hand',
        tasks: [
          {
            title: 'Task 1',
            steps: [
              {
                text: 'Mount Base tend 80065 & 82053',
                fasteners: ['8 pcs - M6S M8x25', { designation: 'TBRSB M8 FZB' }, '  '],
                documents: ['Drawing | K:\\Ritningsarkiv\\86265-00.pdf'],
              },
            ],
          },
        ],
      },
    });
    const [task] = assemblyFileSections(file);
    expect(task?.items[0]?.assembly).toEqual({
      fasteners: [{ quantity: 8, designation: 'M6S M8x25' }, { designation: 'TBRSB M8 FZB' }],
      documents: [{ label: 'Drawing', target: 'K:\\Ritningsarkiv\\86265-00.pdf' }],
    });
    expect(task?.items[0]?.guide).toBeUndefined();
  });

  it('refuses another format', () => {
    expect(
      AssemblyExportSchema.safeParse({
        format: 'modig-final-inspection/quality-check',
        version: 1,
        instruction: { name: '', tasks: [] },
      }).success,
    ).toBe(false);
  });
});

describe('an assembly instruction as a template', () => {
  it('parses with its steps’ fields, and older templates stay final', () => {
    const template = TemplateSchema.parse({
      id: 'a1',
      kind: 'assembly',
      name: 'HHV-3',
      modelCode: 'HHV3',
      revision: 1,
      status: 'draft',
      sections,
      updatedAt: '2026-11-23T10:00:00.000Z',
      updatedBy: 'a@b.se',
    });
    expect(template.kind).toBe('assembly');
    expect(template.sections[0]?.items[0]?.assembly?.minutes).toBe(10);
  });

  it('needs a name, a task, a step and every step’s text to publish', () => {
    expect(validateForPublish({ kind: 'assembly', name: ' ', sections: [] })).toEqual([
      { target: { kind: 'template' }, message: 'The assembly instruction needs a name.' },
      { target: { kind: 'template' }, message: 'Add at least one task.' },
    ]);
    const issues = validateForPublish({
      kind: 'assembly',
      name: 'HHV-3',
      sections: [{ id: 't', title: '', items: [{ id: 's', text: '' }] }],
    });
    expect(issues.map((issue) => issue.message)).toEqual([
      'Task 1 needs a title.',
      'Step 1.1 needs its text.',
    ]);
    expect(validateForPublish({ kind: 'assembly', name: 'HHV-3', sections })).toEqual([]);
  });

  it('sees a changed step field as a change, and an empty one as none', () => {
    const base = { name: 'HHV-3', modelCode: 'HHV3', sections };
    const changed = structuredClone(sections);
    changed[0]!.items[0]!.assembly!.minutes = 20;
    expect(sameTemplateContent(base, { ...base, sections: changed })).toBe(false);
    const blank = structuredClone(sections);
    blank[0]!.items[1]!.assembly = { department: '', fasteners: [] };
    expect(sameTemplateContent(base, { ...base, sections: blank })).toBe(true);
  });
});
