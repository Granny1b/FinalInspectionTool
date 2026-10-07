/**
 * The deviations table (brief §4), the KPI source: one row per deviation of every inspection,
 * denormalised so KPI queries need no joins. An inspection's rows are rewritten from its blob on
 * every write (`syncDeviations`), so the table always converges to `deriveDeviations(blob)`.
 *
 * PartitionKey = model code, RowKey = `{inspectionId}_{itemId or extraId}`.
 */
import { odata, type TableEntity, type TransactionAction } from '@azure/data-tables';
import { deriveDeviations, deviationKeys, type DeviationRow, type Inspection } from '@modig/shared';
import { deviationsTable, ensureTable } from './storage';

type DeviationEntity = TableEntity<DeviationRow>;

/** The service's limit on operations in one transactional batch. */
const BATCH_SIZE = 100;

/** The brief's columns, in its order: the only properties a row has. */
const COLUMNS = [
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
  'inspectionDate',
  'finalised',
  'createdAt',
] as const satisfies readonly (keyof DeviationRow)[];

/**
 * Makes the table hold exactly this inspection's current deviations: new and changed rows are
 * replaced, rows that no longer exist are deleted, unchanged rows are left alone. Idempotent, so
 * a failed sync is repaired by simply syncing again.
 */
export async function syncDeviations(inspection: Inspection): Promise<void> {
  await ensureTable();
  const partitionKey = inspection.front.modelCode;
  const existing = await loadRows(partitionKey, inspection.id);
  const wanted = deviationEntities(inspection, existing, new Date().toISOString());

  const actions: TransactionAction[] = [];
  for (const entity of wanted) {
    const current = existing.get(entity.rowKey);
    if (!current || COLUMNS.some((column) => current[column] !== entity[column])) {
      actions.push(['upsert', entity, 'Replace']);
    }
  }
  const wantedKeys = new Set(wanted.map((entity) => entity.rowKey));
  for (const rowKey of existing.keys()) {
    if (!wantedKeys.has(rowKey)) actions.push(['delete', { partitionKey, rowKey }]);
  }

  // One partition, so each chunk is atomic; chunks after a failed one are simply not sent.
  for (let start = 0; start < actions.length; start += BATCH_SIZE) {
    await deviationsTable().submitTransaction(actions.slice(start, start + BATCH_SIZE));
  }
}

/** The rows the table should hold for `inspection`; `existing` supplies their createdAt. */
function deviationEntities(
  inspection: Inspection,
  existing: ReadonlyMap<string, Partial<DeviationRow>>,
  now: string,
): DeviationEntity[] {
  const { id, number, front, templateId, templateRevision, state } = inspection;
  return deriveDeviations(inspection).map((deviation) => {
    const keys = deviationKeys(front.modelCode, id, deviation.key);
    const createdAt = existing.get(keys.rowKey)?.createdAt;
    return {
      ...keys,
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
      inspectionDate: front.date,
      finalised: state === 'finalised',
      // When the deviation was first recorded; KPIs over time must not move on every save.
      createdAt: typeof createdAt === 'string' ? createdAt : now,
    };
  });
}

/** An inspection's rows by RowKey: one range query within its model's partition. */
async function loadRows(
  partitionKey: string,
  inspectionId: string,
): Promise<Map<string, Partial<DeviationRow>>> {
  const prefix = `${inspectionId}_`;
  // '`' is the character after '_', so this range is exactly the RowKeys starting with prefix.
  const end = `${inspectionId}\``;
  const rows = new Map<string, Partial<DeviationRow>>();
  const entities = deviationsTable().listEntities<Partial<DeviationRow>>({
    queryOptions: {
      filter: odata`PartitionKey eq ${partitionKey} and RowKey ge ${prefix} and RowKey lt ${end}`,
    },
  });
  for await (const entity of entities) {
    if (entity.rowKey) rows.set(entity.rowKey, entity);
  }
  return rows;
}

/** Most suggestions the list returns; plenty for an autocomplete. */
const MAX_SUGGESTIONS = 500;

const bySwedishName = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/**
 * Every responsible person/department used so far (brief §4: "free text with autocomplete from
 * history"), trimmed and sorted. Spellings that differ only in case are one name, offered in the
 * spelling most deviations use (the first one found on a tie), which nudges people towards it.
 */
export async function loadRespSuggestions(): Promise<string[]> {
  await ensureTable();
  const uses = new Map<string, number>();
  const entities = deviationsTable().listEntities<{ resp?: unknown }>({
    queryOptions: { filter: odata`resp ne ${''}`, select: ['resp'] },
  });
  for await (const { resp } of entities) {
    const value = typeof resp === 'string' ? resp.trim() : '';
    if (value) uses.set(value, (uses.get(value) ?? 0) + 1);
  }
  const byName = new Map<string, string>();
  for (const [value, count] of uses) {
    const name = value.toLowerCase();
    const best = byName.get(name);
    if (best === undefined || count > (uses.get(best) ?? 0)) byName.set(name, value);
  }
  return [...byName.values()].sort(bySwedishName.compare).slice(0, MAX_SUGGESTIONS);
}
