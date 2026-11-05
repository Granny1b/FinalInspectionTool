/**
 * Insights (brief §5.5): the KPI dashboard's filters, the API's answer, and the pure aggregation
 * behind it. The API feeds `aggregateInsights` the inspection list (every inspection, with or
 * without deviations) and the rows of the deviations table; the app only draws the result.
 */
import { z } from 'zod';
import type { InspectionSummary } from './inspections';
import {
  DeviationRowSchema,
  ModelCodeSchema,
  SEVERITIES,
  type DeviationRow,
  type Severity,
} from './schemas';

// ---------------------------------------------------------------------------------------------
// Filters: GET /api/insights?from&to&model&includeInProgress (the same for …/export.csv)
// ---------------------------------------------------------------------------------------------

/** "YYYY-MM-DD" in 2000–2099: any date an inspection has, and a month axis that stays small. */
const FilterDate = z.iso
  .date()
  .refine((date) => date >= '2000-01-01' && date <= '2099-12-31', 'Pick a date in 2000–2099');

const InsightsParamsSchema = z
  .object({
    /** First inspection date counted, inclusive. */
    from: FilterDate.optional(),
    /** Last inspection date counted, inclusive. */
    to: FilterDate.optional(),
    model: ModelCodeSchema.optional(),
    /** Only finalised inspections count unless this is "true" (brief §4). */
    includeInProgress: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'The start date is after the end date.',
    path: ['to'],
  });

export type InsightsQuery = {
  from?: string;
  to?: string;
  model?: string;
  includeInProgress: boolean;
};

const QUERY_KEYS = ['from', 'to', 'model', 'includeInProgress'] as const;

/** What the filters are read from: a URLSearchParams, in the browser or in the API. */
type QueryParams = { get(name: string): string | null };

/** Reads the filters from a URL's query string; an empty value counts as not given. */
export function parseInsightsQuery(
  params: QueryParams,
): { success: true; data: InsightsQuery } | { success: false; error: z.ZodError } {
  const raw: Record<string, string> = {};
  for (const key of QUERY_KEYS) {
    const value = params.get(key);
    if (value) raw[key] = value;
  }
  const result = InsightsParamsSchema.safeParse(raw);
  return result.success
    ? { success: true, data: withoutUndefined(result.data) }
    : { success: false, error: result.error };
}

/**
 * The filters as query parameters (for `new URLSearchParams(…)`): only those in use, so the URL
 * stays clean.
 */
export function insightsQueryParams(query: InsightsQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.from) params.from = query.from;
  if (query.to) params.to = query.to;
  if (query.model) params.model = query.model;
  if (query.includeInProgress) params.includeInProgress = 'true';
  return params;
}

function withoutUndefined(query: InsightsQuery): InsightsQuery {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined),
  ) as InsightsQuery;
}

// ---------------------------------------------------------------------------------------------
// The answer
// ---------------------------------------------------------------------------------------------

const Count = z.number().int().min(0);

/** How many of the top checkpoints the dashboard lists (brief §5.5: top 10). */
export const TOP_CHECKPOINTS = 10;

export const InsightsSchema = z.object({
  /** Model codes of every inspection, whatever the filters: the model filter's choices. */
  modelCodes: z.array(z.string()),
  /** Inspections in scope. `inProgress` is 0 unless in-progress ones are included. */
  inspections: z.object({ finalised: Count, inProgress: Count }),
  /** Deviations of those inspections: NOK rows plus extra deviations. */
  deviations: Count,
  /** Their checklist rows by status, for the first-pass rate. Rows without a status are left out. */
  rows: z.object({ ok: Count, nok: Count, na: Count }),
  /** Every month of the range, oldest first, empty months included. */
  perMonth: z.array(z.object({ month: z.string(), inspections: Count, deviations: Count })),
  /** Most deviations first; `title` null (extra deviations, which belong to no section) last. */
  perSection: z.array(z.object({ title: z.string().nullable(), deviations: Count })),
  /** Most deviations first; models whose inspections had none are included. */
  perModel: z.array(z.object({ modelCode: z.string(), inspections: Count, deviations: Count })),
  bySeverity: z.object({ minor: Count, major: Count, critical: Count }),
  /**
   * Checkpoints that failed, most failures first, at most TOP_CHECKPOINTS. Ref, text and section
   * are where the checkpoint is now (the template's latest published revision); `removed` when it
   * is no longer in it, and they are then as it was last inspected.
   */
  topCheckpoints: z.array(
    z.object({
      itemId: z.string(),
      modelCode: z.string(),
      ref: z.string(),
      text: z.string(),
      sectionTitle: z.string(),
      removed: z.boolean(),
      /** Inspections in scope where it was NOK. */
      failed: Count,
      /** Inspections in scope whose checklist had it. */
      inspections: Count,
    }),
  ),
  /** Most deviations first; `resp` '' (deviations without one) last. */
  byResp: z.array(z.object({ resp: z.string(), deviations: Count })),
  /** As `byResp`, by the deviation category; `category` '' (none chosen) last. */
  byCategory: z.array(z.object({ category: z.string(), deviations: Count })),
  /**
   * Deviation rows under the filters that could not be read, so none of the numbers above count
   * them: the page says its numbers may be short. 0 normally.
   */
  unreadableRows: Count.default(0),
});
export type Insights = z.infer<typeof InsightsSchema>;

/** Share of checked rows that were OK (N/A rows are not checked); null with nothing checked. */
export function firstPassRate(rows: Insights['rows']): number | null {
  const checked = rows.ok + rows.nok;
  return checked === 0 ? null : rows.ok / checked;
}

/** Deviations per inspection in scope; null without inspections. */
export function deviationsPerInspection(insights: Pick<Insights, 'inspections' | 'deviations'>) {
  const count = insights.inspections.finalised + insights.inspections.inProgress;
  return count === 0 ? null : insights.deviations / count;
}

// ---------------------------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------------------------

/** What the aggregation needs of an inspection: its list summary. */
export type InsightsInspection = Pick<
  InspectionSummary,
  | 'id'
  | 'number'
  | 'modelCode'
  | 'date'
  | 'state'
  | 'filled'
  | 'okCount'
  | 'nokCount'
  | 'templateId'
  | 'templateRevision'
>;

/** Where a checkpoint is in a template's latest published revision. */
export type CurrentCheckpoint = { ref: string; text: string; sectionTitle: string };

/** Published revisions, which never change, as the API has read them. */
export type ChecklistLookup = {
  /** The row ids of a revision; undefined when it could not be read. */
  itemIds(templateId: string, revision: number): ReadonlySet<string> | undefined;
  /** The checkpoint in its template's latest published revision; undefined if not there. */
  current(templateId: string, itemId: string): CurrentCheckpoint | undefined;
};

type AggregateInput = {
  query: InsightsQuery;
  /** Every inspection; the filters are applied here. */
  inspections: readonly InsightsInspection[];
  /** Deviation rows; those of inspections out of scope are ignored. */
  deviations: readonly DeviationRow[];
  checklists: ChecklistLookup;
  /** Rows the table held under the filters that could not be read (passed through). */
  unreadableRows?: number;
};

/** Whether an inspection counts under the filters (date and model of its front page). */
export function inScope(inspection: InsightsInspection, query: InsightsQuery): boolean {
  if (query.from && inspection.date < query.from) return false;
  if (query.to && inspection.date > query.to) return false;
  if (query.model && inspection.modelCode !== query.model) return false;
  return query.includeInProgress || inspection.state === 'finalised';
}

/**
 * The dashboard's numbers. Which inspections count comes from the inspection list alone (the
 * blobs are the truth); their deviations come from the table, matched by inspection id, so a row
 * left behind by an inspection that no longer exists is never counted.
 */
export function aggregateInsights({
  query,
  inspections,
  deviations,
  checklists,
  unreadableRows = 0,
}: AggregateInput): Insights {
  const scope = inspections.filter((inspection) => inScope(inspection, query));
  const byId = new Map(scope.map((inspection) => [inspection.id, inspection]));
  const rows = deviations.filter((row) => byId.has(row.inspectionId));

  const rowCounts = { ok: 0, nok: 0, na: 0 };
  for (const inspection of scope) {
    rowCounts.ok += inspection.okCount;
    rowCounts.nok += inspection.nokCount;
    rowCounts.na += inspection.filled - inspection.okCount - inspection.nokCount;
  }

  const bySeverity = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0])) as Record<
    Severity,
    number
  >;
  for (const row of rows) bySeverity[row.severity] += 1;

  return {
    modelCodes: [...new Set(inspections.map((inspection) => inspection.modelCode))].sort(),
    inspections: {
      finalised: scope.filter((inspection) => inspection.state === 'finalised').length,
      inProgress: scope.filter((inspection) => inspection.state === 'in_progress').length,
    },
    deviations: rows.length,
    rows: rowCounts,
    perMonth: perMonth(query, scope, rows, byId),
    perSection: grouped(rows, (row) => (row.itemId ? row.sectionTitle : null)).map(
      ({ key, count }) => ({ title: key, deviations: count }),
    ),
    perModel: perModel(scope, rows),
    bySeverity,
    topCheckpoints: topCheckpoints(scope, rows, byId, checklists),
    byResp: grouped(rows, (row) => row.resp).map(({ key, count }) => ({
      resp: key ?? '',
      deviations: count,
    })),
    byCategory: grouped(rows, (row) => row.category).map(({ key, count }) => ({
      category: key ?? '',
      deviations: count,
    })),
    unreadableRows,
  };
}

/** "2026-10" for "2026-10-07". */
const monthOf = (date: string) => date.slice(0, 7);

/** "2026-11" → "2026-12" → "2027-01". */
function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const next = Number(month.slice(5, 7)) + 1;
  return next > 12 ? `${year + 1}-01` : `${year}-${String(next).padStart(2, '0')}`;
}

/** Every month from the one holding `start` to the one holding `end`, both included. */
export function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  const last = monthOf(end);
  for (let month = monthOf(start); month <= last; month = nextMonth(month)) months.push(month);
  return months;
}

/**
 * The months of the chosen range; an open end reaches the first or last inspection in scope.
 * Deviations are counted in the month of their inspection's date.
 */
function perMonth(
  query: InsightsQuery,
  scope: readonly InsightsInspection[],
  rows: readonly DeviationRow[],
  byId: ReadonlyMap<string, InsightsInspection>,
): Insights['perMonth'] {
  const dates = scope.map((inspection) => inspection.date).sort();
  const start = query.from ?? dates[0];
  const end = query.to ?? dates.at(-1);
  if (!start || !end) return [];
  const months = new Map(
    monthsBetween(start, end).map((month) => [month, { month, inspections: 0, deviations: 0 }]),
  );
  for (const inspection of scope) {
    const entry = months.get(monthOf(inspection.date));
    if (entry) entry.inspections += 1;
  }
  for (const row of rows) {
    const entry = months.get(monthOf(byId.get(row.inspectionId)!.date));
    if (entry) entry.deviations += 1;
  }
  return [...months.values()];
}

function perModel(
  scope: readonly InsightsInspection[],
  rows: readonly DeviationRow[],
): Insights['perModel'] {
  const models = new Map<string, { modelCode: string; inspections: number; deviations: number }>();
  const entry = (modelCode: string) => {
    let found = models.get(modelCode);
    if (!found) models.set(modelCode, (found = { modelCode, inspections: 0, deviations: 0 }));
    return found;
  };
  for (const inspection of scope) entry(inspection.modelCode).inspections += 1;
  for (const row of rows) entry(row.modelCode).deviations += 1;
  return [...models.values()].sort(
    (a, b) => b.deviations - a.deviations || a.modelCode.localeCompare(b.modelCode),
  );
}

const lower = (text: string) => text.toLocaleLowerCase('sv');

/**
 * Counts rows by a free-text value (a section title, a "Resp", a category), trimmed and ignoring
 * case: one entry per name, spelled the way most rows spell it (the first one met on a tie). Null
 * is a key of its own. Most rows first, then alphabetically; null and '' (no name) always last.
 */
function grouped(
  rows: readonly DeviationRow[],
  value: (row: DeviationRow) => string | null,
): { key: string | null; count: number }[] {
  const groups = new Map<string | null, { count: number; spellings: Map<string, number> }>();
  for (const row of rows) {
    const raw = value(row);
    const text = raw === null ? null : raw.trim();
    const key = text === null ? null : lower(text);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { count: 0, spellings: new Map() }));
    group.count += 1;
    if (text !== null) group.spellings.set(text, (group.spellings.get(text) ?? 0) + 1);
  }
  return [...groups]
    .map(([key, { count, spellings }]) => ({
      key: key === null ? null : mostUsed(spellings),
      count,
    }))
    .sort((a, b) => blankLast(a.key, b.key) || b.count - a.count || byName(a.key, b.key));
}

function mostUsed(spellings: ReadonlyMap<string, number>): string {
  let best = '';
  let bestCount = 0;
  for (const [spelling, count] of spellings) {
    if (count > bestCount) [best, bestCount] = [spelling, count];
  }
  return best;
}

const collator = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/** Null (no section) and '' (no resp or category, an untitled section) after every name. */
function blankLast(a: string | null, b: string | null): number {
  return (a ? 0 : 1) - (b ? 0 : 1);
}

function byName(a: string | null, b: string | null): number {
  return collator.compare(a ?? '', b ?? '');
}

/** Latest inspection first: by date, then by number. */
function newerFirst(a: InsightsInspection, b: InsightsInspection): number {
  return b.date.localeCompare(a.date) || collator.compare(b.number, a.number);
}

/**
 * The checkpoints that fail most (brief §5.5), grouped by the stable item id. "% of inspections
 * where it failed" divides by the inspections whose checklist had the row: an inspection made
 * before the row was added, or after it was removed, says nothing about it.
 */
function topCheckpoints(
  scope: readonly InsightsInspection[],
  rows: readonly DeviationRow[],
  byId: ReadonlyMap<string, InsightsInspection>,
  checklists: ChecklistLookup,
): Insights['topCheckpoints'] {
  const failures = new Map<string, DeviationRow[]>();
  for (const row of rows) {
    if (!row.itemId) continue; // an extra deviation: no checkpoint
    const list = failures.get(row.itemId) ?? [];
    failures.set(row.itemId, list);
    list.push(row);
  }

  const checkpoints = [...failures].map(([itemId, failed]) => {
    // The latest inspection's row tells where the checkpoint was when it was last inspected.
    const latest = failed.reduce((a, b) =>
      newerFirst(byId.get(a.inspectionId)!, byId.get(b.inspectionId)!) <= 0 ? a : b,
    );
    const failedIn = new Set(failed.map((row) => row.inspectionId));
    const templates = new Set(failed.map((row) => row.templateId));
    const inspections = scope.filter((inspection) => {
      if (failedIn.has(inspection.id)) return true;
      const items = checklists.itemIds(inspection.templateId, inspection.templateRevision);
      // A revision that could not be read: count every inspection of the checkpoint's template.
      return items ? items.has(itemId) : templates.has(inspection.templateId);
    }).length;
    const current = checklists.current(latest.templateId, itemId);
    return {
      itemId,
      modelCode: latest.modelCode,
      ref: current?.ref ?? latest.displayRef,
      text: current?.text ?? latest.checkpointText,
      sectionTitle: current?.sectionTitle ?? latest.sectionTitle,
      removed: !current,
      failed: failedIn.size,
      inspections,
    };
  });

  return checkpoints
    .sort(
      (a, b) =>
        b.failed - a.failed ||
        b.failed / b.inspections - a.failed / a.inspections ||
        a.modelCode.localeCompare(b.modelCode) ||
        compareRefs(a.ref, b.ref) ||
        a.itemId.localeCompare(b.itemId),
    )
    .slice(0, TOP_CHECKPOINTS);
}

/** Checklist order: "2.b" before "10.a", "1.z" before "1.aa". */
export function compareRefs(a: string, b: string): number {
  const [sectionA, letterA] = refParts(a);
  const [sectionB, letterB] = refParts(b);
  return (
    sectionA - sectionB ||
    letterA.length - letterB.length ||
    letterA.localeCompare(letterB) ||
    a.localeCompare(b)
  );
}

/** "3.c" → [3, "c"]; anything else (an extra deviation's "—") sorts last. */
function refParts(ref: string): [section: number, letters: string] {
  const match = /^(\d+)\.([a-z]+)$/.exec(ref);
  return match ? [Number(match[1]), match[2]!] : [Number.MAX_SAFE_INTEGER, ref];
}

// ---------------------------------------------------------------------------------------------
// The deviation list: GET /api/insights/deviations?from&to&model&includeInProgress
// ---------------------------------------------------------------------------------------------

/**
 * The deviation rows behind the numbers, for the printed report's "Include deviation list": the
 * rows the CSV export holds, under the same filters and in the same order (oldest inspection
 * first, each inspection's rows in checklist order, extra deviations last). A row's ref and text
 * are as they were inspected, as that inspection's own report prints them.
 */
export const InsightsDeviationsSchema = z.object({ rows: z.array(DeviationRowSchema) });
export type InsightsDeviations = z.infer<typeof InsightsDeviationsSchema>;
