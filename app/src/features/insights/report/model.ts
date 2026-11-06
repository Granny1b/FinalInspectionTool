/**
 * The Insights report on paper, as data: what each part says, worked out from the filters, the
 * API's answers and the settings, so the components only lay it out and the wording and the
 * arithmetic are tested here. The numbers and their words are the Insights page's (the KPI tiles,
 * the panels), so paper and screen never disagree.
 */
import {
  deviationsPerInspection,
  EXTRA_DEVIATION_REF,
  firstPassRate,
  qualityCheckShortName,
  queryKind,
  SEVERITIES,
  SEVERITY_LABELS,
  type DeviationRow,
  type Insights,
  type InsightsQuery,
  type MachineModel,
  type Severity,
} from '@modig/shared';
import { formatDateTime } from '../../../lib/format';
import { modelName } from '../../../lib/useSettings';
import { formatCalendarDate } from '../../inspections/dates';
import { PERIOD_LABELS, type Period } from '../filters';
import { formatCount, formatDecimal, formatMonthLong, formatPercent, plural } from '../format';
import { capitalised, INSIGHTS_WORDS, type InsightsWords } from '../words';

type Range = Pick<InsightsQuery, 'from' | 'to'>;

/** "2026-10-31" → true: the last day of its month. */
function isMonthEnd(date: string): boolean {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  // Day 0 of the next month is the last day of this one (UTC, so no time zone moves it).
  return day === new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The months a range covers when it is whole months (first day to last day), else null. */
function wholeMonths({ from, to }: Range): [first: string, last: string] | null {
  if (!from || !to || !from.endsWith('-01') || !isMonthEnd(to)) return null;
  return [from.slice(0, 7), to.slice(0, 7)];
}

/**
 * The period as the report states it: "2026-10" for a whole month, "2026-01 – 2026-10" for whole
 * months, else the dates ("2025-12-01 – 2026-11-05"); "From …" or "Up to …" with an open end, and
 * "All time" with neither.
 */
export function periodText(range: Range): string {
  const months = wholeMonths(range);
  if (months) {
    const [first, last] = months.map(formatMonthLong) as [string, string];
    return first === last ? first : `${first} – ${last}`;
  }
  const from = range.from && formatCalendarDate(range.from);
  const to = range.to && formatCalendarDate(range.to);
  if (from && to) return `${from} – ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Up to ${to}`;
  return 'All time';
}

/**
 * Periods that move with the day the report is made ("last 12 months"): their name goes after the
 * dates, which say what they meant that day.
 */
const RELATIVE_PERIODS = new Set<string>(['last12', 'thisYear', 'lastYear']);

/**
 * The PDF's name (Chrome offers the document title): the filters, as the CSV export names its
 * file, so the two files of one selection sort together. "Deviation report 2026-01-01 to
 * 2026-10-31, RMMG", "Deviation report 2026-10, RMMG, incl. in progress"; an open end is "start",
 * or today. Quality checks': "Quality check deviation report 2026-10, RMMG, Pre start up".
 */
export function reportFileName(query: InsightsQuery, today: string): string {
  const quality = queryKind(query) === 'quality';
  const months = wholeMonths(query);
  const range = months
    ? months[0] === months[1]
      ? months[0]
      : `${months[0]} to ${months[1]}`
    : `${query.from ?? 'start'} to ${query.to ?? today}`;
  const extras = [
    query.model,
    quality && query.check ? qualityCheckShortName(query.check) : undefined,
    query.includeInProgress ? 'incl. in progress' : undefined,
  ].filter(Boolean);
  const title = INSIGHTS_WORDS[queryKind(query)].reportTitle;
  return `${title} ${range}${extras.length > 0 ? `, ${extras.join(', ')}` : ''}`;
}

// ---------------------------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------------------------

export type ReportInput = {
  query: InsightsQuery;
  period: Period;
  insights: Insights;
  models: readonly MachineModel[] | undefined;
  companyName: string;
  /** When the numbers were read (ISO). */
  generatedAt: string;
  /** Who made the report: the signed-in user's name. */
  generatedBy: string;
  /** The deviation rows, when the list is included and has arrived; else null. */
  deviations: readonly DeviationRow[] | null;
  /** "YYYY-MM-DD", for an open end in the file name. */
  today: string;
};

/** A line of the header's statement: "Period", "2026-01-01 – 2026-10-31". */
export type ReportFact = { label: string; value: string };

/** A headline number, as a KPI tile shows it. */
export type ReportKpi = { label: string; value: string; detail: string };

/** A row of a ranked table: its count, its share of every deviation, its bar's length (0–1). */
export type ShareRow = {
  key: string;
  label: string;
  /** Muted, after the label: "(not tied to a row)". */
  note?: string;
  value: number;
  share: number;
  bar: number;
};

export type ModelRow = ShareRow & { inspections: number; perInspection: number | null };

export type TopRow = {
  key: string;
  rank: number;
  ref: string;
  text: string;
  section: string;
  /** No longer in the template's latest published revision. */
  removed: boolean;
  model: string;
  failed: number;
  /** Inspections whose checklist had it, and the share of them it failed in. */
  inspections: number;
  share: number;
};

export type ListRow = {
  key: string;
  ref: string;
  /** An extra deviation: not on the checklist, no ref of its own. */
  extra: boolean;
  text: string;
  comment: string;
  severity: Severity;
  category: string;
  resp: string;
};

/** One inspection's deviations in the list, under a line that names the inspection. */
export type ListGroup = {
  key: string;
  number: string;
  date: string;
  model: string;
  /** The machine's name; a quality check's title (it has no machine name). */
  machine: string;
  serialNumber: string;
  finalised: boolean;
  rows: ListRow[];
};

export type Report = {
  /** Final inspections or quality checks: how the report talks about what it counts. */
  words: InsightsWords;
  title: string;
  /** The document title, which Chrome offers as the PDF's name. */
  fileName: string;
  /** What is printed, in a line: the toolbar's subject and the page footer. */
  subject: string;
  /** The period as stated: "2026-10", "2026-01-01 – 2026-10-31", "All time". */
  period: string;
  companyName: string;
  /** "Period", "Model", "Inspections", "Generated". */
  facts: ReportFact[];
  /** No inspection matches the filters: the report says so instead of empty tables. */
  empty: boolean;
  /** Deviation records the API couldn't read, in words; null when there are none. */
  unreadable: string | null;
  kpis: ReportKpi[];
  /** Every deviation in the selection. */
  deviations: number;
  months: Insights['perMonth'];
  severity: ShareRow[];
  top: TopRow[];
  /** More than one model in the selection: the top 10 names the model (refs repeat). */
  showModel: boolean;
  sections: ShareRow[];
  models: ModelRow[];
  resps: ShareRow[];
  categories: ShareRow[];
  /** The deviation rows by inspection; null when the list is not included or would be empty. */
  list: { groups: ListGroup[]; count: number } | null;
};

export function buildReport(input: ReportInput): Report {
  const { query, insights, models } = input;
  const words = INSIGHTS_WORDS[queryKind(query)];
  const quality = words.kind === 'quality';
  const total = insights.deviations;
  const { finalised, inProgress } = insights.inspections;
  const period = periodText(query);
  const model = query.model ? modelName(models, query.model) : 'All models';
  const check = quality ? (query.check ?? 'All quality checks') : null;
  const subject = [
    words.reportTitle,
    period,
    model,
    quality && query.check ? qualityCheckShortName(query.check) : null,
    query.includeInProgress ? 'incl. in progress' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const relative = RELATIVE_PERIODS.has(input.period)
    ? ` (${PERIOD_LABELS[input.period].toLowerCase()})`
    : '';

  return {
    words,
    title: words.reportTitle,
    fileName: reportFileName(query, input.today),
    subject,
    period,
    companyName: input.companyName,
    facts: [
      { label: 'Period', value: `${period}${relative}` },
      { label: 'Model', value: model },
      ...(check ? [{ label: 'Quality check', value: check }] : []),
      {
        label: capitalised(words.many),
        value: query.includeInProgress ? 'Finalised and in progress' : 'Finalised only',
      },
      {
        label: 'Generated',
        value: `${formatDateTime(input.generatedAt)} by ${input.generatedBy}`,
      },
    ],
    empty: finalised + inProgress === 0,
    unreadable: unreadableNote(insights.unreadableRows),
    kpis: kpis(insights, words),
    deviations: total,
    months: insights.perMonth,
    severity: shareRows(
      SEVERITIES.map((severity) => ({
        key: severity,
        label: SEVERITY_LABELS[severity],
        value: insights.bySeverity[severity],
      })),
      total,
    ),
    top: insights.topCheckpoints.map((checkpoint, index) => ({
      key: checkpoint.itemId,
      rank: index + 1,
      ref: checkpoint.ref,
      text: checkpoint.text,
      section: checkpoint.sectionTitle || 'Untitled section',
      removed: checkpoint.removed,
      model: modelName(models, checkpoint.modelCode),
      failed: checkpoint.failed,
      inspections: checkpoint.inspections,
      share: checkpoint.inspections ? checkpoint.failed / checkpoint.inspections : 0,
    })),
    showModel: !query.model && insights.perModel.length > 1,
    sections: shareRows(
      insights.perSection.map(({ title, deviations }) => ({
        key: title ?? '\u0000extra',
        label: title === null ? 'Extra deviations' : title || 'Untitled section',
        note: title === null ? '(not tied to a row)' : undefined,
        value: deviations,
      })),
      total,
    ),
    models: modelRows(insights, models),
    resps: shareRows(
      insights.byResp.map(({ resp, deviations }) => ({
        key: resp || '\u0000none',
        label: resp || 'Not assigned',
        value: deviations,
      })),
      total,
    ),
    categories: shareRows(
      insights.byCategory.map(({ category, deviations }) => ({
        key: category || '\u0000none',
        label: category || 'No category',
        value: deviations,
      })),
      total,
    ),
    // Without deviations there is nothing to list: no page saying so (the toolbar says it).
    list: input.deviations && total > 0 ? deviationList(input.deviations, models, quality) : null,
  };
}

/** As the Insights page says it. */
function unreadableNote(count: number): string | null {
  if (count === 0) return null;
  return `${
    count === 1
      ? '1 deviation record could not be read and is not counted'
      : `${formatCount(count)} deviation records could not be read and are not counted`
  }, so these numbers may be too low.`;
}

/** The KPI tiles' figures and the lines that say what they count. */
function kpis(insights: Insights, words: InsightsWords): ReportKpi[] {
  const { finalised, inProgress } = insights.inspections;
  const perInspection = deviationsPerInspection(insights);
  const rate = firstPassRate(insights.rows);
  const checked = insights.rows.ok + insights.rows.nok;
  return [
    inProgress > 0
      ? {
          label: capitalised(words.many),
          value: formatCount(finalised + inProgress),
          detail: `${formatCount(finalised)} finalised · ${formatCount(inProgress)} in progress`,
        }
      : {
          label: `${capitalised(words.many)} finalised`,
          value: formatCount(finalised),
          detail: words.doneInPeriod,
        },
    {
      label: 'Deviations',
      value: formatCount(insights.deviations),
      detail: 'NOK rows and extra deviations',
    },
    {
      label: words.perOneLabel,
      value: perInspection === null ? '–' : formatDecimal(perInspection),
      detail: `Average per ${words.one}`,
    },
    {
      label: 'First-pass rate',
      value: rate === null ? '–' : formatPercent(rate, 1),
      detail:
        rate === null
          ? 'No rows checked yet'
          : `${formatCount(insights.rows.ok)} of ${plural(checked, 'checked row')} OK (N/A not counted)`,
    },
  ];
}

/**
 * Shares of every deviation in the selection, and bars as long as the count against the largest
 * (as on the page: the rank is in their length).
 */
function shareRows(
  rows: { key: string; label: string; note?: string; value: number }[],
  total: number,
): ShareRow[] {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return rows.map((row) => ({
    ...row,
    share: total ? row.value / total : 0,
    bar: row.value / max,
  }));
}

function modelRows(insights: Insights, models: readonly MachineModel[] | undefined): ModelRow[] {
  const rows = shareRows(
    insights.perModel.map(({ modelCode, deviations }) => ({
      key: modelCode,
      label: modelName(models, modelCode),
      value: deviations,
    })),
    insights.deviations,
  );
  return rows.map((row, index) => {
    const inspections = insights.perModel[index]!.inspections;
    return { ...row, inspections, perInspection: inspections ? row.value / inspections : null };
  });
}

/**
 * The rows grouped by inspection, in the API's order (oldest inspection first). A quality check
 * is named by its title, where a final inspection has its machine's name.
 */
function deviationList(
  rows: readonly DeviationRow[],
  models: readonly MachineModel[] | undefined,
  quality = false,
): { groups: ListGroup[]; count: number } {
  const groups = new Map<string, ListGroup>();
  for (const row of rows) {
    let group = groups.get(row.inspectionId);
    if (!group) {
      group = {
        key: row.inspectionId,
        number: row.inspectionNumber,
        date: formatCalendarDate(row.inspectionDate),
        model: modelName(models, row.modelCode),
        machine: (quality ? row.checkName : row.machineName).trim(),
        serialNumber: row.serialNumber.trim(),
        finalised: row.finalised,
        rows: [],
      };
      groups.set(row.inspectionId, group);
    }
    const extra = !row.itemId && row.displayRef === EXTRA_DEVIATION_REF;
    group.rows.push({
      key: row.itemId || `${row.displayRef}-${group.rows.length}`,
      ref: row.displayRef,
      extra,
      text: row.checkpointText,
      comment: row.comment.trim(),
      severity: row.severity,
      category: row.category,
      resp: row.resp,
    });
  }
  return { groups: [...groups.values()], count: rows.length };
}
