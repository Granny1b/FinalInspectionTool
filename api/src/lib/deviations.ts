/**
 * The deviations table (brief §4), the KPI source: one row per deviation of every inspection,
 * final inspections and quality checks alike, denormalised so KPI queries need no joins. Each
 * row says which kind it is (`kind`; rows written before quality checks could be done have none
 * and are final), so Insights counts the two apart. Each row also carries the deviation's number
 * (D-03) and its follow-up (open or closed, the action, when and by whom) for the deviation log.
 * An inspection's rows are rewritten from its blob and its follow-ups' blob on every write
 * (`syncDeviations`), so the table always converges to what those two say.
 *
 * PartitionKey = model code, RowKey = `{inspectionId}_{itemId or extraId}`.
 */
import { odata, type TableEntity, type TransactionAction } from '@azure/data-tables';
import {
  deriveDeviations,
  deviationKeys,
  type DeviationLogRow,
  type DeviationRow,
  type FollowUps,
  type Inspection,
  type InspectionKind,
} from '@modig/shared';
import { loadFollowUps } from './followUps';
import { deviationsTable, ensureTable } from './storage';

type DeviationEntity = TableEntity<DeviationLogRow>;

/** The service's limit on operations in one transactional batch. */
const BATCH_SIZE = 100;

/**
 * The brief's columns, in its order, plus `category` after `severity`: a final inspection's CSV
 * export, exactly as before quality checks.
 */
export const DEVIATION_COLUMNS = [
  'inspectionId',
  'inspectionNumber',
  'serialNumber',
  'machineName',
  'modelCode',
  'templateId',
  'templateRevision',
  'itemId',
  'sectionTitle',
  'displayRef',
  'checkpointText',
  'comment',
  'resp',
  'severity',
  'category',
  'inspectionDate',
  'finalised',
  'createdAt',
] as const satisfies readonly (keyof DeviationRow)[];

/**
 * A quality check's CSV export: the same columns, and the quality check's title after the
 * machine's ID, since a machine has several quality checks.
 */
export const QUALITY_DEVIATION_COLUMNS = DEVIATION_COLUMNS.flatMap((column) =>
  column === 'machineName' ? [column, 'checkName' as const] : [column],
) satisfies readonly (keyof DeviationRow)[];

/** The CSV's columns for each kind. */
export const CSV_COLUMNS: Record<InspectionKind, readonly (keyof DeviationRow)[]> = {
  final: DEVIATION_COLUMNS,
  quality: QUALITY_DEVIATION_COLUMNS,
};

/**
 * What Insights reads: the brief's columns, then which kind of inspection it is from and the name
 * of its checklist (a quality check's title), which came later.
 */
export const TABLE_COLUMNS = [
  ...DEVIATION_COLUMNS,
  'kind',
  'checkName',
] as const satisfies readonly (keyof DeviationRow)[];

/** Every property a row has: Insights' columns, then the deviation log's. */
export const LOG_COLUMNS = [
  ...TABLE_COLUMNS,
  'deviationNumber',
  'status',
  'action',
  'closedOn',
  'closedBy',
] as const satisfies readonly (keyof DeviationLogRow)[];

/**
 * Makes the table hold exactly this inspection's current deviations, each with its follow-up as
 * the follow-ups' blob has it now: new and changed rows are replaced, rows that no longer exist
 * are deleted, unchanged rows are left alone. Idempotent, so a failed sync is repaired by simply
 * syncing again. Returns the version of the follow-ups it used (null: there were none), so the
 * caller can tell whether a follow-up changed meanwhile (`syncSettled`).
 */
export async function syncDeviations(inspection: Inspection): Promise<string | null> {
  await ensureTable();
  const partitionKey = inspection.front.modelCode;
  const [existing, followUps] = await Promise.all([
    loadRows(partitionKey, inspection.id),
    loadFollowUps(inspection.id),
  ]);
  const wanted = deviationEntities(inspection, followUps?.data, existing, new Date().toISOString());

  const actions: TransactionAction[] = [];
  for (const entity of wanted) {
    const current = existing.get(entity.rowKey);
    if (!current || LOG_COLUMNS.some((column) => current[column] !== entity[column])) {
      actions.push(['upsert', entity, 'Replace']);
    }
  }
  const wantedKeys = new Set(wanted.map((entity) => entity.rowKey));
  for (const rowKey of existing.keys()) {
    if (!wantedKeys.has(rowKey)) actions.push(['delete', { partitionKey, rowKey }]);
  }
  await submitInBatches(actions);
  return followUps?.etag ?? null;
}

/**
 * Deletes every row of an inspection (an admin deleted it). Its rows are all in its model's
 * partition: an inspection's model never changes. Idempotent, like the sync: a failed delete is
 * finished by simply deleting again, and a row left behind meanwhile never counts in Insights,
 * which only counts rows of inspections that still exist.
 */
export async function deleteDeviationRows(
  partitionKey: string,
  inspectionId: string,
): Promise<void> {
  await ensureTable();
  const existing = await loadRows(partitionKey, inspectionId);
  await submitInBatches(
    [...existing.keys()].map((rowKey): TransactionAction => ['delete', { partitionKey, rowKey }]),
  );
}

/** One partition's actions; each chunk is atomic, and chunks after a failed one are not sent. */
async function submitInBatches(actions: readonly TransactionAction[]): Promise<void> {
  for (let start = 0; start < actions.length; start += BATCH_SIZE) {
    await deviationsTable().submitTransaction(actions.slice(start, start + BATCH_SIZE));
  }
}

/**
 * The rows the table should hold for `inspection`, with their follow-ups; `existing` supplies
 * their createdAt.
 */
function deviationEntities(
  inspection: Inspection,
  followUps: FollowUps | undefined,
  existing: ReadonlyMap<string, Partial<DeviationLogRow>>,
  now: string,
): DeviationEntity[] {
  const { id, kind, number, front, templateId, templateRevision, state } = inspection;
  return deriveDeviations(inspection).map((deviation) => {
    const keys = deviationKeys(front.modelCode, id, deviation.key);
    const createdAt = existing.get(keys.rowKey)?.createdAt;
    const followUp = followUps?.followUps[deviation.key];
    return {
      ...keys,
      kind,
      inspectionId: id,
      inspectionNumber: number,
      serialNumber: front.serialNumber,
      machineName: front.machineName,
      modelCode: front.modelCode,
      templateId,
      templateRevision,
      itemId: deviation.itemId ?? '',
      sectionTitle: deviation.sectionTitle,
      displayRef: deviation.ref,
      checkpointText: deviation.text,
      comment: deviation.comment,
      resp: deviation.resp,
      severity: deviation.severity,
      category: deviation.category,
      inspectionDate: front.date,
      finalised: state === 'finalised',
      // When the deviation was first recorded; KPIs over time must not move on every save.
      createdAt: typeof createdAt === 'string' ? createdAt : now,
      checkName: inspection.templateSnapshot.name,
      deviationNumber: deviation.number,
      // A deviation without a follow-up is open.
      status: followUp?.status ?? 'open',
      action: followUp?.action ?? '',
      closedOn: followUp?.closedOn ?? '',
      closedBy: followUp?.closedBy ?? '',
    };
  });
}

/** An inspection's rows by RowKey: one range query within its model's partition. */
async function loadRows(
  partitionKey: string,
  inspectionId: string,
): Promise<Map<string, Partial<DeviationLogRow>>> {
  const prefix = `${inspectionId}_`;
  // '`' is the character after '_', so this range is exactly the RowKeys starting with prefix.
  const end = `${inspectionId}\``;
  const rows = new Map<string, Partial<DeviationLogRow>>();
  const entities = deviationsTable().listEntities<Partial<DeviationLogRow>>({
    queryOptions: {
      filter: odata`PartitionKey eq ${partitionKey} and RowKey ge ${prefix} and RowKey lt ${end}`,
    },
  });
  for await (const entity of entities) {
    if (entity.rowKey) rows.set(entity.rowKey, entity);
  }
  return rows;
}
