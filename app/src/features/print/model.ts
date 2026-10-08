/**
 * What gets printed (brief §6), worked out from the data alone: the front page, one table per
 * section with spare rows, the deviation pages and the page footer. Pure, so the rules are
 * unit-tested; the components only lay it out.
 */
import {
  DEFAULT_COMPANY_NAME,
  DEFAULT_SEVERITY,
  deriveDeviations,
  deviationNumber,
  inspectionProgress,
  rowLetter,
  sectionNumber,
  type AnnotatedImage,
  type Inspection,
  type InspectionDeviation,
  type RowResult,
  type Section,
  type Severity,
  type Status,
  type Template,
} from '@modig/shared';
import { formatDateTime } from '../../lib/format';
import { formatCalendarDate } from '../inspections/dates';

/** `blank`: the checklist to fill in by hand. `report`: what was recorded. */
export const PRINT_MODES = ['blank', 'report'] as const;
export type PrintMode = (typeof PRINT_MODES)[number];

/** Numbered lines on a blank Deviation Summary (brief §6: "~15 numbered lines"). */
export const BLANK_DEVIATION_LINES = 15;

/** A report's deviation cards per page: two with large photos, or four (both on trial). */
export const DEVIATIONS_PER_PAGE = [2, 4] as const;
export type DeviationsPerPage = (typeof DEVIATIONS_PER_PAGE)[number];
/** Until the Quality department has picked the layout it prefers. */
export const DEFAULT_DEVIATIONS_PER_PAGE: DeviationsPerPage = 2;

/** On the front page of a report that is not finalised, so it is never taken for the final one. */
export const NOT_FINALISED_MARKER = 'NOT FINALISED – DRAFT REPORT';

export type PrintRow = {
  /** "3.c"; spare rows continue the lettering. */
  ref: string;
  /** The checkpoint; empty on a spare row. */
  text: string;
  /** An empty lettered line for a handwritten finding. */
  spare: boolean;
  /** Report mode: the recorded status. Null prints empty boxes (blank, spare or not yet filled). */
  status: Status | null;
  /** NOK rows only. */
  severity: Severity | null;
  comment: string;
  resp: string;
};

export type PrintSection = {
  /** Section number, 1-based. */
  number: number;
  title: string;
  /** May be empty (a draft's section without rows and no spare rows). */
  rows: PrintRow[];
};

export type DeviationPhoto = {
  /** The flattened copy with the annotations when there is one, else the photo itself. */
  imageId: string;
  caption: string;
};

/** One deviation of a report, printed as a card with its photos. */
export type DeviationCard = {
  /** "D-03" */
  number: string;
  /** "4.c"; null for a deviation that is not tied to a row. */
  ref: string | null;
  /** The row's section; empty for a deviation that is not tied to a row. */
  sectionTitle: string;
  /** Checkpoint text, or the extra deviation's description. */
  text: string;
  comment: string;
  severity: Severity;
  resp: string;
  photos: DeviationPhoto[];
};

/**
 * Blank: the Deviation Summary's numbered lines (D-01…) to fill in by hand. Report: one card per
 * deviation, none when nothing was found.
 */
export type PrintDeviations =
  { kind: 'lines'; numbers: string[] } | { kind: 'cards'; cards: DeviationCard[] };

export type FrontField = { label: string; value: string };

export type ReportState = {
  finalised: boolean;
  /** "Finalised 8 Oct 2026, 14:32 by anna@modig.se", or NOT_FINALISED_MARKER. */
  text: string;
  /** "90 / 90 rows filled · 6 NOK · 8 deviations" */
  summary: string;
};

export type FrontPage = {
  companyName: string;
  /** "FI-2026-0042" when printing an inspection. */
  number: string | null;
  /** Machine name, Model, Serial number, Participants, Location, Date (brief §6). */
  fields: FrontField[];
  photoId: string | undefined;
  /** Bottom right, like the workbook's "Rev: 2"; "Draft – Rev 3" for a template's draft. */
  revision: string;
  /** Report mode only. */
  report: ReportState | null;
};

export type PrintModel = {
  mode: PrintMode;
  front: FrontPage;
  /** Above the first section: "Final inspection – RigiMill MG · Rev 2". */
  checklistTitle: string;
  sections: PrintSection[];
  deviations: PrintDeviations;
  /** Bottom left of every page. */
  footer: string;
  /** The document title, which Chrome offers as the PDF's file name. */
  fileName: string;
};

/** What the settings add to every printout. */
export type PrintContext = {
  /** From the settings; blank falls back to DEFAULT_COMPANY_NAME. */
  companyName: string;
  /** "RigiMill MG" for the model code. */
  modelLabel: string;
};

const SEPARATOR = ' · ';

/** A blank checklist or the report of one inspection, from its frozen checklist. */
export function inspectionPrint(
  inspection: Inspection,
  mode: PrintMode,
  context: PrintContext,
): PrintModel {
  const { front, number, templateSnapshot, templateRevision } = inspection;
  const companyName = company(context);
  const machine = front.machineName.trim();
  const finalised = inspection.state === 'finalised';
  const report = mode === 'report';
  const deviations = deriveDeviations(inspection);

  return {
    mode,
    front: {
      companyName,
      number,
      fields: frontFields({
        machineName: machine,
        model: context.modelLabel,
        serialNumber: front.serialNumber.trim(),
        participants: front.participants.join(', '),
        location: front.location.trim(),
        date: formatCalendarDate(front.date),
      }),
      photoId: front.photoId,
      revision: `Rev: ${templateRevision}`,
      report: report ? reportState(inspection, deviations.length) : null,
    },
    checklistTitle: `${templateSnapshot.name}${SEPARATOR}Rev ${templateRevision}`,
    sections: printSections(
      templateSnapshot.sections,
      report ? { results: inspection.results } : { spareRows: spareRows(templateSnapshot) },
    ),
    deviations: report
      ? { kind: 'cards', cards: deviations.map(deviationCard) }
      : blankDeviationLines(),
    footer: [
      companyName,
      number,
      machine || '—',
      `S/N ${front.serialNumber.trim() || '—'}`,
      `Rev ${templateRevision}`,
      // A page of a draft report must not pass for the final one, even on its own.
      ...(report && !finalised ? ['Not finalised'] : []),
    ].join(SEPARATOR),
    fileName: `${number}${machine ? ` ${machine}` : ''} – ${
      !report ? 'Blank checklist' : finalised ? 'Inspection report' : 'Draft report'
    }`,
  };
}

/**
 * A template's checklist as it will print for a new inspection: blank, the front page empty
 * except for the model. `draft` marks an admin's unpublished draft.
 */
export function templatePrint(
  template: Template,
  { draft, ...context }: PrintContext & { draft: boolean },
): PrintModel {
  const companyName = company(context);
  const name = template.name.trim() || 'Untitled template';
  const revision = draft ? `Draft – Rev ${template.revision}` : `Rev ${template.revision}`;
  return {
    mode: 'blank',
    front: {
      companyName,
      number: null,
      fields: frontFields({
        machineName: '',
        model: context.modelLabel,
        serialNumber: '',
        participants: '',
        location: '',
        date: '',
      }),
      photoId: template.coverImageId,
      revision: draft ? revision : `Rev: ${template.revision}`,
      report: null,
    },
    checklistTitle: `${name}${SEPARATOR}${revision}`,
    sections: printSections(template.sections, { spareRows: spareRows(template) }),
    deviations: blankDeviationLines(),
    footer: [companyName, name, `Rev ${template.revision}${draft ? ' (draft)' : ''}`].join(
      SEPARATOR,
    ),
    fileName: `${name} – ${revision} – Checklist preview`,
  };
}

function company({ companyName }: PrintContext): string {
  return companyName.trim() || DEFAULT_COMPANY_NAME;
}

function frontFields(values: {
  machineName: string;
  model: string;
  serialNumber: string;
  participants: string;
  location: string;
  date: string;
}): FrontField[] {
  return [
    { label: 'Machine name', value: values.machineName },
    { label: 'Model', value: values.model },
    { label: 'Serial number', value: values.serialNumber },
    { label: 'Participants', value: values.participants },
    { label: 'Location', value: values.location },
    { label: 'Date', value: values.date },
  ];
}

function reportState(inspection: Inspection, deviationCount: number): ReportState {
  const { total, filled, nok } = inspectionProgress(inspection);
  const summary = [
    `${filled} / ${total} rows filled`,
    `${nok} NOK`,
    deviationCount === 1 ? '1 deviation' : `${deviationCount} deviations`,
  ].join(SEPARATOR);
  if (inspection.state !== 'finalised') {
    return { finalised: false, text: NOT_FINALISED_MARKER, summary };
  }
  const when = inspection.finalisedAt ? ` ${formatDateTime(inspection.finalisedAt)}` : '';
  const who = inspection.finalisedBy ? ` by ${inspection.finalisedBy}` : '';
  return { finalised: true, text: `Finalised${when}${who}`, summary };
}

function spareRows({ printSettings }: Pick<Template, 'printSettings'>): number {
  return printSettings.spareRowsPerSection;
}

/**
 * Blank: every checkpoint plus `spareRows` empty lines that carry on the lettering (the paper's
 * room for handwritten findings). Report: every checkpoint with what was recorded, and no spare
 * lines: findings that belong to no row are extra deviations by then.
 */
function printSections(
  sections: readonly Section[],
  fill: { results: Record<string, RowResult> } | { spareRows: number },
): PrintSection[] {
  return sections.map((section, sectionIndex) => {
    const number = sectionNumber(sectionIndex);
    const ref = (rowIndex: number) => `${number}.${rowLetter(rowIndex)}`;
    const rows: PrintRow[] = section.items.map((item, rowIndex) => {
      const result = 'results' in fill ? fill.results[item.id] : undefined;
      const status = result?.status ?? null;
      return {
        ref: ref(rowIndex),
        text: item.text,
        spare: false,
        status,
        severity: status === 'NOK' ? (result?.severity ?? DEFAULT_SEVERITY) : null,
        comment: result?.comment?.trim() ?? '',
        resp: result?.resp?.trim() ?? '',
      };
    });
    const spare = 'spareRows' in fill ? fill.spareRows : 0;
    for (let index = 0; index < spare; index += 1) {
      rows.push({
        ref: ref(section.items.length + index),
        text: '',
        spare: true,
        status: null,
        severity: null,
        comment: '',
        resp: '',
      });
    }
    return { number, title: section.title.trim(), rows };
  });
}

function blankDeviationLines(): PrintDeviations {
  return {
    kind: 'lines',
    numbers: Array.from({ length: BLANK_DEVIATION_LINES }, (_, index) => deviationNumber(index)),
  };
}

function deviationCard(deviation: InspectionDeviation): DeviationCard {
  return {
    number: deviation.number,
    ref: deviation.kind === 'row' ? deviation.ref : null,
    sectionTitle: deviation.sectionTitle.trim(),
    text: deviation.text.trim(),
    comment: deviation.comment.trim(),
    severity: deviation.severity,
    resp: deviation.resp.trim(),
    photos: deviation.photos.map(printedPhoto),
  };
}

function printedPhoto(photo: AnnotatedImage): DeviationPhoto {
  return { imageId: photo.renderedImageId ?? photo.imageId, caption: photo.caption?.trim() ?? '' };
}

/**
 * The report's cards on pages: `perPage` to a page while they fit, fewer when the cards' natural
 * heights (in mm, from the laid-out page) add up to more than `room`, the page height left for
 * cards. A card taller than that gets a page of its own. Never splits or reorders a card.
 */
export function packCards<T>(
  cards: readonly T[],
  heights: readonly number[],
  { perPage, room }: { perPage: DeviationsPerPage; room: number },
): T[][] {
  const pages: T[][] = [];
  let used = 0;
  cards.forEach((card, index) => {
    const height = heights[index] ?? 0;
    const page = pages.at(-1);
    if (page && page.length < perPage && used + height <= room) {
      page.push(card);
      used += height;
    } else {
      pages.push([card]);
      used = height;
    }
  });
  return pages;
}

/** Every uploaded image the document shows (the logo aside), each once: their URLs load first. */
export function printedImageIds(model: PrintModel): string[] {
  const photos =
    model.deviations.kind === 'cards' ? model.deviations.cards.flatMap((card) => card.photos) : [];
  const ids = [model.front.photoId, ...photos.map((photo) => photo.imageId)];
  return [...new Set(ids.filter((id) => id !== undefined))];
}
