/**
 * Insights (brief §5.5): what the KPI dashboard and its CSV export read. Which inspections count
 * comes from the inspection list (one blob listing with metadata); their deviations come from the
 * deviations table, queried with the filters; where each checkpoint is now comes from the
 * templates' published revisions, which never change and are kept in memory once read.
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
  type InspectionSummary,
} from '@modig/shared';
import { DEVIATION_COLUMNS } from './deviations';
import { loadSummaries } from './inspections';
import { deviationsTable, ensureTable } from './storage';
import { listRevisions, loadRevision } from './templates';

/** The dashboard's numbers for these filters. */
export async function loadInsights(
  query: InsightsQuery,
  context: InvocationContext,
): Promise<Insights> {
  const [inspections, { rows: deviations, unreadable }] = await Promise.all([
    loadSummaries(),
    loadDeviationRows(query, context),
  ]);
  const scope = inspections.filter((inspection) => inScope(inspection, query));
  const checklists = await loadChecklists(scope, deviations, context);
  return aggregateInsights({
    query,
    inspections,
    deviations,
    checklists,
    unreadableRows: unreadable,
  });
}

/**
 * The deviation rows of the inspections that count under the filters: the CSV export. Oldest
 * inspection first, each inspection's rows in checklist order, extra deviations last.
 */
export async function loadExportRows(
  query: InsightsQuery,
  context: InvocationContext,
): Promise<DeviationRow[]> {
  const [inspections, { rows: deviations }] = await Promise.all([
    loadSummaries(),
    loadDeviationRows(query, context),
  ]);
  const byId = new Map(
    inspections
      .filter((inspection) => inScope(inspection, query))
      .map((inspection) => [inspection.id, inspection]),
  );
  return deviations
    .filter((row) => byId.has(row.inspectionId))
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
 * The table's rows under the filters. The model is the PartitionKey, so a model filter reads one
 * partition. A row that doesn't match the schema (written by hand, say) is skipped, logged and
 * counted, so the dashboard can say its numbers are short: it must not take the whole dashboard
 * down, nor go unnoticed.
 */
async function loadDeviationRows(
  query: InsightsQuery,
  context: InvocationContext,
): Promise<{ rows: DeviationRow[]; unreadable: number }> {
  await ensureTable();
  const conditions: string[] = [];
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
      select: [...DEVIATION_COLUMNS],
    },
  });
  for await (const entity of entities) {
    const row = DeviationRowSchema.safeParse(withoutNulls(entity));
    if (row.success) {
      rows.push(row.data);
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
 * Semicolons, because Excel with Swedish regional settings expects them when it opens a CSV
 * (Power BI detects either); a UTF-8 byte order mark, so Excel reads å, ä and ö; CRLF line ends.
 * The columns are the table's, in the brief's order.
 */
const SEPARATOR = ';';
const BOM = '\uFEFF';

export function deviationsCsv(rows: readonly DeviationRow[]): string {
  const lines = [
    DEVIATION_COLUMNS.join(SEPARATOR),
    ...rows.map((row) => DEVIATION_COLUMNS.map((column) => csvField(row[column])).join(SEPARATOR)),
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

function csvField(value: string | number | boolean): string {
  let text = String(value);
  // A cell starting like a formula would run as one in Excel: keep it text (OWASP's advice).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** "Deviations 2026-01-01 to 2026-10-31, RMMG.csv": the filters, so two exports stay apart. */
export function csvFileName(query: InsightsQuery, today: string): string {
  const range = `${query.from ?? 'start'} to ${query.to ?? today}`;
  const parts = [query.model, query.includeInProgress ? 'incl. in progress' : undefined];
  const suffix = parts.filter(Boolean).join(', ');
  return `Deviations ${range}${suffix ? `, ${suffix}` : ''}.csv`;
}
