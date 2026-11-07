/**
 * The deviation log: every deviation of the final inspections (or of the quality checks), with
 * its follow-up – open or closed, what was done about it, when and by whom – so Quality sees what
 * is still open per machine and per responsible, as the Excel log did.
 *
 * A follow-up is kept apart from the inspection (`follow-ups/{inspectionId}.json`): closing a
 * deviation does not change what the inspection found, and the inspection's page, which saves
 * with If-Match, never sees its version change because of it. The deviations table carries each
 * deviation's follow-up next to the rest of its row, so the log is one table query.
 */
import { z } from 'zod';
import { compareRefs } from './insights';
import { deviationNumber, refWithText } from './numbering';
import {
  AnnotatedImageSchema,
  DeviationRowSchema,
  IdSchema,
  InspectionKindSchema,
  ModelCodeSchema,
  type InspectionKind,
} from './schemas';

const IsoDateTime = z.iso.datetime({ offset: true });
/** "YYYY-MM-DD" in 2000–2099, as the front page's dates and Insights' filters. */
const LogDate = z.iso
  .date()
  .refine((date) => date >= '2000-01-01' && date <= '2099-12-31', 'Pick a date in 2000–2099');

// ---------------------------------------------------------------------------------------------
// Follow-up: PUT /api/inspections/{id}/follow-ups/{key}, stored in follow-ups/{inspectionId}.json
// ---------------------------------------------------------------------------------------------

export const FOLLOW_UP_STATUSES = ['open', 'closed'] as const;
export const FollowUpStatusSchema = z.enum(FOLLOW_UP_STATUSES);
export type FollowUpStatus = z.infer<typeof FollowUpStatusSchema>;
export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  open: 'Open',
  closed: 'Closed',
};

/** What was done about a deviation, as typed. */
const ActionSchema = z.string().trim().max(2000);
/** Who closed it: a name as typed ("Anna Andersson"), as Checked by and Participants are. */
const ClosedBySchema = z.string().trim().max(200);

/** One deviation's follow-up, as stored. A deviation without one is open. */
export const FollowUpSchema = z.object({
  status: FollowUpStatusSchema,
  /** What was done ("New labels on the SMC filter cables"); '' when nothing was written. */
  action: z.string().max(2000).default(''),
  /** The day it was closed, "YYYY-MM-DD"; '' while it is open. */
  closedOn: z.union([z.iso.date(), z.literal('')]).default(''),
  /** Who closed it; '' while it is open. */
  closedBy: z.string().max(200).default(''),
  updatedAt: IsoDateTime,
  /** The email of whoever changed it last. */
  updatedBy: z.string(),
});
export type FollowUp = z.infer<typeof FollowUpSchema>;

/** `follow-ups/{inspectionId}.json`, and GET /api/inspections/{id}/follow-ups. */
export const FollowUpsSchema = z.object({
  inspectionId: IdSchema,
  /**
   * By deviation key: a NOK row's item id, or an extra deviation's id. A key whose deviation is
   * gone (its row set back to OK) is kept, and counts again if the row is NOK again: it is the
   * same checkpoint of the same inspection.
   */
  followUps: z.record(IdSchema, FollowUpSchema),
});
export type FollowUps = z.infer<typeof FollowUpsSchema>;

/**
 * PUT /api/inspections/{id}/follow-ups/{key}. Close: the action, the day and who, each defaulted
 * when left out (the action as it was, today, and the signed-in person). Reopen: optionally a new
 * action; the day and who are cleared.
 */
export const FollowUpRequestSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('open'), action: ActionSchema.optional() }),
  z.object({
    status: z.literal('closed'),
    action: ActionSchema.optional(),
    closedOn: LogDate.optional(),
    closedBy: ClosedBySchema.optional(),
  }),
]);
export type FollowUpRequest = z.infer<typeof FollowUpRequestSchema>;

/**
 * The follow-up after `request`. Closing keeps the day and who of an earlier close unless they
 * are given (editing a closed deviation's action doesn't move its date), else today and the
 * signed-in person; reopening keeps the action, so whoever picks it up sees what was tried.
 */
export function applyFollowUp(
  current: FollowUp | undefined,
  request: FollowUpRequest,
  by: { today: string; name: string; email: string; now: string },
): FollowUp {
  const action = request.action ?? current?.action ?? '';
  const audit = { updatedAt: by.now, updatedBy: by.email };
  if (request.status === 'open') {
    return { status: 'open', action, closedOn: '', closedBy: '', ...audit };
  }
  const wasClosed = current?.status === 'closed';
  return {
    status: 'closed',
    action,
    closedOn: request.closedOn ?? (wasClosed && current.closedOn ? current.closedOn : by.today),
    closedBy: request.closedBy || (wasClosed && current.closedBy ? current.closedBy : by.name),
    ...audit,
  };
}

// ---------------------------------------------------------------------------------------------
// The table's rows with their follow-up
// ---------------------------------------------------------------------------------------------

/**
 * A row of the deviations table as the log reads it: the KPI columns (DeviationRowSchema), the
 * deviation's number in its inspection, and its follow-up. Rows written before the log existed
 * have none of these: they are open, and get them at their inspection's next write.
 */
export const DeviationLogRowSchema = DeviationRowSchema.extend({
  /** "D-03", as on the inspection's Deviations tab ('' on rows written before it was kept). */
  deviationNumber: z.string().default(''),
  status: FollowUpStatusSchema.default('open'),
  action: z.string().default(''),
  closedOn: z.string().default(''),
  closedBy: z.string().default(''),
});
export type DeviationLogRow = z.infer<typeof DeviationLogRowSchema>;

/** One deviation in the log: its row, with what the page needs to act on it. */
export const DeviationLogEntrySchema = DeviationLogRowSchema.extend({
  /** Its key in the inspection (a row's item id, or an extra deviation's id): the follow-up's. */
  key: IdSchema,
  /** The day it was first recorded, in Swedish time. */
  foundOn: z.iso.date(),
  /**
   * The machine its inspection was done on, when it is linked to one (from the inspection list,
   * not the table): the log groups its deviations under the machine.
   */
  machineRef: IdSchema.optional(),
});
export type DeviationLogEntry = z.infer<typeof DeviationLogEntrySchema>;

/** A machine as the log names it: as it is now, whatever its inspections were done with. */
export const LogMachineSchema = z.object({
  id: IdSchema,
  machineName: z.string(),
  serialNumber: z.string(),
  modelCode: z.string(),
});
export type LogMachine = z.infer<typeof LogMachineSchema>;

/**
 * GET /api/deviations/photos (same filters as the log): the photos of the deviations under the
 * filters, for printing the log with its pictures. Only deviations with photos are listed; the
 * table has none, so they are read from the inspections.
 */
export const DeviationPhotosSchema = z.object({
  photos: z.array(
    z.object({ inspectionId: IdSchema, key: IdSchema, photos: z.array(AnnotatedImageSchema) }),
  ),
});
export type DeviationPhotos = z.infer<typeof DeviationPhotosSchema>;

/** GET /api/deviations */
export const DeviationLogSchema = z.object({
  entries: z.array(DeviationLogEntrySchema),
  /** The machines the entries' inspections are linked to. Defaulted for an API without it. */
  machines: z.array(LogMachineSchema).default([]),
  /** Rows of the deviations table that could not be read (edited by hand, say). */
  unreadableRows: z.number().int().min(0),
});
export type DeviationLog = z.infer<typeof DeviationLogSchema>;

const swedishDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' });

/** The day of a moment in Sweden, "2026-11-06": when a deviation was found, today. */
export function swedishDay(moment: Date | string): string {
  return swedishDate.format(typeof moment === 'string' ? new Date(moment) : moment);
}

/**
 * The log's entries from the table's rows (with their RowKeys). Rows written before the
 * deviation's number was kept get one here, as the Deviations tab numbers them: rows in checklist
 * order, then extra deviations (in the order they were recorded, which is the best the table
 * knows).
 */
export function logEntries(
  rows: readonly (DeviationLogRow & { rowKey: string })[],
): DeviationLogEntry[] {
  const unnumbered = new Set(
    rows.filter((row) => !row.deviationNumber).map((row) => row.inspectionId),
  );
  const numbers = new Map<string, string>();
  for (const inspectionId of unnumbered) {
    rows
      .filter((row) => row.inspectionId === inspectionId)
      .sort(
        (a, b) => compareRefs(a.displayRef, b.displayRef) || a.createdAt.localeCompare(b.createdAt),
      )
      .forEach((row, index) => numbers.set(row.rowKey, deviationNumber(index)));
  }
  return rows.map(({ rowKey, ...row }) => ({
    ...row,
    deviationNumber: numbers.get(rowKey) ?? row.deviationNumber,
    key: rowKey.slice(row.inspectionId.length + 1),
    foundOn: swedishDay(row.createdAt),
  }));
}

/** "QC-2026-0004 · D-03": a deviation's ID across every inspection. */
export function deviationLogId(
  entry: Pick<DeviationLogEntry, 'inspectionNumber' | 'deviationNumber'>,
): string {
  return `${entry.inspectionNumber} · ${entry.deviationNumber}`;
}

/** "2.3 SMC filter cables", or an extra deviation's description. */
export function deviationDescription(
  entry: Pick<DeviationLogEntry, 'itemId' | 'displayRef' | 'checkpointText'>,
): string {
  return entry.itemId ? refWithText(entry.displayRef, entry.checkpointText) : entry.checkpointText;
}

/** An open deviation found longer ago than this is overdue: the log makes it stand out. */
export const OVERDUE_DAYS = 30;

/** Whole days from one calendar day to another ("2026-10-01" to "2026-10-31" is 30). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Open, and found more than OVERDUE_DAYS days before `today`. */
export function isOverdue(
  entry: Pick<DeviationLogEntry, 'status' | 'foundOn'>,
  today: string,
): boolean {
  return entry.status === 'open' && daysBetween(entry.foundOn, today) > OVERDUE_DAYS;
}

// ---------------------------------------------------------------------------------------------
// Filters: GET /api/deviations?kind&status&model&machine&resp&category&q (and …/export.csv), and
// the log page's address
// ---------------------------------------------------------------------------------------------

export const LOG_STATUSES = ['open', 'closed', 'all'] as const;
export type LogStatus = (typeof LOG_STATUSES)[number];

/**
 * The responsible or category filter's value for deviations without one ("Not assigned", "No
 * category"). The pick lists' entries are names, never a lone dash.
 */
export const NOT_SET = '-';

const DeviationLogParamsSchema = z.object({
  kind: InspectionKindSchema.optional(),
  /** Open (the default), closed or all. */
  status: z.enum(LOG_STATUSES).optional(),
  model: ModelCodeSchema.optional(),
  /** One machine (its id): the deviations of the inspections linked to it. */
  machine: IdSchema.optional(),
  resp: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(200).optional(),
  /** Words that must all appear in the deviation, its machine or its inspection. */
  q: z.string().max(200).optional(),
});

export type DeviationLogQuery = {
  /** Final inspections' deviations unless quality checks' are asked for: never both. */
  kind: InspectionKind;
  status: LogStatus;
  model?: string;
  /** A machine's id: the deviations of the inspections linked to it. */
  machine?: string;
  /** A responsible, or NOT_SET for deviations without one. Matched ignoring case. */
  resp?: string;
  /** A category, or NOT_SET. Matched ignoring case. */
  category?: string;
  q?: string;
};

const LOG_QUERY_KEYS = ['kind', 'status', 'model', 'machine', 'resp', 'category', 'q'] as const;

/** What the filters are read from: a URLSearchParams, in the browser or in the API. */
type QueryParams = { get(name: string): string | null };

/** Reads the filters from a query string; an empty value counts as not given. */
export function parseDeviationLogQuery(
  params: QueryParams,
): { success: true; data: DeviationLogQuery } | { success: false; error: z.ZodError } {
  const raw: Record<string, string> = {};
  for (const key of LOG_QUERY_KEYS) {
    const value = params.get(key);
    if (value) raw[key] = value;
  }
  const result = DeviationLogParamsSchema.safeParse(raw);
  if (!result.success) return { success: false, error: result.error };
  const { kind = 'final', status = 'open', q, ...rest } = result.data;
  const words = q?.trim();
  return {
    success: true,
    data: { kind, status, ...withoutEmpty(rest), ...(words && { q: words }) },
  };
}

/** The filters as query parameters: only those in use, so the address stays clean. */
export function deviationLogParams(
  query: DeviationLogQuery,
  { withKind = true }: { withKind?: boolean } = {},
): Record<string, string> {
  const params: Record<string, string> = {};
  if (withKind) params.kind = query.kind;
  if (query.status !== 'open') params.status = query.status;
  if (query.model) params.model = query.model;
  if (query.machine) params.machine = query.machine;
  if (query.resp) params.resp = query.resp;
  if (query.category) params.category = query.category;
  if (query.q?.trim()) params.q = query.q.trim();
  return params;
}

function withoutEmpty<T extends Record<string, string | undefined>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value)) as Partial<T>;
}

const folded = (text: string) => text.trim().toLocaleLowerCase('sv');

/** A list entry against the filter's value: NOT_SET for none, else ignoring case and spaces. */
function sameEntry(value: string, wanted: string): boolean {
  return wanted === NOT_SET ? !value.trim() : folded(value) === folded(wanted);
}

/** Everything a search looks through: the deviation, its follow-up, its machine and inspection. */
function haystack(entry: DeviationLogEntry): string {
  return folded(
    [
      deviationLogId(entry),
      entry.machineName,
      entry.serialNumber,
      entry.checkName,
      entry.sectionTitle,
      deviationDescription(entry),
      entry.comment,
      entry.action,
      entry.resp,
      entry.category,
      entry.closedBy,
    ].join('\n'),
  );
}

/**
 * Whether a deviation is in the log under these filters. The search is case-insensitive and
 * every word must appear: "magellan d-03", "qc-2026-0004 cables".
 */
export function matchesDeviationLog(entry: DeviationLogEntry, query: DeviationLogQuery): boolean {
  if (entry.kind !== query.kind) return false;
  if (query.status !== 'all' && entry.status !== query.status) return false;
  if (query.model && entry.modelCode !== query.model) return false;
  if (query.machine && entry.machineRef !== query.machine) return false;
  if (query.resp && !sameEntry(entry.resp, query.resp)) return false;
  if (query.category && !sameEntry(entry.category, query.category)) return false;
  const words = folded(query.q ?? '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const text = haystack(entry);
  return words.every((word) => text.includes(word));
}

/**
 * The log's order, as a log reads: oldest inspection first (by its date, then its number), each
 * inspection's deviations by number (D-01, D-02…).
 */
export function compareLogEntries(a: DeviationLogEntry, b: DeviationLogEntry): number {
  return (
    a.inspectionDate.localeCompare(b.inspectionDate) ||
    a.inspectionNumber.localeCompare(b.inspectionNumber, 'en', { numeric: true }) ||
    a.inspectionId.localeCompare(b.inspectionId) ||
    a.deviationNumber.localeCompare(b.deviationNumber, 'en', { numeric: true })
  );
}
