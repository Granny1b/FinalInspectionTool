import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LOCATION, ID_PATTERN, indexItems } from '@modig/shared';
import { parseRealWorkbook } from '../test/real-workbook';
import { parseWorkbook, SHEETS, type ParsedWorkbook } from './parse-workbook';

describe('parseWorkbook — Final_Inspection_rev_2.xlsm', () => {
  let parsed: ParsedWorkbook;
  beforeAll(async () => {
    parsed = await parseRealWorkbook();
  });

  it('finds the six sections with their titles and item counts', () => {
    expect(parsed.sections.map((s) => s.title)).toEqual([
      'Loading area',
      'Tool Arena',
      'Electrical Cabinets',
      'Machining area',
      'Gantry',
      'External units',
    ]);
    expect(parsed.sections.map((s) => s.items.length)).toEqual([20, 15, 10, 5, 22, 18]);
  });

  it('flattens rich text and normalises whitespace', () => {
    const textByRef = new Map(indexItems(parsed.sections).map((row) => [row.ref, row.text]));
    expect(textByRef.get('1.a')).toBe(
      'Hydraulic for fixators and lifters - Correct markings, labels, cable channels.',
    );
    expect(textByRef.get('3.c')).toBe('Main Cabinet - Verify labeling on cables and components');
    expect(textByRef.get('5.l')).toBe(
      'NC4 - Correctly installed, functioning, bracket correct, not damaged',
    );
    expect(textByRef.get('6.r')).toBe('Main pneumatic cabinet - Settings configured');

    const texts = [
      ...parsed.sections.map((s) => s.title),
      ...parsed.sections.flatMap((s) => s.items.map((i) => i.text)),
    ];
    for (const text of texts) {
      expect(text).not.toContain('[object Object]');
      expect(text).not.toMatch(/^\s|\s$|\s\s/);
      expect(text).not.toBe('');
    }
  });

  it('gives every section and item a fresh, unique, valid id', () => {
    const ids = parsed.sections.flatMap((s) => [s.id, ...s.items.map((i) => i.id)]);
    expect(ids).toHaveLength(6 + 90);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(ID_PATTERN);
  });

  it('reads the machine models in workbook order', () => {
    expect(parsed.models).toEqual([
      { name: 'HHV3', code: 'HHVSingle' },
      { name: 'HHV3 DUO', code: 'HHVDUO' },
      { name: 'Mill-Ex', code: 'MILLEX' },
      { name: 'RigiMill MT', code: 'RMMT' },
      { name: 'RigiMill MG', code: 'RMMG' },
      { name: 'IM8', code: 'IM' },
    ]);
  });

  it('reads the revision and default location from the front page, without warnings', () => {
    expect(parsed.publishedRevision).toBe(2);
    expect(parsed.defaultLocation).toBe('Kalmar, Sweden');
    expect(parsed.warnings).toEqual([]);
  });
});

describe('parseWorkbook — rules', () => {
  type Rows = [marker: string | number | null, text: string | null][];

  /** The smallest workbook with the real layout: checklist B/D, Misc A/B/E, Main labels. */
  function workbook({
    checklist = [
      [1, 'Loading area'],
      ['a', 'Light curtains - Correct height'],
    ],
    models = [['RigiMill MG', 'RMMG']],
    statuses = ['OK', 'NOK', 'N/A'],
    front = [['Location'], ['Kalmar, Sweden'], ['Rev: 2']],
  }: {
    checklist?: Rows;
    models?: string[][];
    statuses?: string[];
    front?: string[][];
  } = {}): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    const main = wb.addWorksheet(SHEETS.front);
    front.forEach(([text], i) => (main.getCell(i + 1, 5).value = text ?? null));
    const sheet = wb.addWorksheet(SHEETS.checklist);
    checklist.forEach(([marker, text], i) => {
      sheet.getCell(i + 4, 2).value = marker;
      sheet.getCell(i + 4, 4).value = text;
    });
    const misc = wb.addWorksheet(SHEETS.lists);
    models.forEach(([name, code], i) => {
      misc.getCell(i + 2, 1).value = name ?? null;
      misc.getCell(i + 2, 2).value = code ?? null;
    });
    statuses.forEach((status, i) => (misc.getCell(i + 2, 5).value = status));
    return wb;
  }

  it('skips lettered rows without text (spare lines)', () => {
    const parsed = parseWorkbook(
      workbook({
        checklist: [
          [1, 'Loading area'],
          ['a', 'Light curtains - Correct height'],
          ['b', null],
          [2, 'Tool Arena'],
          ['a', 'Robot - Warning labels visible'],
          ['b', '   '],
        ],
      }),
    );
    expect(parsed.sections.map((s) => s.items.map((i) => i.text))).toEqual([
      ['Light curtains - Correct height'],
      ['Robot - Warning labels visible'],
    ]);
  });

  it('warns about letters out of sequence but keeps the row in position', () => {
    const parsed = parseWorkbook(
      workbook({
        checklist: [
          [1, 'Loading area'],
          ['a', 'First'],
          ['c', 'Second'],
        ],
      }),
    );
    expect(parsed.sections[0]?.items.map((i) => i.text)).toEqual(['First', 'Second']);
    expect(parsed.warnings).toEqual([
      expect.stringContaining('"c" in section 1 is imported as 1.b'),
    ]);
  });

  it('skips rows with text but no section number or letter, and names them in a warning', () => {
    const parsed = parseWorkbook(
      workbook({
        checklist: [
          [1, 'Loading area'],
          ['a', 'First'],
          [null, 'A note'],
          ['b', 'Second'],
          ['c.', 'Third'],
        ],
      }),
    );
    expect(parsed.sections[0]?.items.map((i) => i.text)).toEqual(['First', 'Second']);
    expect(parsed.warnings).toEqual([
      expect.stringContaining('skipped "A note": column B "" is neither'),
      expect.stringContaining('skipped "Third": column B "c." is neither'),
    ]);
  });

  it('falls back to revision 1 and the default location, with warnings', () => {
    const parsed = parseWorkbook(workbook({ front: [['Machine name']] }));
    expect(parsed.publishedRevision).toBe(1);
    expect(parsed.defaultLocation).toBe(DEFAULT_LOCATION);
    expect(parsed.warnings).toHaveLength(2);
  });

  it('does not take a Location label merged over two rows as its own value', () => {
    const wb = workbook({ front: [['Location'], [], ['Kalmar, Sweden'], ['Rev: 2']] });
    wb.getWorksheet(SHEETS.front)?.mergeCells('E1:E2');
    const parsed = parseWorkbook(wb);
    expect(parsed.defaultLocation).toBe(DEFAULT_LOCATION);
    expect(parsed.warnings).toEqual([expect.stringContaining('no value under a "Location" label')]);
  });

  it('warns when the status list differs from the app', () => {
    const parsed = parseWorkbook(workbook({ statuses: ['OK', 'NOK'] }));
    expect(parsed.warnings).toEqual([expect.stringContaining('statuses [OK, NOK]')]);
  });

  it.each<[string, Parameters<typeof workbook>[0], RegExp]>([
    [
      'sections out of order',
      {
        checklist: [
          [2, 'Tool Arena'],
          ['a', 'Robot'],
        ],
      },
      /section 2 where section 1 was expected/,
    ],
    [
      'a section without items',
      {
        checklist: [
          [1, 'Loading area'],
          ['a', null],
          [2, 'Tool Arena'],
          ['a', 'Robot'],
        ],
      },
      /section 1 "Loading area" has no items/,
    ],
    ['an item before any section', { checklist: [['a', 'Robot']] }, /before the first section/],
    [
      'a section number stored as text',
      {
        checklist: [
          [1, 'Loading area'],
          ['a', 'First'],
          ['2', 'Tool Arena'],
          ['a', 'Robot'],
        ],
      },
      /section number "2" in column B is stored as text/,
    ],
    ['no sections at all', { checklist: [] }, /no section header rows/],
    [
      'duplicate model codes',
      {
        models: [
          ['RigiMill MG', 'RMMG'],
          ['RigiMill MG 2', 'RMMG'],
        ],
      },
      /"RMMG" is listed twice/,
    ],
    ['an invalid model code', { models: [['RigiMill MG', 'RM MG']] }, /invalid machine model/],
  ])('rejects %s', (_case, layout, message) => {
    expect(() => parseWorkbook(workbook(layout))).toThrow(message);
  });

  it('rejects a workbook without the checklist sheet', () => {
    const wb = workbook();
    wb.removeWorksheet(SHEETS.checklist);
    expect(() => parseWorkbook(wb)).toThrow(`no sheet named "${SHEETS.checklist}"`);
  });
});
