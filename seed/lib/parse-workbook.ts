/**
 * Reads Final_Inspection_rev_2.xlsm (brief §2) into plain data. Pure: no I/O, no storage —
 * the caller loads the workbook and decides what to do with the result.
 *
 * Hard problems (nothing sensible to import) throw; oddities that still give a usable template
 * (a letter out of sequence, a row skipped for its column B, a missing "Rev: N") become
 * `warnings`.
 */
import type { Cell, Workbook, Worksheet } from 'exceljs';
import {
  DEFAULT_LOCATION,
  MachineModelSchema,
  newId,
  rowLetter,
  STATUS_LABELS,
  type MachineModel,
  type Section,
} from '@modig/shared';

export const SHEETS = {
  front: 'Main',
  checklist: 'Slutkontroll_RM_MG',
  lists: 'Misc',
} as const;

export type ParsedWorkbook = {
  models: MachineModel[];
  /** Fresh ids for every section and item — this is where they are born. */
  sections: Section[];
  /** From "Rev: N" on the front page; the imported template becomes published revision N. */
  publishedRevision: number;
  defaultLocation: string;
  warnings: string[];
};

/** Item rows are lettered a, b, c… (aa, ab… beyond z) in column B. */
const ROW_LETTER = /^[a-z]+$/i;
/** Front-page revision text, e.g. "Rev: 2". */
const REVISION_TEXT = /^Rev:?\s*([1-9]\d*)$/i;

export function parseWorkbook(workbook: Workbook): ParsedWorkbook {
  const warnings: string[] = [];
  const sections = parseChecklist(sheet(workbook, SHEETS.checklist), warnings);
  const models = parseLists(sheet(workbook, SHEETS.lists), warnings);
  const front = parseFrontPage(sheet(workbook, SHEETS.front), warnings);
  return { models, sections, ...front, warnings };
}

/**
 * The brief's rule, literally: a section header row has an integer in column B and the title in
 * column D; item rows have a letter in column B and the checkpoint text in column D. Lettered rows
 * with an empty column D are spare lines for handwritten findings — now a print setting (brief §6).
 * Text in column D next to anything else in B ("b.", a note) is skipped with a warning, never
 * silently.
 */
function parseChecklist(ws: Worksheet, warnings: string[]): Section[] {
  const sections: Section[] = [];

  ws.eachRow((row, rowNumber) => {
    const where = `${ws.name} row ${rowNumber}`;
    const marker = row.getCell('B');
    const text = cellText(row.getCell('D'));

    if (Number.isInteger(marker.value)) {
      const expected = sections.length + 1;
      if (marker.value !== expected) {
        throw new Error(
          `${where}: found section ${String(marker.value)} where section ${expected} was expected (sections must be numbered 1..n in order)`,
        );
      }
      if (!text) throw new Error(`${where}: section ${expected} has no title in column D`);
      sections.push({ id: newId(), title: text, items: [] });
      return;
    }

    if (!text) return; // a spare line or an empty row
    const letter = cellText(marker).toLowerCase();
    if (/^\d+$/.test(letter)) {
      throw new Error(
        `${where}: section number "${letter}" in column B is stored as text; make it a number`,
      );
    }
    if (!ROW_LETTER.test(letter)) {
      warnings.push(
        `${where}: skipped "${text}": column B "${cellText(marker)}" is neither a section number nor a row letter`,
      );
      return;
    }

    const section = sections.at(-1);
    if (!section) {
      throw new Error(`${where}: checkpoint "${text}" comes before the first section header`);
    }
    // Display refs are derived from position, so a gap or typo in the letters only renumbers.
    const expectedLetter = rowLetter(section.items.length);
    if (letter !== expectedLetter) {
      warnings.push(
        `${where}: row lettered "${letter}" in section ${sections.length} is imported as ${sections.length}.${expectedLetter}`,
      );
    }
    section.items.push({ id: newId(), text });
  });

  if (sections.length === 0) {
    throw new Error(
      `Sheet "${ws.name}": no section header rows found (integer in column B, title in column D)`,
    );
  }
  sections.forEach((section, index) => {
    if (section.items.length === 0) {
      throw new Error(`Sheet "${ws.name}": section ${index + 1} "${section.title}" has no items`);
    }
  });
  return sections;
}

/** Misc holds the lookup lists: model names (A) with codes (B), and status values (E). */
function parseLists(ws: Worksheet, warnings: string[]): MachineModel[] {
  const models: MachineModel[] = [];
  for (const { rowNumber, text: name } of readList(ws, 'A')) {
    const code = cellText(ws.getRow(rowNumber).getCell('B'));
    const model = MachineModelSchema.safeParse({ code, name });
    if (!model.success) {
      throw new Error(
        `${ws.name} row ${rowNumber}: invalid machine model "${name}" / "${code}" (the code must be letters and digits)`,
      );
    }
    if (models.some((m) => m.code === model.data.code)) {
      throw new Error(`${ws.name} row ${rowNumber}: model code "${code}" is listed twice`);
    }
    models.push(model.data);
  }
  if (models.length === 0) throw new Error(`Sheet "${ws.name}": no machine models in column A`);

  // The status list is fixed in the data model; only flag it if the workbook disagrees.
  const statuses = readList(ws, 'E').map((entry) => entry.text);
  const expected = Object.values(STATUS_LABELS);
  if (statuses.join('|') !== expected.join('|')) {
    warnings.push(
      `${ws.name} column E lists statuses [${statuses.join(', ')}], the app uses [${expected.join(', ')}]`,
    );
  }
  return models;
}

/** Front page: revision text ("Rev: 2") anywhere on the sheet, location in the cell under its label. */
function parseFrontPage(
  ws: Worksheet,
  warnings: string[],
): Pick<ParsedWorkbook, 'publishedRevision' | 'defaultLocation'> {
  const cells: { cell: Cell; rowNumber: number; colNumber: number }[] = [];
  ws.eachRow((row, rowNumber) =>
    row.eachCell((cell, colNumber) => cells.push({ cell, rowNumber, colNumber })),
  );

  let publishedRevision = 1;
  const revision = cells.map(({ cell }) => REVISION_TEXT.exec(cellText(cell))).find(Boolean);
  if (revision?.[1]) {
    publishedRevision = Number(revision[1]);
  } else {
    warnings.push(`${ws.name}: no "Rev: N" text found — importing as revision 1`);
  }

  let defaultLocation = DEFAULT_LOCATION;
  const label = cells.find(({ cell }) => cellText(cell).toLowerCase() === 'location');
  const below = label && ws.getRow(label.rowNumber + 1).getCell(label.colNumber);
  // A label merged over two rows would otherwise "find" itself.
  const location = below && !below.isMergedTo(label.cell) ? cellText(below) : '';
  if (location) {
    defaultLocation = location;
  } else {
    warnings.push(`${ws.name}: no value under a "Location" label — using "${DEFAULT_LOCATION}"`);
  }

  return { publishedRevision, defaultLocation };
}

function sheet(workbook: Workbook, name: string): Worksheet {
  const ws = workbook.getWorksheet(name);
  if (!ws) throw new Error(`The workbook has no sheet named "${name}"`);
  return ws;
}

/** Non-empty cells of `column` from row 2 down to the first empty one (row 1 is blank in Misc). */
function readList(ws: Worksheet, column: string): { rowNumber: number; text: string }[] {
  const entries: { rowNumber: number; text: string }[] = [];
  for (let rowNumber = 2; ; rowNumber++) {
    const text = cellText(ws.getRow(rowNumber).getCell(column));
    if (!text) return entries;
    entries.push({ rowNumber, text });
  }
}

/**
 * The displayed text of a cell. exceljs' `text` flattens rich text (most checkpoint cells are a
 * bold component run + a plain " - description" run). It is read from the merge master because
 * on the other cells of a merged range `text` throws (empty master) or yields "[object Object]"
 * (rich-text master). Whitespace is collapsed because runs often meet with doubled spaces
 * ("NC4 " + " - …").
 */
function cellText(cell: Cell): string {
  return cell.master.text.replace(/\s+/g, ' ').trim();
}
