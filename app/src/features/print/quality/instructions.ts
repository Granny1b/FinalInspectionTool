/**
 * A quality check's instructions on paper, printed from its template: a manual for the operator
 * at the machine. A cover with what the check is (model, department, revision, size and time, and
 * its sections as contents), then every row as the app shows it: what to check, how, references,
 * time, more information and the pictures of how it should and should not look. Nothing is
 * filled in: it is not a record of a check done (that is the quality check's report). Pure, so
 * the rules are unit-tested; the components only lay it out.
 */
import {
  formatHours,
  rowRef,
  sectionNumber,
  totalHours,
  type QualityFront,
  type Section,
} from '@modig/shared';
import { formatDate } from '../../../lib/format';
import { sectionStats } from '../../qualityChecks/stats';
import { APPENDIX_IMAGES_PER_ROW, chunk, type AppendixImage } from '../appendix';
import { company, plural, SEPARATOR, type FrontField, type PrintContext } from '../model';

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
  /** Machine model, Department, Revision, Published (or Draft), Size. */
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
  const sections = instructionSections(source.sections);
  const rows = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const { personName = (email: string) => email } = context;

  return {
    document: 'instructions',
    mode: 'instructions',
    cover: {
      companyName,
      title,
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
        {
          label: 'Size',
          value: `${plural(sections.length, 'section')}${SEPARATOR}${plural(rows, 'row')}${SEPARATOR}${formatHours(totalHours(source.sections))}`,
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
    subject: title,
    // As a template's printout names itself: the company, the check and its revision.
    footer: [companyName, title, revisionLabel].join(SEPARATOR),
    fileName: `${title} – ${revisionLabel} – ${INSTRUCTIONS_KIND}`,
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
