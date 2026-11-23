import ExcelJS from 'exceljs';
import { AssemblyExportSchema, assemblyFileSections } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { parseAssemblyWorkbook } from './parse-assembly-workbook';

const HEADER = [
  'Unique ID',
  'Sign with employee number',
  'Department',
  'Working steps',
  'Arbetsmoment',
  'List of bolts',
  'Instructions',
  'Assy drawings',
  'Part number',
  'Assy number',
  'Assy name',
  'Comments',
  'Estimated time (min)',
  'Parts from pre-assembly',
];

/** A small sheet shaped like the production one: a title, the header row, tasks and steps. */
function workbook(): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('HHV assembly');
  sheet.getCell('D1').value = 'Assembly HHV-3 24-Tools scheme';
  sheet.addRow(HEADER);
  sheet.addRow(['', '', '', '', 'Task 1']);
  sheet.addRow([
    10,
    '',
    'MECHANICS',
    'Mount Base tend 80065 & 82053',
    '',
    'Bolt list available',
    '',
    '',
    '80065, 82053',
    82265,
    'Base, HHV3',
    '',
    10,
    '',
  ]);
  sheet.getCell('F4').note = '8 pcs - M6S M8x25\n8 pcs - TBRSB M8 FZB\n';
  sheet.addRow([
    20,
    '3034',
    'MEDIA',
    'Mount Coolant pipes in base',
    'Montera rör',
    'Delivered from Pre-assy',
    '',
    '',
    '',
    '',
    '',
    'Missing on assy 82287',
    90,
    'X',
  ]);
  sheet.addRow(['', '', '', '', 'Task 2']);
  sheet.addRow([
    30,
    '',
    'START-UP',
    'Lift in XYZ-unit',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'soon',
    '',
  ]);
  sheet.getCell('G7').value = {
    text: 'I:\\8. Documentation public\\XYZ mounting.pdf',
    hyperlink: 'file:///\\\\SRV102\\gemensam$\\Gemensam\\XYZ%20mounting.pdf',
  };
  sheet.getCell('H7').value = 'K:\\Ritningsarkiv\\86265-00.pdf';
  sheet.getCell('F7').note = '[Threaded comment]\n\nComment:\n    8st K6SF M6x12?';
  sheet.addRow([
    40,
    '',
    'Skylt-reklam',
    'Wrap the media cabinet',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'After paint',
    60,
    '',
  ]);
  sheet.addRow(['', 'Total', '', { formula: 'SUBTOTAL(103,D3:D7)', result: 3 }]);
  return book;
}

describe('parseAssemblyWorkbook', () => {
  it('reads tasks and steps with their bolts, parts, documents and time', () => {
    const parsed = parseAssemblyWorkbook(workbook(), { modelCode: 'HHV3' });
    expect(parsed).toMatchObject({ tasks: 2, steps: 4, boltLists: 1, documents: 2 });
    const { instruction } = parsed.file;
    expect(instruction.name).toBe('Assembly HHV-3 24-Tools scheme');
    expect(instruction.modelCode).toBe('HHV3');
    expect(instruction.tasks.map((task) => task.title)).toEqual(['Task 1', 'Task 2']);
    expect(instruction.tasks[0]?.steps).toEqual([
      {
        text: 'Mount Base tend 80065 & 82053',
        department: 'Mechanics',
        minutes: 10,
        fasteners: [
          { quantity: 8, designation: 'M6S M8x25' },
          { quantity: 8, designation: 'TBRSB M8 FZB' },
        ],
        partNumbers: ['80065', '82053'],
        assyNumber: '82265',
        assyName: 'Base, HHV3',
      },
      {
        text: 'Mount Coolant pipes in base',
        department: 'Media',
        minutes: 90,
        fromPreAssembly: true,
        description: 'Missing on assy 82287',
      },
    ]);
    // The link's server path, not the drive letter; a time that is no number is left out; a
    // threaded comment is no bolt list; the totals row is no step.
    expect(instruction.tasks[1]?.steps).toEqual([
      {
        text: 'Lift in XYZ-unit',
        department: 'Start-up',
        documents: [
          '\\\\SRV102\\gemensam$\\Gemensam\\XYZ mounting.pdf',
          'K:\\Ritningsarkiv\\86265-00.pdf',
        ],
      },
      // A supplier in the Department column: an external company, named in the instructions.
      {
        text: 'Wrap the media cabinet',
        department: 'External company',
        minutes: 60,
        description: 'External company: Skylt-reklam\nAfter paint',
      },
    ]);
  });

  it('makes a file the import takes, and can leave the comments out', () => {
    const parsed = parseAssemblyWorkbook(workbook(), { name: 'Mine', skipComments: true });
    expect(parsed.file.instruction.name).toBe('Mine');
    expect(parsed.file.instruction.tasks[0]?.steps[1]?.description).toBeUndefined();
    const sections = assemblyFileSections(AssemblyExportSchema.parse(parsed.file));
    expect(sections).toHaveLength(2);
    expect(sections[1]?.items[0]?.assembly?.documents).toHaveLength(2);
  });

  it('refuses a workbook without the sheet', () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Other').addRow(['Nothing', 'here']);
    expect(() => parseAssemblyWorkbook(book)).toThrow(/not an assembly workbook/);
  });
});
