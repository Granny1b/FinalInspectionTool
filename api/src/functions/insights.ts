/**
 * Insights (brief §5.5, §8): the KPI dashboard's numbers and the deviation rows behind them, as a
 * CSV export and as JSON for the printed report, for admins.
 *
 *   GET /api/insights?from&to&model&includeInProgress             admin  Insights
 *   GET /api/insights/export.csv?from&to&model&includeInProgress  admin  text/csv attachment
 *   GET /api/insights/deviations?from&to&model&includeInProgress  admin  InsightsDeviations
 */
import { app, type HttpRequest } from '@azure/functions';
import { parseInsightsQuery, type InsightsDeviations, type InsightsQuery } from '@modig/shared';
import { BadRequestError, endpoint, json } from '../lib/http';
import { csvFileName, deviationsCsv, loadExportRows, loadInsights } from '../lib/insights';

function readQuery(req: HttpRequest): InsightsQuery {
  const result = parseInsightsQuery(req.query);
  if (!result.success) {
    throw new BadRequestError('The filters in the URL are not valid.', result.error.issues);
  }
  return result.data;
}

export const getInsights = endpoint({ role: 'admin' }, async (req, context) =>
  json(200, await loadInsights(readQuery(req), context)),
);

/** Today in Sweden, "2026-11-03" (the open end of a range in the file name). */
const swedishDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' });

export const exportInsightsCsv = endpoint({ role: 'admin' }, async (req, context) => {
  const query = readQuery(req);
  const rows = await loadExportRows(query, context);
  const fileName = csvFileName(query, swedishDate.format(new Date()));
  return {
    status: 200,
    body: deviationsCsv(rows),
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      // The name is ASCII (dates, a model code), so the plain quoted form is enough.
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  };
});

/**
 * The CSV's rows as JSON, for the printed report's deviation list: the same filters, the same
 * rows in the same order, so the report and an export made with it agree.
 */
export const getInsightsDeviations = endpoint({ role: 'admin' }, async (req, context) => {
  const body: InsightsDeviations = { rows: await loadExportRows(readQuery(req), context) };
  return json(200, body);
});

app.http('insights', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'insights',
  handler: getInsights,
});

app.http('insightsExport', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'insights/export.csv',
  handler: exportInsightsCsv,
});

app.http('insightsDeviations', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'insights/deviations',
  handler: getInsightsDeviations,
});
