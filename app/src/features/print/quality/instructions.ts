/**
 * A quality check's instructions on paper: a manual for the operator at the machine, printed from
 * its template, or from a check as that check has them (a machine's own copy). A cover with what
 * the check is (model, department, revision, size and time, and its sections as contents), then
 * every row as the app shows it: what to check, how, references, time, more information and the
 * pictures of how it should and should not look. Nothing is filled in: it is not a record of a
 * check done (that is the quality check's report). Pure, so the rules are unit-tested; the
 * components only lay it out.
 */
import {
  formatHours,
  qualityCheckShortName,
  rowRef,
  sectionNumber,
  totalHours,
  type Inspection,
  type QualityFront,
  type Section,
} from '@modig/shared';
import { formatDate } from '../../../lib/format';
import { sectionStats } from '../../qualityChecks/stats';
import { APPENDIX_IMAGES_PER_ROW, chunk, type AppendixImage } from '../appendix';
import {
  clip,
  company,
  FOOTER_MACHINE_LENGTH,
  plural,
  SEPARATOR,
  type FrontField,
  type PrintContext,
} from '../model';

/** Under the title on the cover, and in the file name. */
export const INSTRUCTIONS_KIND = 'Instructions';

export type InstructionRow = {
  /** "3.c" */
  ref: string;
  /** What to check. */
  what: string;
  /** How to check it; '' when the row says nothing. */
  how: string;
  /** "ISO 12100", … */
  references: string[];
  /** "0.5 h", or '' when the row has no time. */
  time: string;
  /** The row's "More information"; may be empty. */
  information: string;
  /** Its pictures, APPENDIX_IMAGES_PER_ROW to a row, each with its verdict and caption. */
  pictures: AppendixImage[][];
};

export type InstructionSection = {
  /** 1-based. */
  number: number;
  title: string;
  /** "5 rows · 0.8 h", as the section's header on screen says. */
  stats: string;
  rows: InstructionRow[];
};

export type InstructionsCover = {
  companyName: string;
  /** "Quality check – Pre start up" */
  title: string;
  /**
   * A template's: Machine model, Department, Revision, Published (or Status), Size. A check's:
   * Machine ID, Machine model, Serial number, Quality check, Department, Checklist, Size.
   */
  fields: FrontField[];
  /** A draft's marker: what it prints is not what operators work from yet. */
  draft: boolean;
  /** The sections, as a table of contents. */
  contents: { number: number; title: string; stats: string }[];
};

export type InstructionsModel = {
  /** Tells it from a checklist's and a quality check report's model. */
  document: 'instructions';
  /** One way to print them (the print machinery keys its readiness on a document's mode). */
  mode: 'instructions';
  cover: InstructionsCover;
  sections: InstructionSection[];
  /** No deviations: nothing is checked on these pages. */
  deviations: { kind: 'none' };
  /** Right of the instructions' heading: "Quality check – Pre start up · Rev 2". */
  checklistTitle: string;
  /** "Rev 2", or "Draft – Rev 3": after the subject in the print toolbar. */
  revisionLabel: string;
  /** Under "Print preview": the check's title. */
  subject: string;
  /** Bottom left of every page. */
  footer: string;
  /** The document title, which Chrome offers as the PDF's file name. */
  fileName: string;
};

/** What the instructions are printed from: a published revision of a quality check, or its draft. */
export type InstructionsSource = {
  name: string;
  quality?: QualityFront | undefined;
  sections: readonly Section[];
  revision: number;
  /** When and by whom it was published (a revision's `updatedAt` and `updatedBy`). */
  updatedAt: string;
  updatedBy: string;
};

/** A quality check's instructions, blank, from its template (a revision, or the draft). */
export function qualityInstructionsPrint(
  source: InstructionsSource,
  { draft, ...context }: PrintContext & { draft: boolean },
): InstructionsModel {
  const companyName = company(context);
  const title = source.name.trim() || 'Quality check';
  const revisionLabel = draft ? `Draft – Rev ${source.revision}` : `Rev ${source.revision}`;
  const { personName = (email: string) => email } = context;
  return instructions(source.sections, {
    companyName,
    title,
    revisionLabel,
    draft,
    fields: [
      { label: 'Machine model', value: context.modelLabel },
      { label: 'Department', value: source.quality?.department.trim() ?? '' },
      { label: 'Revision', value: revisionLabel },
      draft
        ? { label: 'Status', value: 'Not published' }
        : {
            label: 'Published',
            value: `${formatDate(source.updatedAt)} by ${personName(source.updatedBy)}`,
          },
    ],
    subject: title,
    // As a template's printout names itself: the company, the check and its revision.
    footer: [companyName, title, revisionLabel].join(SEPARATOR),
    fileName: `${title} – ${revisionLabel} – ${INSTRUCTIONS_KIND}`,
  });
}

/**
 * A quality check's instructions as that check has them (a machine's own copy, with its own rows):
 * the same manual, for the machine it is done on. Printed whatever the check's state: it shows
 * what to check, never what was found.
 */
export function checkInstructionsPrint(
  inspection: Pick<
    Inspection,
    'number' | 'front' | 'templateSnapshot' | 'templateRevision' | 'machineRef'
  >,
  context: PrintContext,
): InstructionsModel {
  const { number, front, templateSnapshot, templateRevision } = inspection;
  const companyName = company(context);
  const title = templateSnapshot.name.trim() || 'Quality check';
  const machineId = front.machineName.trim();
  const serialNumber = front.serialNumber.trim();
  const revisionLabel = `Rev ${templateRevision}`;
  return instructions(templateSnapshot.sections, {
    companyName,
    title,
    revisionLabel,
    draft: false,
    fields: [
      { label: 'Machine ID', value: machineId },
      { label: 'Machine model', value: context.modelLabel },
      { label: 'Serial number', value: serialNumber },
      { label: 'Quality check', value: number },
      { label: 'Department', value: templateSnapshot.quality?.department.trim() ?? '' },
      {
        label: 'Checklist',
        // A machine's check may have rows of its own: it is the machine's, based on the revision.
        value: inspection.machineRef
          ? `This machine’s copy, based on ${revisionLabel}`
          : revisionLabel,
      },
    ],
    subject: [number, title, machineId, context.modelLabel].filter(Boolean).join(SEPARATOR),
    // As the check's report names its pages, without its state: instructions don't change with it.
    footer: [
      number,
      clip(title, FOOTER_MACHINE_LENGTH),
      clip(machineId, FOOTER_MACHINE_LENGTH),
      context.modelLabel,
      `S/N ${serialNumber || '—'}`,
    ]
      .filter(Boolean)
      .join(SEPARATOR),
    fileName: `${[number, machineId, context.modelLabel].filter(Boolean).join(' ')} – ${qualityCheckShortName(
      title,
    )} – ${INSTRUCTIONS_KIND}`,
  });
}

/** What the two kinds of instructions share: the sections, the size and the contents. */
function instructions(
  source: readonly Section[],
  parts: Omit<InstructionsCover, 'contents'> &
    Pick<InstructionsModel, 'revisionLabel' | 'subject' | 'footer' | 'fileName'>,
): InstructionsModel {
  const { companyName, title, fields, draft, revisionLabel, subject, footer, fileName } = parts;
  const sections = instructionSections(source);
  const rows = sections.reduce((sum, section) => sum + section.rows.length, 0);
  return {
    document: 'instructions',
    mode: 'instructions',
    cover: {
      companyName,
      title,
      fields: [
        ...fields,
        {
          label: 'Size',
          value: `${plural(sections.length, 'section')}${SEPARATOR}${plural(rows, 'row')}${SEPARATOR}${formatHours(totalHours(source))}`,
        },
      ],
      draft,
      contents: sections.map(({ number, title: sectionTitle, stats }) => ({
        number,
        title: sectionTitle,
        stats,
      })),
    },
    sections,
    deviations: { kind: 'none' },
    checklistTitle: `${title}${SEPARATOR}${revisionLabel}`,
    revisionLabel,
    subject,
    footer,
    fileName,
  };
}

function instructionSections(sections: readonly Section[]): InstructionSection[] {
  return sections.map((section, sectionIndex) => ({
    number: sectionNumber(sectionIndex),
    title: section.title.trim(),
    stats: sectionStats(section.items),
    rows: section.items.map((item, rowIndex) => {
      const ref = rowRef(sectionIndex, rowIndex);
      return {
        ref,
        what: item.text.trim(),
        how: item.how?.trim() ?? '',
        references: item.references ?? [],
        time: item.timeHours ? formatHours(item.timeHours) : '',
        information: item.guide?.description?.trim() ?? '',
        pictures: chunk(
          (item.guide?.images ?? []).map((image) => ({
            // The copy with the arrows and boxes drawn on it, when there is one.
            imageId: image.renderedImageId ?? image.imageId,
            verdict: image.verdict,
            ref,
            caption: image.caption?.trim() ?? '',
          })),
          APPENDIX_IMAGES_PER_ROW,
        ),
      };
    }),
  }));
}

/** Every picture the instructions show, in order, each once. */
export function instructionImageIds(model: InstructionsModel): string[] {
  const ids = model.sections.flatMap((section) =>
    section.rows.flatMap((row) => row.pictures.flat().map((picture) => picture.imageId)),
  );
  return [...new Set(ids)];
}
