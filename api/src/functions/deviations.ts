/**
 * The deviation log (shared/src/deviationLog.ts): every deviation of the final inspections, or of
 * the quality checks, with its follow-up, for everyone who works with them; and the same as a CSV
 * file. One kind at a time, never both.
 *
 *   GET /api/deviations?kind&status&model&machine&resp&category&q             inspector  DeviationLog
 *   GET /api/deviations/export.csv?kind&status&model&machine&resp&category&q  inspector  text/csv
 *
 * Without `kind` they are final inspections'; without `status`, the open ones (as the page).
 */
import { app, type HttpRequest } from '@azure/functions';
import { parseDeviationLogQuery, swedishDay, type DeviationLogQuery } from '@modig/shared';
import { csvResponse } from '../lib/csv';
import { deviationLogCsv, deviationLogFileName, loadDeviationLog } from '../lib/deviationLog';
import { BadRequestError, endpoint, json } from '../lib/http';
import { loadSettings } from '../lib/settings';

function readQuery(req: HttpRequest): DeviationLogQuery {
  const result = parseDeviationLogQuery(req.query);
  if (!result.success) {
    throw new BadRequestError('The filters in the URL are not valid.', result.error.issues);
  }
  return result.data;
}

export const getDeviationLog = endpoint({ role: 'inspector' }, async (req, context) =>
  json(200, await loadDeviationLog(readQuery(req), context)),
);

export const exportDeviationLogCsv = endpoint({ role: 'inspector' }, async (req, context) => {
  const query = readQuery(req);
  const [{ entries, machines }, settings] = await Promise.all([
    loadDeviationLog(query, context),
    loadSettings(),
  ]);
  const machineName = machines.find((machine) => machine.id === query.machine)?.machineName;
  return csvResponse(
    deviationLogCsv(entries, query.kind, settings?.machineModels ?? []),
    deviationLogFileName(query, swedishDay(new Date()), machineName),
  );
});

app.http('deviations', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'deviations',
  handler: getDeviationLog,
});

app.http('deviationsExport', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'deviations/export.csv',
  handler: exportDeviationLogCsv,
});
