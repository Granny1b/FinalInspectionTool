/**
 * The deviation log (shared/src/deviationLog.ts): every deviation of one kind with its follow-up,
 * from the deviations table, which carries both, and the inspection list, which says which
 * inspections still exist. One table query and one blob listing.
 */
import { odata } from '@azure/data-tables';
import type { InvocationContext } from '@azure/functions';
import {
  compareLogEntries,
  deviationDescription,
  deviationLogId,
  DeviationLogRowSchema,
  FOLLOW_UP_STATUS_LABELS,
  logEntries,
  matchesDeviationLog,
  NOT_SET,
  SEVERITY_LABELS,
  type DeviationLog,
  type DeviationLogEntry,
  type DeviationLogQuery,
  type DeviationLogRow,
  type InspectionKind,
  type LogMachine,
  type MachineModel,
} from '@modig/shared';
import { toCsv } from './csv';
import { LOG_COLUMNS } from './deviations';
import { loadStartedSummaries } from './inspections';
import { loadMachines } from './machines';
import { deviationsTable, ensureTable } from './storage';

/**
 * The deviations under the filters, oldest inspection first, each inspection's by number. Only
 * those of inspections that still exist: a delete removes its rows after the inspection, and a
 * row left behind must never show up. A row that can't be read (edited by hand, say) is left out,
 * logged and counted, as in Insights. Each entry names the machine its inspection is linked to,
 * if any, and the answer has those machines as they are now.
 */
export async function loadDeviationLog(
  query: DeviationLogQuery,
  context: InvocationContext,
): Promise<DeviationLog> {
  const [summaries, { rows, unreadable }, machines] = await Promise.all([
    loadStartedSummaries(),
    loadLogRows(query.kind, query.model),
    loadMachines().catch((error: unknown) => {
      context.warn('The deviation log could not read the machines', error);
      return [];
    }),
  ]);
  if (unreadable.count > 0) {
    context.warn(
      `The deviation log skipped ${unreadable.count} unreadable deviation rows; the first: ${unreadable.first}`,
    );
  }
  const machineOf = new Map(summaries.map((summary) => [summary.id, summary.machineRef]));
  const entries = logEntries(rows.filter((row) => machineOf.has(row.inspectionId)))
    .map((entry) => {
      const machineRef = machineOf.get(entry.inspectionId);
      return machineRef ? { ...entry, machineRef } : entry;
    })
    .filter((entry) => matchesDeviationLog(entry, query))
    .sort(compareLogEntries);
  const linked = new Set(entries.map((entry) => entry.machineRef));
  const logMachines: LogMachine[] = machines
    .filter((machine) => linked.has(machine.id))
    .map(({ id, machineName, serialNumber, modelCode }) => ({
      id,
      machineName,
      serialNumber,
      modelCode,
    }));
  return { entries, machines: logMachines, unreadableRows: unreadable.count };
}

/**
 * The table's rows of one kind (and model: the PartitionKey). Quality checks' rows are picked by
 * the table; final inspections' here, since rows written before quality checks could be done have
 * no kind and the table leaves a row without the property out of any condition on it. The rest of
 * the filters are applied by the caller, as the page applies them (matchesDeviationLog).
 */
async function loadLogRows(
  kind: InspectionKind,
  model: string | undefined,
): Promise<{
  rows: (DeviationLogRow & { rowKey: string })[];
  unreadable: { count: number; first: string };
}> {
  await ensureTable();
  const conditions: string[] = [];
  if (kind === 'quality') conditions.push(odata`kind eq ${kind}`);
  if (model) conditions.push(odata`PartitionKey eq ${model}`);
  const rows: (DeviationLogRow & { rowKey: string })[] = [];
  const unreadable = { count: 0, first: '' };
  const entities = deviationsTable().listEntities<Record<string, unknown>>({
    queryOptions: {
      filter: conditions.length > 0 ? conditions.join(' and ') : undefined,
      select: ['RowKey', ...LOG_COLUMNS],
    },
  });
  for await (const entity of entities) {
    const row = DeviationLogRowSchema.safeParse(withoutNulls(entity));
    if (row.success && typeof entity.rowKey === 'string') {
      if (row.data.kind === kind) rows.push({ ...row.data, rowKey: entity.rowKey });
    } else {
      unreadable.count += 1;
      unreadable.first ||= row.success
        ? 'no RowKey'
        : row.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    }
  }
  return { rows, unreadable };
}

/**
 * The entity without its null properties: Azure's Table service returns a property named in
 * $select that a row doesn't have as null (Azurite leaves it out), and a row written before the
 * log existed must get the schema's defaults (open, no action) rather than fail it.
 */
function withoutNulls(entity: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entity).filter(([, value]) => value !== null));
}

// ---------------------------------------------------------------------------------------------
// CSV, with the columns of the Excel log it replaces
// ---------------------------------------------------------------------------------------------

type Column = { header: string; value: (entry: DeviationLogEntry) => string };

const MACHINE: Column[] = [
  { header: 'Machine ID', value: (entry) => entry.machineName },
  { header: 'Serial number', value: (entry) => entry.serialNumber },
];

const DEVIATION: Column[] = [
  { header: 'Deviation ID', value: deviationLogId },
  { header: 'Description', value: deviationDescription },
  { header: 'Comment', value: (entry) => entry.comment },
  { header: 'Action', value: (entry) => entry.action },
  { header: 'Category', value: (entry) => entry.category },
  { header: 'Severity', value: (entry) => SEVERITY_LABELS[entry.severity] },
  { header: 'Responsible', value: (entry) => entry.resp },
  { header: 'Status', value: (entry) => FOLLOW_UP_STATUS_LABELS[entry.status] },
  { header: 'Found', value: (entry) => entry.foundOn },
  { header: 'Closed', value: (entry) => entry.closedOn },
  { header: 'Closed by', value: (entry) => entry.closedBy },
];

/**
 * One line per deviation: the machine (with a quality check's title after it: a machine has
 * several), the model by name, the inspection's number and date, then the deviation and its
 * follow-up.
 */
export function deviationLogCsv(
  entries: readonly DeviationLogEntry[],
  kind: InspectionKind,
  models: readonly MachineModel[],
): string {
  const modelName = (code: string) => models.find((model) => model.code === code)?.name ?? code;
  const columns: Column[] = [
    ...MACHINE,
    ...(kind === 'quality'
      ? [{ header: 'Quality check', value: (entry: DeviationLogEntry) => entry.checkName }]
      : []),
    { header: 'Model', value: (entry) => modelName(entry.modelCode) },
    {
      header: kind === 'quality' ? 'Quality check no.' : 'Inspection',
      value: (entry) => entry.inspectionNumber,
    },
    { header: 'Date', value: (entry) => entry.inspectionDate },
    ...DEVIATION,
  ];
  return toCsv(
    columns.map((column) => column.header),
    entries.map((entry) => columns.map((column) => column.value(entry))),
  );
}

/**
 * "Quality check deviations 2026-11-06, open, RMMG.csv": the kind, the day and the filters, so
 * two exports stay apart.
 */
export function deviationLogFileName(query: DeviationLogQuery, today: string): string {
  const what =
    query.kind === 'quality' ? 'Quality check deviations' : 'Final inspection deviations';
  const parts = [
    query.status === 'all' ? 'open and closed' : query.status,
    query.model,
    query.resp && `responsible ${query.resp === NOT_SET ? 'not assigned' : query.resp}`,
    query.category && `category ${query.category === NOT_SET ? 'none' : query.category}`,
    query.q && 'searched',
  ];
  return `${what} ${today}, ${parts.filter(Boolean).join(', ')}.csv`;
}
