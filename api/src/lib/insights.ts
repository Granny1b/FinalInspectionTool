/**
 * Insights (brief §5.5): what the KPI dashboard and its CSV export read. Which inspections count
 * comes from the inspection list (one blob listing with metadata); their deviations come from the
 * deviations table, queried with the filters; where each checkpoint is now comes from the
 * templates' published revisions, which never change and are kept in memory once read. Final
 * inspections and quality checks are counted apart: the filters name one kind (final unless they
 * say quality), and only its inspections and rows count.
 */
import { odata } from '@azure/data-tables';
import type { InvocationContext } from '@azure/functions';
import {
  aggregateInsights,
  compareRefs,
  DeviationRowSchema,
  indexItems,
  inScope,
  type ChecklistLookup,
  type CurrentCheckpoint,
  type DeviationRow,
  type Insights,
  type InsightsQuery,
  type InspectionKind,
  type InspectionSummary,
  queryKind,
  qualityCheckShortName,
} from '@modig/shared';
import { toCsv } from './csv';
import { CSV_COLUMNS, TABLE_COLUMNS } from './deviations';
import { loadStartedSummaries } from './inspections';
import { loadMachines } from './machines';
import { deviationsTable, ensureTable } from './storage';
import { listRevisions, loadRevision } from './templates';

/** The dashboard's numbers for these filters. */
export async function loadInsights(
  query: InsightsQuery,
  context: InvocationContext,
): Promise<Insights> {
  const [inspections, { rows: deviations, unreadable }, machines] = await Promise.all([
    loadStartedSummaries(),
    loadDeviationRows(query, context),
    loadMachines().catch((error: unknown) => {
      context.warn('Insights could not read the machines', error);
      return [];
    }),
  ]);
  const scope = inspections.filter((inspection) => inScope(inspection, query));
  const checklists = await loadChecklists(scope, deviations, context);
  return aggregateInsights({
    query,
    inspections,
    machines: machines.map(({ id, machineName, modelCode }) => ({ id, machineName, modelCode })),
    deviations,
    checklists,
    unreadableRows: unreadable,
  });
}

/**
 * The deviation rows of the inspections that count under the filters (of the kind they name): the
 * CSV export. Oldest inspection first, each inspection's rows in checklist order, extra
 * deviations last.
 */
export async function loadExportRows(
  query: InsightsQuery,
  context: InvocationContext,
): Promise<DeviationRow[]> {
  const [inspections, { rows: deviations }] = await Promise.all([
    loadStartedSummaries(),
    loadDeviationRows(query, context),
  ]);
  const byId = new Map(
    inspections
      .filter((inspection) => inScope(inspection, query))
      .map((inspection) => [inspection.id, inspection]),
  );
  const kind = queryKind(query);
  return deviations
    .filter((row) => row.kind === kind && byId.has(row.inspectionId))
    .sort(
      (a, b) =>
        a.inspectionDate.localeCompare(b.inspectionDate) ||
        a.inspectionNumber.localeCompare(b.inspectionNumber, 'en', { numeric: true }) ||
        a.inspectionId.localeCompare(b.inspectionId) ||
        compareRefs(a.displayRef, b.displayRef) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

/**
 * The table's rows of the kind the filters name, under the filters. The model is the
 * PartitionKey, so a model filter reads one partition. A row that doesn't match the schema
 * (written by hand, say) is skipped, logged and counted, so the dashboard can say its numbers are
 * short: it must not take the whole dashboard down, nor go unnoticed. Quality checks' rows are
 * picked by the table; final inspections' here, since rows written before quality checks could
 * be done have no kind, and the table would leave them out of any condition on it.
 */
async function loadDeviationRows(
  query: InsightsQuery,
  context: InvocationContext,
): Promise<{ rows: DeviationRow[]; unreadable: number }> {
  await ensureTable();
  const kind = queryKind(query);
  const conditions: string[] = [];
  if (kind === 'quality') conditions.push(odata`kind eq ${kind}`);
  if (query.model) conditions.push(odata`PartitionKey eq ${query.model}`);
  if (query.from) conditions.push(odata`inspectionDate ge ${query.from}`);
  if (query.to) conditions.push(odata`inspectionDate le ${query.to}`);
  if (!query.includeInProgress) conditions.push(odata`finalised eq ${true}`);

  const rows: DeviationRow[] = [];
  let unreadable = 0;
  let firstProblem = '';
  const entities = deviationsTable().listEntities<Record<string, unknown>>({
    queryOptions: {
      filter: conditions.length > 0 ? conditions.join(' and ') : undefined,
      select: [...TABLE_COLUMNS],
    },
  });
  for await (const entity of entities) {
    const row = DeviationRowSchema.safeParse(withoutNulls(entity));
    if (row.success) {
      if (row.data.kind === kind) rows.push(row.data);
    } else {
      unreadable += 1;
      firstProblem ||= row.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
    }
  }
  if (unreadable > 0) {
    context.warn(
      `Insights skipped ${unreadable} unreadable deviation rows; the first: ${firstProblem}`,
    );
  }
  return { rows, unreadable };
}

/**
 * The entity without its null properties. Azure's Table service returns a property named in
 * $select that a row doesn't have as null (Azurite leaves it out): a row written before a column
 * existed, such as `category`, would otherwise fail the schema and be dropped, where the
 * schema's default is meant to fill it in. A required column that is missing still fails.
 */
function withoutNulls(entity: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entity).filter(([, value]) => value !== null));
}

// ---------------------------------------------------------------------------------------------
// Published revisions
// ---------------------------------------------------------------------------------------------

type RevisionIndex = {
  itemIds: ReadonlySet<string>;
  checkpoints: ReadonlyMap<string, CurrentCheckpoint>;
};

/**
 * Revisions read so far, by `{templateId}/{revision}`. They never change, so they are kept for
 * the life of the Functions instance; a few kilobytes each, and a template has a handful.
 */
const revisionCache = new Map<string, Promise<RevisionIndex | null>>();

const revisionKey = (templateId: string, revision: number) => `${templateId}/${revision}`;

function readRevision(templateId: string, revision: number): Promise<RevisionIndex | null> {
  const key = revisionKey(templateId, revision);
  let pending = revisionCache.get(key);
  if (!pending) {
    pending = loadRevision(templateId, revision).then((template) => {
      if (!template) {
        revisionCache.delete(key); // not there (yet): ask storage again next time
        return null;
      }
      const items = indexItems(template.sections);
      return {
        itemIds: new Set(items.map((item) => item.itemId)),
        checkpoints: new Map(
          items.map(({ itemId, ref, text, sectionTitle }) => [itemId, { ref, text, sectionTitle }]),
        ),
      };
    });
    pending.catch(() => revisionCache.delete(key));
    revisionCache.set(key, pending);
  }
  return pending;
}

/** Forgets every revision read so far (tests). */
export function clearRevisionCache(): void {
  revisionCache.clear();
}

/**
 * The revisions the aggregation asks about: those the inspections in scope were made from (which
 * rows their checklists had), and the latest published revision of each template a deviation
 * comes from (where its checkpoint is now). One that can't be read is logged and left out: the
 * aggregation then falls back on what the deviation rows say.
 */
async function loadChecklists(
  scope: readonly InspectionSummary[],
  deviations: readonly DeviationRow[],
  context: InvocationContext,
): Promise<ChecklistLookup> {
  const latestByTemplate = new Map<string, number>();
  const published = await listRevisions();
  for (const templateId of new Set(deviations.map((row) => row.templateId))) {
    const latest = published.get(templateId)?.at(-1);
    if (latest !== undefined) latestByTemplate.set(templateId, latest);
  }

  const wanted = new Map<string, [templateId: string, revision: number]>();
  for (const { templateId, templateRevision } of scope) {
    wanted.set(revisionKey(templateId, templateRevision), [templateId, templateRevision]);
  }
  for (const [templateId, revision] of latestByTemplate) {
    wanted.set(revisionKey(templateId, revision), [templateId, revision]);
  }

  const loaded = new Map<string, RevisionIndex>();
  await Promise.all(
    [...wanted].map(async ([key, [templateId, revision]]) => {
      try {
        const index = await readRevision(templateId, revision);
        if (index) loaded.set(key, index);
        else context.warn(`Insights: template revision ${key} does not exist`);
      } catch (error) {
        context.warn(`Insights: template revision ${key} could not be read`, error);
      }
    }),
  );

  return {
    itemIds: (templateId, revision) => loaded.get(revisionKey(templateId, revision))?.itemIds,
    current: (templateId, itemId) => {
      const latest = latestByTemplate.get(templateId);
      if (latest === undefined) return undefined;
      return loaded.get(revisionKey(templateId, latest))?.checkpoints.get(itemId);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// CSV (brief §5.5: "so I can take it into Excel/Power BI")
// ---------------------------------------------------------------------------------------------

/**
 * The rows as a CSV file (lib/csv.ts): the table's columns, in the brief's order; a quality
 * check's also has the check's title after the machine's ID (CSV_COLUMNS).
 */
export function deviationsCsv(
  rows: readonly DeviationRow[],
  kind: InspectionKind = 'final',
): string {
  const columns = CSV_COLUMNS[kind];
  return toCsv(
    columns,
    rows.map((row) => columns.map((column) => row[column])),
  );
}

/**
 * "Deviations 2026-01-01 to 2026-10-31, RMMG.csv": the filters, so two exports stay apart. Quality
 * checks' say so, and which one: "Quality check deviations 2026-01-01 to 2026-10-31, RMMG, Pre
 * start up.csv".
 */
export function csvFileName(query: InsightsQuery, today: string, machineName?: string): string {
  const quality = queryKind(query) === 'quality';
  const range = `${query.from ?? 'start'} to ${query.to ?? today}`;
  const parts = [
    query.model,
    // The machine's ID, without what a file name can't hold.
    machineName?.replace(/[\\/:*?"<>|]+/g, '-'),
    quality && query.check ? qualityCheckShortName(query.check) : undefined,
    query.includeInProgress ? 'incl. in progress' : undefined,
  ];
  const suffix = parts.filter(Boolean).join(', ');
  return `${quality ? 'Quality check deviations' : 'Deviations'} ${range}${suffix ? `, ${suffix}` : ''}.csv`;
}
