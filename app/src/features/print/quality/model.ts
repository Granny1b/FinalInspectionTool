/**
 * What a quality check done on a machine prints, worked out from the data alone: the entire
 * report (a front page with the sign-off, the checklist section by section, a card per deviation
 * with room to sign it off at the machine, and the check's instructions), only the checklist or
 * only the deviations under a short header, or the instructions alone (instructions.ts). The
 * printout is filed at the machine and signed there, so each ends in places to sign.
 * Pure, so the rules are unit-tested; the components only lay it out.
 */
import {
  DEFAULT_SEVERITY,
  deriveDeviations,
  formatHours,
  inspectionProgress,
  qualityCheckShortName,
  rowRef,
  sectionNumber,
  totalHours,
  type FollowUp,
  type Inspection,
  type RowResult,
  type Section,
  type Severity,
  type Status,
} from '@modig/shared';
import { formatDateTime } from '../../../lib/format';
import { formatCalendarDate } from '../../inspections/dates';
import { sectionStats } from '../../qualityChecks/stats';
import {
  clip,
  company,
  deviationCard,
  FOOTER_MACHINE_LENGTH,
  NOT_FINALISED_MARKER,
  plural,
  SEPARATOR,
  type DeviationCard,
  type FrontField,
  type PrintContext,
} from '../model';
import {
  checkInstructionsPrint,
  instructionImageIds,
  type InstructionSection,
  type InstructionsModel,
} from './instructions';

/**
 * `report`: everything: the front page, the checklist, the deviation cards and the instructions.
 * `checklist`: the checklist alone, with what was recorded. `deviations`: the deviation cards
 * alone, to close them at the machine. `instructions`: the check's rows as a manual for the
 * operator, pictures included (instructions.ts).
 */
export const QUALITY_PRINT_MODES = ['report', 'checklist', 'deviations', 'instructions'] as const;
export type QualityPrintMode = (typeof QUALITY_PRINT_MODES)[number];
/** What the check's report prints: everything, only its checklist or only its deviations. */
export type QualityReportMode = Exclude<QualityPrintMode, 'instructions'>;
/** How the print toolbar, the preview and the Print menu name each mode. */
export const QUALITY_PRINT_MODE_LABELS: Record<QualityPrintMode, string> = {
  report: 'Entire report',
  checklist: 'Only checklist',
  deviations: 'Only deviations',
  instructions: 'Instructions',
};

/** Above the deviation cards, on every page of them. */
export const QUALITY_DEVIATIONS_TITLE = 'Deviations';

export type QualityPrintRow = {
  /** "3.c" */
  ref: string;
  /** What to check. */
  what: string;
  /** How to check it; '' when the row says nothing. */
  how: string;
  /** "ISO 12100", … */
  references: string[];
  /** Null while the row has no status (a check in progress). */
  status: Status | null;
  /** A NOK row's card ("D-02") and severity, so the paper leads from the row to its card. */
  deviation: { number: string; severity: Severity } | null;
  comment: string;
};

export type QualityPrintSection = {
  /** 1-based. */
  number: number;
  title: string;
  /** "5 rows · 0.8 h", as the section's header on screen says. */
  stats: string;
  /** May be empty: the section then says it has no checkpoints. */
  rows: QualityPrintRow[];
};

/** A number on the front page's summary, "15" over "OK". */
export type QualityCount = { label: string; value: number };

export type QualityFrontPage = {
  companyName: string;
  /** "QC-2026-0004" */
  number: string;
  /** "Quality check – Pre start up" */
  title: string;
  /**
   * The machine and the check done on it: Machine ID, Machine model, Serial number, Date, Checked
   * by, and the department that owns the quality check it follows.
   */
  fields: FrontField[];
  /** Bottom right, as on a final report: "Rev: 2". */
  revision: string;
  /** "Finalised 2026-11-06 14:32 by Anna Andersson", or NOT_FINALISED_MARKER. */
  state: { finalised: boolean; text: string };
  /** Rows, OK, NOK, N/A, Not filled (only while some are) and Deviations. */
  counts: QualityCount[];
  /** "5 sections · 20 rows · 3.5 h" */
  size: string;
};

export type QualityPrintModel = {
  /** Tells it from a final inspection's PrintModel. */
  document: 'quality';
  mode: QualityReportMode;
  front: QualityFrontPage;
  /**
   * Only the checklist or only the deviations: the short header over the first page (Machine
   * ID, Machine model, Serial number, Date, Checked by, then the Result or the Deviations), "—"
   * for what is empty.
   */
  header: FrontField[];
  /** Right of the checklist's heading: "Quality check – Pre start up · Rev 2". */
  checklistTitle: string;
  /** "Rev 2": after the subject in the print toolbar, as a template's printout has it. */
  revisionLabel: string;
  sections: QualityPrintSection[];
  /**
   * Shaped as a final report's, so the cards are laid out by the same code; none when only the
   * checklist is printed.
   */
  deviations: { kind: 'cards'; cards: DeviationCard[] } | { kind: 'none' };
  /** The entire report ends with the check's instructions, as this check has them. */
  instructions: InstructionSection[] | null;
  /** Under "Print preview" and "Preview": number, title, machine ID and model. */
  subject: string;
  /** Bottom left of every page. */
  footer: string;
  /** The document title, which Chrome offers as the PDF's file name. */
  fileName: string;
};

/** What a quality check's printout needs besides the check: also how its deviations stand. */
export type QualityPrintContext = PrintContext & {
  /**
   * The check's follow-ups by deviation key (the deviation log): a closed deviation prints its
   * action, day and who instead of empty lines. Left out, every card has the lines.
   */
  followUps?: Readonly<Record<string, FollowUp>>;
};

/** The entire report, only its checklist or only its deviations, from the check's frozen copy. */
export function qualityCheckPrint(
  inspection: Inspection,
  mode: QualityReportMode,
  context: QualityPrintContext,
): QualityPrintModel {
  const { front, number, templateSnapshot, templateRevision } = inspection;
  const title = templateSnapshot.name.trim() || 'Quality check';
  // The machine's ID in the ERP ("Magellan#1"), kept where a final inspection keeps it. Checks
  // done before it was asked for have none.
  const machineId = front.machineName.trim();
  const serialNumber = front.serialNumber.trim();
  const checkedBy = front.participants.join(', ');
  const date = formatCalendarDate(front.date);
  const finalised = inspection.state === 'finalised';
  const deviations = deriveDeviations(inspection);
  const cards = deviations.map((deviation) =>
    withFollowUp(deviationCard(deviation), context.followUps?.[deviation.key]),
  );
  const openCount = cards.filter((card) => !card.closed).length;
  const progress = inspectionProgress(inspection);
  const open = progress.total - progress.filled;
  const sections = templateSnapshot.sections;
  const rows = sections.reduce((sum, section) => sum + section.items.length, 0);
  const revisionLabel = `Rev ${templateRevision}`;

  return {
    document: 'quality',
    mode,
    front: {
      companyName: company(context),
      number,
      title,
      fields: [
        { label: 'Machine ID', value: machineId },
        { label: 'Machine model', value: context.modelLabel },
        { label: 'Serial number', value: serialNumber },
        { label: 'Date', value: date },
        { label: 'Checked by', value: checkedBy },
        // Document control is the app's (the revision): no document number of its own.
        { label: 'Department', value: templateSnapshot.quality?.department.trim() ?? '' },
      ],
      revision: `Rev: ${templateRevision}`,
      state: finalised
        ? { finalised: true, text: finalisedText(inspection, context) }
        : { finalised: false, text: NOT_FINALISED_MARKER },
      counts: [
        { label: 'Rows', value: progress.total },
        { label: 'OK', value: progress.ok },
        { label: 'NOK', value: progress.nok },
        { label: 'N/A', value: progress.filled - progress.ok - progress.nok },
        // Only while the check is being done: a finalised one has every row filled.
        ...(open > 0 ? [{ label: 'Not filled', value: open }] : []),
        { label: 'Deviations', value: deviations.length },
      ],
      size: `${plural(sections.length, 'section')}${SEPARATOR}${plural(rows, 'row')}${SEPARATOR}${formatHours(totalHours(sections))}`,
    },
    header: [
      { label: 'Machine ID', value: machineId || '—' },
      { label: 'Machine model', value: context.modelLabel || '—' },
      { label: 'Serial number', value: serialNumber || '—' },
      { label: 'Date', value: date || '—' },
      { label: 'Checked by', value: checkedBy || '—' },
      mode === 'checklist'
        ? {
            label: 'Result',
            // "15 OK · 2 NOK · 1 N/A", and how many are left while the check is being done.
            value: [
              `${progress.ok} OK`,
              `${progress.nok} NOK`,
              `${progress.filled - progress.ok - progress.nok} N/A`,
              ...(open > 0 ? [`${open} not filled`] : []),
            ].join(SEPARATOR),
          }
        : {
            label: 'Deviations',
            // "4 · 1 open" once some are closed: the paper at the machine shows what is left.
            value:
              openCount === cards.length
                ? String(cards.length)
                : `${cards.length}${SEPARATOR}${openCount} open`,
          },
    ],
    checklistTitle: `${title}${SEPARATOR}${revisionLabel}`,
    revisionLabel,
    sections: printSections(sections, inspection.results, deviations),
    deviations: mode === 'checklist' ? { kind: 'none' } : { kind: 'cards', cards },
    instructions: mode === 'report' ? checkInstructionsPrint(inspection, context).sections : null,
    subject: [number, title, machineId, context.modelLabel].filter(Boolean).join(SEPARATOR),
    footer: [
      number,
      clip(title, FOOTER_MACHINE_LENGTH),
      // As a final report's footer cuts its machine; left out when there is none.
      clip(machineId, FOOTER_MACHINE_LENGTH),
      context.modelLabel,
      `S/N ${serialNumber || '—'}`,
      // A page of a check in progress must not pass for a finished one, even on its own.
      ...(finalised ? [] : ['Not finalised']),
    ]
      .filter(Boolean)
      .join(SEPARATOR),
    fileName: `${[number, machineId, context.modelLabel].filter(Boolean).join(' ')} – ${qualityCheckShortName(
      title,
    )} – ${fileKind(mode, finalised)}`,
  };
}

function fileKind(mode: QualityReportMode, finalised: boolean): string {
  if (mode === 'deviations') return finalised ? 'Deviations' : 'Draft deviations';
  if (mode === 'checklist') return finalised ? 'Checklist' : 'Draft checklist';
  return finalised ? 'Quality check report' : 'Draft report';
}

function finalisedText(
  inspection: Inspection,
  { personName = (email) => email }: PrintContext,
): string {
  const when = inspection.finalisedAt ? ` ${formatDateTime(inspection.finalisedAt)}` : '';
  const who = inspection.finalisedBy ? ` by ${personName(inspection.finalisedBy)}` : '';
  return `Finalised${when}${who}`;
}

/** Every row with what was recorded; a NOK row with the number of its deviation card. */
function printSections(
  sections: readonly Section[],
  results: Record<string, RowResult>,
  deviations: ReturnType<typeof deriveDeviations>,
): QualityPrintSection[] {
  const cardOf = new Map(
    deviations.flatMap((deviation) =>
      deviation.itemId ? [[deviation.itemId, deviation.number] as const] : [],
    ),
  );
  return sections.map((section, sectionIndex) => ({
    number: sectionNumber(sectionIndex),
    title: section.title.trim(),
    stats: sectionStats(section.items),
    rows: section.items.map((item, rowIndex) => {
      const result = results[item.id];
      const status = result?.status ?? null;
      const card = cardOf.get(item.id);
      return {
        ref: rowRef(sectionIndex, rowIndex),
        what: item.text.trim(),
        how: item.how?.trim() ?? '',
        references: item.references ?? [],
        status,
        deviation:
          status === 'NOK' && card
            ? { number: card, severity: result?.severity ?? DEFAULT_SEVERITY }
            : null,
        comment: result?.comment?.trim() ?? '',
      };
    }),
  }));
}

/**
 * What a quality check prints in `mode`: its entire report, only its checklist or deviations, or
 * its instructions as the check has them.
 */
export function qualityCheckPrintout(
  inspection: Inspection,
  mode: QualityPrintMode,
  context: QualityPrintContext,
): QualityPrintModel | InstructionsModel {
  return mode === 'instructions'
    ? checkInstructionsPrint(inspection, context)
    : qualityCheckPrint(inspection, mode, context);
}

/**
 * Every uploaded image the report shows (the logo aside), each once: the deviation photos, and
 * the instructions' pictures in the entire report.
 */
export function qualityImageIds(model: QualityPrintModel): string[] {
  const photos =
    model.deviations.kind === 'cards'
      ? model.deviations.cards.flatMap((card) => card.photos.map((photo) => photo.imageId))
      : [];
  const pictures = model.instructions ? instructionImageIds({ sections: model.instructions }) : [];
  return [...new Set([...photos, ...pictures])];
}

/** The card with its closing when the deviation is closed in the app; else as it is. */
function withFollowUp(card: DeviationCard, followUp: FollowUp | undefined): DeviationCard {
  if (followUp?.status !== 'closed') return card;
  return {
    ...card,
    closed: {
      action: followUp.action.trim(),
      closedOn: followUp.closedOn,
      closedBy: followUp.closedBy.trim(),
    },
  };
}
