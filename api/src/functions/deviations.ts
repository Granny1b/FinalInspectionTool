/**
 * The deviation log (shared/src/deviationLog.ts): every deviation of the final inspections, or of
 * the quality checks, with its follow-up, for everyone who works with them; and the same as a CSV
 * file. One kind at a time, never both.
 *
 *   GET /api/deviations?kind&status&model&machine&resp&category&q             inspector  DeviationLog
 *   GET /api/deviations/export.csv?kind&status&model&machine&resp&category&q  inspector  text/csv
 *   GET /api/deviations/photos?kind&status&model&machine&resp&category&q      inspector
 *                                                                              DeviationPhotos
 *
 * Without `kind` they are final inspections'; without `status`, the open ones (as the page).
 */
import { app, type HttpRequest } from '@azure/functions';
import {
  deriveDeviations,
  parseDeviationLogQuery,
  swedishDay,
  type DeviationLogQuery,
  type DeviationPhotos,
} from '@modig/shared';
import { csvResponse } from '../lib/csv';
import { deviationLogCsv, deviationLogFileName, loadDeviationLog } from '../lib/deviationLog';
import { loadInspection } from '../lib/inspections';
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

/** Inspections read at once for the photos: enough to be quick, few enough for storage. */
const PHOTO_READS = 8;

/**
 * The photos of the deviations under the filters (the printed log with its pictures). The table
 * has no photos, so each inspection with a deviation under the filters is read, a few at a time,
 * and its deviations' photos are taken as its Deviations tab shows them. An inspection gone
 * meanwhile, or one that can't be read, gives none.
 */
export const getDeviationPhotos = endpoint({ role: 'inspector' }, async (req, context) => {
  const { entries } = await loadDeviationLog(readQuery(req), context);
  const keys = new Map<string, Set<string>>();
  for (const entry of entries) {
    keys.set(entry.inspectionId, (keys.get(entry.inspectionId) ?? new Set()).add(entry.key));
  }
  const ids = [...keys.keys()];
  const photos: DeviationPhotos['photos'] = [];
  for (let start = 0; start < ids.length; start += PHOTO_READS) {
    const batch = ids.slice(start, start + PHOTO_READS);
    const loaded = await Promise.all(
      batch.map((id) =>
        loadInspection(id).catch((error: unknown) => {
          context.warn(`The deviation photos could not read inspection ${id}`, error);
          return null;
        }),
      ),
    );
    for (const stored of loaded) {
      if (!stored) continue;
      const wanted = keys.get(stored.data.id);
      for (const deviation of deriveDeviations(stored.data)) {
        if (wanted?.has(deviation.key) && deviation.photos.length > 0) {
          photos.push({
            inspectionId: stored.data.id,
            key: deviation.key,
            photos: deviation.photos,
          });
        }
      }
    }
  }
  const result: DeviationPhotos = { photos };
  return json(200, result);
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

app.http('deviationsPhotos', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'deviations/photos',
  handler: getDeviationPhotos,
});
