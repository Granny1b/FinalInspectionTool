/**
 * The deviation log on paper: the deviations under the log page's filters, machine by machine, for
 * the copy kept at the machine and signed there. Two layouts:
 * - `list`, a checklist: one line per deviation with a box to tick and room to write what was
 *   done, when and who; closed ones say how they were closed instead;
 * - `cards`: a card per deviation with its photos and the same room to sign, as a quality check's
 *   report prints its deviations.
 * Both start with what is printed (the filters) and end with one sign-off for all of them while
 * some are open. Pure, so the rules are unit-tested; the components only lay it out.
 */
import {
  deviationLogId,
  qualityCheckShortName,
  type AnnotatedImage,
  type DeviationLogEntry,
  type InspectionKind,
  type MachineModel,
  type Severity,
} from '@modig/shared';
import { modelName } from '../../../lib/useSettings';
import type { LogFilter, LogGroup, LogView } from '../../deviationLog/model';
import {
  company,
  plural,
  SEPARATOR,
  type ClosedDeviation,
  type DeviationCard,
  type FrontField,
} from '../model';

export const LOG_PRINT_LAYOUTS = ['list', 'cards'] as const;
export type LogPrintLayout = (typeof LOG_PRINT_LAYOUTS)[number];
/** How the toolbar, the preview and the Print menu name each layout. */
export const LOG_PRINT_LAYOUT_LABELS: Record<LogPrintLayout, string> = {
  list: 'Checklist',
  cards: 'With pictures',
};

/** The layout in the address (`layout=`), if it names one. */
export function parseLogLayout(value: string | null): LogPrintLayout | null {
  return LOG_PRINT_LAYOUTS.find((layout) => layout === value) ?? null;
}

/** What each kind's printout is called. */
export const LOG_PRINT_TITLES: Record<InspectionKind, string> = {
  final: 'Final inspection deviations',
  quality: 'Quality check deviations',
};

export type LogPrintRow = {
  /** "QC-2026-0003 · D-01" */
  id: string;
  severity: Severity;
  /** "1.a", or null for a deviation not on the checklist. */
  ref: string | null;
  /** The checkpoint, or the extra deviation's description. */
  text: string;
  /** The row's section; '' for one not on the checklist. */
  sectionTitle: string;
  /** "Pre start up": the quality check it was found in ('' for a final inspection's). */
  check: string;
  comment: string;
  resp: string;
  category: string;
  /** Closed in the app: how, when and who. Null while it is open. */
  closed: ClosedDeviation | null;
};

export type LogPrintGroup = {
  key: string;
  machineName: string;
  serialNumber: string;
  modelLabel: string;
  /** "QC-2026-0003 Pre start up 2026-11-06", one per inspection, oldest first. */
  inspections: string[];
  /** "2 open · 1 closed": what is printed for this machine. */
  counts: string;
  rows: LogPrintRow[];
};

export type DeviationLogPrintModel = {
  /** Tells it from the other printouts. */
  document: 'deviation-log';
  mode: LogPrintLayout;
  /** On the first page: the title, what is printed (the filters and the day) and how many. */
  header: {
    companyName: string;
    title: string;
    facts: FrontField[];
    /** "5 deviations · 3 open · 2 closed" */
    summary: string;
  };
  /** The checklist's machines, in the log's order. */
  groups: LogPrintGroup[];
  /** The cards (with pictures): the same deviations, machine by machine. */
  deviations: { kind: 'cards'; cards: DeviationCard[] } | { kind: 'none' };
  /** Some are open: the printout ends with a sign-off for all of them. */
  open: number;
  /** Right of the cards' heading on every page. */
  subject: string;
  /** Under "Print preview": the title and the filters. */
  revisionLabel: string;
  /** Bottom left of every page. */
  footer: string;
  /** The document title, which Chrome offers as the PDF's file name. */
  fileName: string;
};

export type LogPrintContext = {
  kind: InspectionKind;
  companyName: string;
  models: readonly MachineModel[] | undefined;
  /** The machine picked in the filters, by its Machine ID, when it is known. */
  machineName?: string | undefined;
  /** "YYYY-MM-DD": the day printed. */
  today: string;
  /**
   * The deviations' photos by `photoKey` (GET /api/deviations/photos), for the cards. Left out,
   * every card has a frame to sketch in.
   */
  photos?: ReadonlyMap<string, readonly AnnotatedImage[]>;
};

/** A deviation's key among all of them: its inspection's id and its own. */
export function photoKey(entry: Pick<DeviationLogEntry, 'inspectionId' | 'key'>): string {
  return `${entry.inspectionId}/${entry.key}`;
}

const STATUS_WORDS: Record<LogFilter['status'], string> = {
  open: 'Open',
  closed: 'Closed',
  all: 'Open and closed',
};

/** The deviation log as it prints under `filter` (its view: logView), in `layout`. */
export function deviationLogPrint(
  view: LogView,
  filter: LogFilter,
  layout: LogPrintLayout,
  context: LogPrintContext,
): DeviationLogPrintModel {
  const title = LOG_PRINT_TITLES[context.kind];
  const groups = view.groups.map((group) => printGroup(group, context));
  const rows = groups.flatMap((group) => group.rows);
  const open = rows.filter((row) => !row.closed).length;
  const filters = filterWords(filter, context);
  const facts: FrontField[] = [
    { label: 'Printed', value: context.today },
    { label: 'Status', value: STATUS_WORDS[filter.status] },
    ...filters.map(([label, value]) => ({ label, value })),
  ];
  // "Testgellan#1 · Open": what this paper is, on every page and in its name.
  const about = [...filters.map(([, value]) => value), STATUS_WORDS[filter.status]];

  return {
    document: 'deviation-log',
    mode: layout,
    header: {
      companyName: company({ companyName: context.companyName, modelLabel: '' }),
      title,
      facts,
      summary: [
        plural(rows.length, 'deviation'),
        `${open} open`,
        `${rows.length - open} closed`,
      ].join(SEPARATOR),
    },
    groups,
    deviations:
      layout === 'cards'
        ? {
            kind: 'cards',
            cards: view.groups.flatMap((group, index) =>
              group.entries.map((entry, row) =>
                logCard(groups[index]!.rows[row]!, entry, groups[index]!, context),
              ),
            ),
          }
        : { kind: 'none' },
    open,
    subject: about.join(SEPARATOR),
    revisionLabel: about.join(SEPARATOR),
    footer: [title, ...about, `Printed ${context.today}`].join(SEPARATOR),
    fileName: `${title} ${context.today}, ${about.join(', ')} – ${LOG_PRINT_LAYOUT_LABELS[layout]}`,
  };
}

/** The filters in use besides the status, in words: ["Machine", "Magellan#1"], … */
function filterWords(filter: LogFilter, context: LogPrintContext): [string, string][] {
  const words: [string, string][] = [];
  if (filter.machine) words.push(['Machine', context.machineName || 'One machine']);
  if (filter.model) words.push(['Model', modelName(context.models, filter.model)]);
  if (filter.resp) {
    words.push(['Responsible', filter.resp === '-' ? 'Not assigned' : filter.resp]);
  }
  if (filter.category) {
    words.push(['Category', filter.category === '-' ? 'No category' : filter.category]);
  }
  if (filter.q.trim()) words.push(['Search', `“${filter.q.trim()}”`]);
  return words;
}

function printGroup(group: LogGroup, context: LogPrintContext): LogPrintGroup {
  const open = group.entries.filter((entry) => entry.status === 'open').length;
  return {
    key: group.key,
    machineName: group.machineName.trim(),
    serialNumber: group.serialNumber.trim(),
    modelLabel: modelName(context.models, group.modelCode),
    inspections: group.inspections.map((inspection) =>
      [
        inspection.number,
        qualityCheckShortName(inspection.checkName || group.checkName),
        inspection.date,
      ]
        .filter(Boolean)
        .join(' '),
    ),
    counts: `${open} open${SEPARATOR}${group.entries.length - open} closed`,
    rows: group.entries.map(printRow),
  };
}

function printRow(entry: DeviationLogEntry): LogPrintRow {
  return {
    id: deviationLogId(entry),
    severity: entry.severity,
    ref: entry.itemId ? entry.displayRef : null,
    text: entry.checkpointText.trim(),
    sectionTitle: entry.itemId ? entry.sectionTitle.trim() : '',
    check: qualityCheckShortName(entry.checkName),
    comment: entry.comment.trim(),
    resp: entry.resp.trim(),
    category: entry.category.trim(),
    closed:
      entry.status === 'closed'
        ? { action: entry.action.trim(), closedOn: entry.closedOn, closedBy: entry.closedBy.trim() }
        : null,
  };
}

/** A deviation as a card, as a quality check's report prints it, naming its machine and check. */
function logCard(
  row: LogPrintRow,
  entry: DeviationLogEntry,
  group: LogPrintGroup,
  context: LogPrintContext,
): DeviationCard {
  const machine = [
    group.machineName || 'No Machine ID',
    group.serialNumber && `S/N ${group.serialNumber}`,
  ];
  return {
    number: row.id,
    ref: row.ref,
    sectionTitle: row.sectionTitle,
    text: row.text,
    comment: row.comment,
    severity: row.severity,
    resp: row.resp,
    category: row.category,
    photos: (context.photos?.get(photoKey(entry)) ?? []).map((photo) => ({
      imageId: photo.renderedImageId ?? photo.imageId,
      caption: photo.caption?.trim() ?? '',
    })),
    context: [...machine, row.check].filter(Boolean).join(SEPARATOR),
    ...(row.closed && { closed: row.closed }),
  };
}

/** Every photo the printout shows (the cards'), each once. */
export function logPrintImageIds(model: DeviationLogPrintModel): string[] {
  if (model.deviations.kind !== 'cards') return [];
  const ids = model.deviations.cards.flatMap((card) => card.photos.map((photo) => photo.imageId));
  return [...new Set(ids)];
}
