/**
 * Reads an assembly workbook (the "HHV assembly" sheet used in production) into an assembly
 * instruction file (shared/src/assembly.ts), to be imported with Import JSON on the Assembly page.
 * Pure: no I/O; the caller loads the workbook and writes the file.
 *
 * The sheet is a table with a header row ("Working steps", "Department", "List of bolts"…) and
 * one row per step. A row with only its "Arbetsmoment" cell filled ("Task 1") starts a task. What
 * the instruction takes from a step's row:
 *
 *   Working steps          the step
 *   Department             who does it ("MECHANICS" becomes "Mechanics"); a name that is none of
 *                          the departments is a supplier's ("Skylt-reklam"): the step is the
 *                          "External company"'s, with the supplier named in its instructions
 *   Estimated time (min)   its time
 *   List of bolts          the cell's note is the bolt list, a bolt to a line
 *   Part number            part numbers, separated by commas
 *   Assy number, Assy name the assembly the parts are in
 *   Instructions, Assy drawings   documents: the cell's link (a path on the server) or its text
 *   Parts from pre-assembly       an X, or "Delivered from Pre-assy" among the bolts
 *   Comments               the step's instructions, unless left out
 *
 * What belongs to the work on one machine (who signed, when, status, actual times, the mechanics'
 * comments) is not part of an instruction and is left behind, as is the Swedish text.
 */
import type { Cell, Workbook, Worksheet } from 'exceljs';
import {
  ASSEMBLY_EXPORT_FORMAT,
  MAX_FASTENERS,
  MAX_STEP_MINUTES,
  parseFasteners,
  parsePartNumbers,
  type AssemblyExportInput,
} from '@modig/shared';

type FileStep = AssemblyExportInput['instruction']['tasks'][number]['steps'][number];

/** The columns, by the words in the header row (lower case). */
const HEADERS = {
  text: 'working steps',
  task: 'arbetsmoment',
  department: 'department',
  bolts: 'list of bolts',
  instructions: 'instructions',
  drawings: 'assy drawings',
  parts: 'part number',
  assyNumber: 'assy number',
  assyName: 'assy name',
  comments: 'comments',
  minutes: 'estimated time (min)',
  preAssembly: 'parts from pre-assembly',
} as const;
type Column = keyof typeof HEADERS;

/** The company's own departments, as the sheet names them (lower case). */
const DEPARTMENTS = new Set([
  'mechanics',
  'electrician',
  'media',
  'metrology',
  'start-up',
  'packaging',
  'q-check',
]);
/** The department of a step done by a supplier, whose name the sheet has in the Department column. */
export const EXTERNAL_COMPANY = 'External company';

export type ParsedAssembly = {
  file: AssemblyExportInput;
  tasks: number;
  steps: number;
  /** How many steps got a bolt list, and how many documents were found. */
  boltLists: number;
  documents: number;
  warnings: string[];
};

export type ParseOptions = {
  /** The instruction's name; the sheet's title cell or name when left out. */
  name?: string | undefined;
  modelCode?: string | undefined;
  modelName?: string | undefined;
  /** Leave the "Comments" column out of the steps' instructions. */
  skipComments?: boolean | undefined;
};

export function parseAssemblyWorkbook(
  workbook: Workbook,
  options: ParseOptions = {},
): ParsedAssembly {
  const found = findSheet(workbook);
  if (!found) {
    throw new Error(
      'No sheet with a "Working steps" column in its first rows: this is not an assembly workbook.',
    );
  }
  const { sheet, headerRow, columns } = found;
  const warnings: string[] = [];
  const tasks: AssemblyExportInput['instruction']['tasks'] = [];
  let boltLists = 0;
  let documents = 0;

  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const cell = (column: Column) => {
      const at = columns[column];
      return at === undefined ? undefined : row.getCell(at);
    };
    // The table's totals row counts the steps with a formula: it is not one of them.
    if (isFormula(cell('text'))) continue;
    const text = cellText(cell('text'));
    if (!text) {
      // A task's heading: only its name, in the Swedish column.
      const title = cellText(cell('task'));
      if (title) tasks.push({ title, steps: [] });
      continue;
    }
    if (tasks.length === 0) tasks.push({ title: 'Task 1', steps: [] });

    const step: FileStep = { text: text.slice(0, 1000) };
    const department = departmentName(cellText(cell('department')));
    // A supplier's step: its name goes first in the step's instructions.
    const supplier = department && !DEPARTMENTS.has(department.toLowerCase()) ? department : '';
    if (department) step.department = supplier ? EXTERNAL_COMPANY : department;
    const minutes = cellNumber(cell('minutes'));
    if (minutes !== undefined) {
      if (Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_STEP_MINUTES) {
        step.minutes = minutes;
      } else {
        warnings.push(`Row ${rowNumber}: the estimated time ${minutes} was left out.`);
      }
    }
    const bolts = cellText(cell('bolts'));
    const fasteners = parseFasteners(noteText(cell('bolts')));
    if (fasteners.length > 0) {
      step.fasteners = fasteners.slice(0, MAX_FASTENERS);
      boltLists++;
    } else if (/bolt list available/i.test(bolts)) {
      warnings.push(`Row ${rowNumber}: "Bolt list available", but the cell has no note with it.`);
    }
    if (/pre-?assy/i.test(bolts) || /^x$/i.test(cellText(cell('preAssembly')))) {
      step.fromPreAssembly = true;
    }
    const parts = parsePartNumbers(cellText(cell('parts')));
    if (parts.length > 0) step.partNumbers = parts;
    const assyNumber = cellText(cell('assyNumber'));
    if (assyNumber) step.assyNumber = assyNumber.slice(0, 100);
    const assyName = cellText(cell('assyName'));
    if (assyName) step.assyName = assyName.slice(0, 200);
    const targets = [cell('instructions'), cell('drawings')]
      .map(documentTarget)
      .filter((target) => target !== '');
    if (targets.length > 0) {
      step.documents = targets;
      documents += targets.length;
    }
    const comment = options.skipComments ? '' : cellText(cell('comments'));
    const description = [supplier && `${EXTERNAL_COMPANY}: ${supplier}`, comment]
      .filter(Boolean)
      .join('\n');
    if (description) step.description = description.slice(0, 5000);
    tasks.at(-1)!.steps.push(step);
  }

  const steps = tasks.reduce((count, task) => count + task.steps.length, 0);
  if (steps === 0) throw new Error(`The sheet "${sheet.name}" has no steps.`);
  for (const task of tasks) {
    if (task.steps.length === 0) warnings.push(`“${task.title}” has no steps.`);
  }
  const name = (options.name ?? sheetTitle(sheet, headerRow) ?? sheet.name).trim().slice(0, 200);
  return {
    file: {
      format: ASSEMBLY_EXPORT_FORMAT,
      version: 1,
      instruction: {
        name,
        ...(options.modelCode && { modelCode: options.modelCode }),
        ...(options.modelName && { modelName: options.modelName }),
        tasks,
      },
    },
    tasks: tasks.length,
    steps,
    boltLists,
    documents,
    warnings,
  };
}

/** The first sheet with a "Working steps" header in its first rows, and where its columns are. */
function findSheet(
  workbook: Workbook,
): { sheet: Worksheet; headerRow: number; columns: Partial<Record<Column, number>> } | null {
  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= Math.min(10, sheet.rowCount); rowNumber++) {
      const columns: Partial<Record<Column, number>> = {};
      sheet.getRow(rowNumber).eachCell((cell, columnNumber) => {
        const header = cellText(cell).toLowerCase();
        for (const [column, words] of Object.entries(HEADERS) as [Column, string][]) {
          if (header === words) columns[column] ??= columnNumber;
        }
      });
      if (columns.text !== undefined) return { sheet, headerRow: rowNumber, columns };
    }
  }
  return null;
}

/** A title above the header row ("Assembly HHV-3 24-Tools scheme"), if there is one. */
function sheetTitle(sheet: Worksheet, headerRow: number): string | undefined {
  for (let rowNumber = 1; rowNumber < headerRow; rowNumber++) {
    let title: string | undefined;
    sheet.getRow(rowNumber).eachCell((cell) => {
      title ??= cellText(cell) || undefined;
    });
    if (title) return title;
  }
  return undefined;
}

/** "MECHANICS" → "Mechanics", "START-UP" → "Start-up"; anything in mixed case stays as it is. */
function departmentName(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  return trimmed === trimmed.toUpperCase()
    ? trimmed.charAt(0) + trimmed.slice(1).toLowerCase()
    : trimmed;
}

/** A cell's text, whatever it holds: text, a number, rich text, a link or a formula's result. */
function cellText(cell: Cell | undefined): string {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if ('richText' in value)
    return value.richText
      .map((part) => part.text)
      .join('')
      .trim();
  if ('text' in value) return String(value.text ?? '').trim();
  if ('result' in value) return value.result === undefined ? '' : String(value.result).trim();
  return '';
}

function isFormula(cell: Cell | undefined): boolean {
  const value = cell?.value;
  return typeof value === 'object' && value !== null && 'formula' in value;
}

function cellNumber(cell: Cell | undefined): number | undefined {
  const text = cellText(cell).replace(',', '.');
  if (text === '') return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * A cell's note, as its author wrote it. Excel's newer "threaded comments" (a conversation about
 * the cell) leave a note that starts with "[Threaded comment]": that is no bolt list.
 */
function noteText(cell: Cell | undefined): string {
  const note = cell?.note;
  if (!note) return '';
  const text =
    typeof note === 'string' ? note : (note.texts ?? []).map((part) => part.text).join('');
  return text.trimStart().startsWith('[Threaded comment]') ? '' : text;
}

/**
 * Where a document cell points: its link when it has one (a path on the file server, written as
 * the server's name so it works whatever drive letters a PC maps), else its text.
 */
function documentTarget(cell: Cell | undefined): string {
  const value = cell?.value;
  const link =
    (value && typeof value === 'object' && 'hyperlink' in value ? value.hyperlink : undefined) ??
    cell?.hyperlink;
  const target = link ? serverPath(link) : cellText(cell);
  return target.slice(0, 1000);
}

/** "file:///\\SRV102\share\My%20file.pdf" → "\\SRV102\share\My file.pdf"; other links as they are. */
function serverPath(link: string): string {
  const match = /^file:\/{2,3}(.*)$/i.exec(link.trim());
  if (!match) return link.trim();
  let path = match[1] ?? '';
  try {
    path = decodeURIComponent(path);
  } catch {
    // Left as written.
  }
  path = path.replace(/\//g, '\\');
  // "file://SRV102/share/…" names the server without the two backslashes.
  return /^\\\\|^[a-z]:\\/i.test(path) ? path : `\\\\${path.replace(/^\\+/, '')}`;
}
