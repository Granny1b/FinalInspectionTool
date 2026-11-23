/**
 * Assembly instructions: a machine model's build written as tasks of steps ("Task 1 – Mount Pan
 * 80069"), each step with its pictures, bolt list, part numbers, documents, department and
 * estimated time. One is a template of kind `assembly` for its model: a task is a section and a
 * step a row, so drafts, autosave, publishing in revisions and pictures are the template's.
 *
 * Pure helpers shared by the API and the app, and the instruction's JSON file. The file is written
 * to be made by hand or by a script as well as by Export JSON: tasks and steps without ids, a bolt
 * as "8 pcs MC6S M8x25" or as `{ quantity, designation }`, a document as a path or as
 * `{ label, target }`.
 */
import { z } from 'zod';
import { newId } from './ids';
import {
  AssemblyStepSchema,
  FastenerSchema,
  GUIDE_VERDICTS,
  GuideImageSchema,
  MAX_FASTENERS,
  MAX_GUIDE_IMAGES,
  MAX_PART_NUMBERS,
  MAX_STEP_DOCUMENTS,
  MAX_STEP_MINUTES,
  ModelCodeSchema,
  PartNumberSchema,
  StepDocumentSchema,
  type AssemblyStep,
  type Fastener,
  type Item,
  type Section,
  type StepDocument,
  type Template,
} from './schemas';

// ---------------------------------------------------------------------------------------------
// Numbers and time
// ---------------------------------------------------------------------------------------------

/** "3.12" for the twelfth step of the third task: steps are counted, not lettered. */
export function stepRef(taskIndex: number, stepIndex: number): string {
  return `${taskIndex + 1}.${stepIndex + 1}`;
}

/** The estimated time of these steps together, in minutes. */
export function stepsMinutes(items: readonly Pick<Item, 'assembly'>[]): number {
  return items.reduce((sum, item) => sum + (item.assembly?.minutes ?? 0), 0);
}

/** The estimated time of a whole instruction, in minutes. */
export function totalMinutes(sections: readonly { items: readonly Pick<Item, 'assembly'>[] }[]) {
  return sections.reduce((sum, section) => sum + stepsMinutes(section.items), 0);
}

/** "10 min", "1 h", "1 h 30 min", "598 h 14 min". */
export function formatMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Minutes as typed, "90" (or "1.5 h", "1,5h", "1 h 30"): the whole number of minutes, null when
 * it is not a time, or undefined when the field is empty.
 */
export function parseMinutes(text: string): number | null | undefined {
  const trimmed = text.trim().toLowerCase().replace(',', '.');
  if (trimmed === '') return undefined;
  let minutes: number;
  const hoursAndMinutes = /^(\d+(?:\.\d+)?)\s*h(?:\s*(\d+)\s*(?:m|min)?)?$/.exec(trimmed);
  const plain = /^(\d+)\s*(?:m|min)?$/.exec(trimmed);
  if (hoursAndMinutes) {
    minutes = Math.round(Number(hoursAndMinutes[1]) * 60) + Number(hoursAndMinutes[2] ?? 0);
  } else if (plain) {
    minutes = Number(plain[1]);
  } else {
    return null;
  }
  return Number.isFinite(minutes) && minutes <= MAX_STEP_MINUTES ? minutes : null;
}

// ---------------------------------------------------------------------------------------------
// Bolt lists and documents as lines of text (typed, or pasted from a spreadsheet)
// ---------------------------------------------------------------------------------------------

/** "8 pcs - M6S M8x25", "24 Pcs MC6S M6x16", "8 x M8x25", "8 st M8x25", "8 - M8x25". */
const QUANTITY_FIRST =
  /^(\d{1,4})\s*(?:(?:pcs?|st|stk|x|×)\.?(?=[\s\-–:])\s*[-–:]?|[-–:](?=\s))\s*(.+)$/i;
/** "K6SF M6x16 9st", "MHM M6 5 pcs". */
const QUANTITY_LAST = /^(.+?)\s+(\d{1,4})\s*(?:pcs?|st|stk)\.?$/i;

/**
 * One line of a bolt list as people write it: the quantity when the line says one, and the rest
 * as the designation. Null for a blank line.
 */
export function parseFastenerLine(line: string): Fastener | null {
  const text = line.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const first = QUANTITY_FIRST.exec(text);
  const last = first ? null : QUANTITY_LAST.exec(text);
  const quantity = Number(first?.[1] ?? last?.[2] ?? 0);
  const designation = (first?.[2] ?? last?.[1] ?? text).trim().slice(0, 200);
  if (!designation) return null;
  return quantity >= 1 ? { quantity, designation } : { designation };
}

/** A bolt list from text, a fastener to a line; blank lines are skipped. */
export function parseFasteners(text: string): Fastener[] {
  return text
    .split(/\r?\n/)
    .map(parseFastenerLine)
    .filter((fastener) => fastener !== null)
    .slice(0, MAX_FASTENERS);
}

/** "8 pcs MC6S M8x25": a fastener as its line, which parses back to the same fastener. */
export function formatFastener({ quantity, designation }: Fastener): string {
  return quantity ? `${quantity} pcs ${designation}` : designation;
}

/** The bolt list as text, a fastener to a line. */
export function formatFasteners(fasteners: readonly Fastener[] | undefined): string {
  return (fasteners ?? []).map(formatFastener).join('\n');
}

/**
 * One line of a step's documents: a web address or a path on the file server, with an optional
 * name before a bar, "Operator panel instruction | \\SRV102\…\I 82423-02.pdf". Quotes around a
 * path (Windows' "Copy as path") are dropped. Null for a blank line.
 */
export function parseDocumentLine(line: string): StepDocument | null {
  const bar = line.indexOf('|');
  const label = bar < 0 ? '' : line.slice(0, bar).trim().slice(0, 200);
  const target = (bar < 0 ? line : line.slice(bar + 1))
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim()
    .slice(0, 1000);
  if (!target) return null;
  return label ? { label, target } : { target };
}

export function parseDocuments(text: string): StepDocument[] {
  return text
    .split(/\r?\n/)
    .map(parseDocumentLine)
    .filter((document) => document !== null)
    .slice(0, MAX_STEP_DOCUMENTS);
}

export function formatDocument({ label, target }: StepDocument): string {
  return label ? `${label} | ${target}` : target;
}

export function formatDocuments(documents: readonly StepDocument[] | undefined): string {
  return (documents ?? []).map(formatDocument).join('\n');
}

/** Whether a document's target opens as a link (a web address) or is a path to copy. */
export function isWebLink(target: string): boolean {
  return /^https?:\/\/\S+$/i.test(target.trim());
}

/**
 * What a document is called where no name was given: the file's name, "I 82423-02 Operator panel
 * HHV3.pdf" for a path or an address that ends in one, else the target itself.
 */
export function documentName({ label, target }: StepDocument): string {
  if (label?.trim()) return label.trim();
  const last = target.split(/[\\/]/).filter(Boolean).at(-1) ?? target;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** Part numbers from text: split at commas, semicolons and line breaks, without duplicates. */
export function parsePartNumbers(text: string): string[] {
  const seen = new Set<string>();
  const numbers: string[] = [];
  for (const part of text.split(/[,;\n]/)) {
    const number = part.replace(/\s+/g, ' ').trim().slice(0, 100);
    const key = number.toLowerCase();
    if (!number || seen.has(key)) continue;
    seen.add(key);
    numbers.push(number);
  }
  return numbers.slice(0, MAX_PART_NUMBERS);
}

// ---------------------------------------------------------------------------------------------
// A step's fields
// ---------------------------------------------------------------------------------------------

/**
 * The step's fields with everything empty left out (a blank department, an empty bolt list, an
 * unticked "from pre-assembly"), or undefined when nothing is left: what is stored, and what two
 * drafts are compared by.
 */
export function cleanAssemblyStep(step: AssemblyStep | undefined): AssemblyStep | undefined {
  if (!step) return undefined;
  // As typed (a space at the end while the next word is on its way); blank is none.
  const text = (value: string | undefined) => (value?.trim() ? value : undefined);
  const department = text(step.department);
  const assyNumber = text(step.assyNumber);
  const assyName = text(step.assyName);
  const clean: AssemblyStep = {
    ...(department && { department }),
    ...(step.minutes !== undefined && { minutes: step.minutes }),
    ...(step.fromPreAssembly && { fromPreAssembly: true }),
    ...(step.fasteners?.length && { fasteners: step.fasteners }),
    ...(step.partNumbers?.length && { partNumbers: step.partNumbers }),
    ...(assyNumber && { assyNumber }),
    ...(assyName && { assyName }),
    ...(step.documents?.length && { documents: step.documents }),
  };
  return Object.keys(clean).length > 0 ? clean : undefined;
}

/** The departments of an instruction's steps, in the order they first appear. */
export function stepDepartments(sections: readonly Section[]): string[] {
  const departments = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      const department = item.assembly?.department?.trim();
      if (department) departments.add(department);
    }
  }
  return [...departments];
}

// ---------------------------------------------------------------------------------------------
// The JSON file
// ---------------------------------------------------------------------------------------------

export const ASSEMBLY_EXPORT_FORMAT = 'modig-final-inspection/assembly-instruction';

/** A picture in the file; a hand-made file needn't say that it is information. */
const FileImageSchema = GuideImageSchema.extend({
  verdict: z.enum(GUIDE_VERDICTS).default('info'),
});

const FileStepSchema = z.object({
  /** The working step: "Mount Pan 80069". */
  text: z.string().max(1000),
  /** Further instructions under the step, lines allowed. */
  description: z.string().max(5000).optional(),
  /** Pictures by id: they come along only within the installation that stores them. */
  images: z.array(FileImageSchema).max(MAX_GUIDE_IMAGES).optional(),
  department: z.string().max(200).optional(),
  minutes: z.number().int().min(0).max(MAX_STEP_MINUTES).optional(),
  fromPreAssembly: z.boolean().optional(),
  /** Each as "8 pcs MC6S M8x25" or `{ "quantity": 8, "designation": "MC6S M8x25" }`. */
  fasteners: z
    .array(z.union([z.string().max(300), FastenerSchema]))
    .max(MAX_FASTENERS)
    .optional(),
  partNumbers: z.array(PartNumberSchema).max(MAX_PART_NUMBERS).optional(),
  assyNumber: z.string().max(100).optional(),
  assyName: z.string().max(200).optional(),
  /** Each as an address or path, "Name | path", or `{ "label": …, "target": … }`. */
  documents: z
    .array(z.union([z.string().max(1200), StepDocumentSchema]))
    .max(MAX_STEP_DOCUMENTS)
    .optional(),
});
export type AssemblyFileStep = z.infer<typeof FileStepSchema>;

const FileTaskSchema = z.object({
  title: z.string().max(200),
  steps: z.array(FileStepSchema).max(2000),
});

export const AssemblyExportSchema = z.object({
  format: z.literal(ASSEMBLY_EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: z.iso.datetime({ offset: true }).optional(),
  instruction: z.object({
    name: z.string().max(200),
    /** The model it was written for; an import chooses the model it is for. */
    modelCode: ModelCodeSchema.optional(),
    modelName: z.string().max(100).optional(),
    tasks: z.array(FileTaskSchema).max(500),
  }),
});
export type AssemblyExport = z.infer<typeof AssemblyExportSchema>;
/** A file as written: before the defaults are filled in. */
export type AssemblyExportInput = z.input<typeof AssemblyExportSchema>;

/** The file for an assembly instruction: its draft as the editor shows it. */
export function assemblyExport(
  instruction: Pick<Template, 'name' | 'modelCode' | 'sections'>,
  modelName: string | undefined,
  exportedAt: string,
): AssemblyExport {
  return {
    format: ASSEMBLY_EXPORT_FORMAT,
    version: 1,
    exportedAt,
    instruction: {
      name: instruction.name,
      modelCode: instruction.modelCode,
      ...(modelName && { modelName }),
      tasks: instruction.sections.map((section) => ({
        title: section.title,
        steps: section.items.map(fileStep),
      })),
    },
  };
}

function fileStep(item: Item): AssemblyFileStep {
  const description = item.guide?.description?.trim();
  return {
    text: item.text,
    ...(description && { description }),
    ...(item.guide?.images.length && { images: item.guide.images }),
    ...cleanAssemblyStep(item.assembly),
  };
}

/**
 * A file's tasks as the sections of a new draft, every task and step with a new id (a file has
 * none: an import is always a new instruction).
 */
export function assemblyFileSections(
  file: AssemblyExport,
  makeId: () => string = newId,
): Section[] {
  return file.instruction.tasks.map((task) => ({
    id: makeId(),
    title: task.title,
    items: task.steps.map((step): Item => {
      const description = step.description?.trim();
      const images = step.images ?? [];
      const assembly = cleanAssemblyStep(
        AssemblyStepSchema.parse({
          department: step.department?.trim(),
          minutes: step.minutes,
          fromPreAssembly: step.fromPreAssembly,
          fasteners: step.fasteners
            ?.map((fastener) =>
              typeof fastener === 'string' ? parseFastenerLine(fastener) : fastener,
            )
            .filter((fastener) => fastener !== null),
          partNumbers: step.partNumbers,
          assyNumber: step.assyNumber?.trim(),
          assyName: step.assyName?.trim(),
          documents: step.documents
            ?.map((document) =>
              typeof document === 'string' ? parseDocumentLine(document) : document,
            )
            .filter((document) => document !== null),
        }),
      );
      return {
        id: makeId(),
        text: step.text,
        ...((description || images.length > 0) && {
          guide: { ...(description && { description }), images },
        }),
        ...(assembly && { assembly }),
      };
    }),
  }));
}

/** How many steps a file has. */
export function assemblyFileStepCount(file: Pick<AssemblyExport, 'instruction'>): number {
  return file.instruction.tasks.reduce((count, task) => count + task.steps.length, 0);
}
