/**
 * Locking and unlocking an inspection (brief §5.3: "Finalise … then locks the inspection. Admin
 * can reopen.").
 *
 *   POST /api/inspections/{id}/finalise  inspector  If-Match → Inspection + ETag
 *   POST /api/inspections/{id}/reopen    admin      If-Match → Inspection + ETag
 *
 * Both update the deviation table first (its `finalised` flag decides what the KPIs count), then
 * the blob. A failed table update answers 503 with nothing changed, so the client simply sends
 * the same request again. Both are idempotent: asking for the state the inspection is already in
 * syncs the table again and answers 200. After the blob write, the table is synced once more and
 * checked against the blob, in case a save's slow sync landed in between (`syncSettled`).
 */
import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { validateForFinalise, type Inspection } from '@modig/shared';
import { syncDeviations } from '../lib/deviations';
import {
  BadRequestError,
  endpoint,
  etagHeader,
  idParam,
  json,
  PreconditionFailedError,
  requireIfMatch,
  ServiceUnavailableError,
} from '../lib/http';
import {
  inspectionNotFound,
  loadInspection,
  syncSettled,
  writeInspection,
  type StoredInspection,
} from '../lib/inspections';

export const finaliseInspection = endpoint({ role: 'inspector' }, async (req, context, user) => {
  const { stored, ifMatch } = await loadCurrent(req);
  if (stored.data.state === 'finalised') return unchanged(stored, context);

  const issues = validateForFinalise(stored.data);
  if (issues.length > 0) {
    const problems = issues.length === 1 ? 'one problem' : `${issues.length} problems`;
    throw new BadRequestError(`Fix ${problems} before finalising.`, issues);
  }
  const now = new Date().toISOString();
  const finalised: Inspection = {
    ...stored.data,
    state: 'finalised',
    finalisedAt: now,
    finalisedBy: user.email,
    updatedAt: now,
    updatedBy: user.email,
  };
  return commit(finalised, ifMatch, context);
});

export const reopenInspection = endpoint({ role: 'admin' }, async (req, context, user) => {
  const { stored, ifMatch } = await loadCurrent(req);
  if (stored.data.state === 'in_progress') return unchanged(stored, context);

  const { finalisedAt: _at, finalisedBy: _by, ...rest } = stored.data;
  const reopened: Inspection = {
    ...rest,
    state: 'in_progress',
    updatedAt: new Date().toISOString(),
    updatedBy: user.email,
  };
  return commit(reopened, ifMatch, context);
});

/** The inspection, once its If-Match has been checked: an outdated page always gets the 412. */
async function loadCurrent(
  req: HttpRequest,
): Promise<{ stored: StoredInspection; ifMatch: string }> {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const stored = await loadInspection(id);
  if (!stored) throw inspectionNotFound();
  if (stored.etag !== ifMatch) throw new PreconditionFailedError();
  return { stored, ifMatch };
}

/** Already in the requested state (e.g. a retry): make sure the table agrees, answer as before. */
async function unchanged(stored: StoredInspection, context: InvocationContext) {
  await orUnavailable(syncSettled(stored.data, stored.etag, context), stored.data.id, context);
  return json(200, stored.data, etagHeader(stored.etag));
}

/**
 * Table first, then blob. If the blob write fails (someone saved in between: 412), the table is
 * already ahead of the blob, so it is synced again from what the blob now holds. After a
 * successful write it is synced once more, best effort: a save's sync that was still on its way
 * may have landed between the first sync and the write.
 */
async function commit(changed: Inspection, ifMatch: string, context: InvocationContext) {
  await orUnavailable(syncDeviations(changed), changed.id, context);
  const etag = await writeInspection(changed, { ifMatch }).catch(async (error: unknown) => {
    await resyncFromBlob(changed.id, context);
    throw error;
  });
  await syncSettled(changed, etag, context).catch((error: unknown) => {
    context.warn(`Re-syncing the deviations of inspection ${changed.id} failed`, error);
  });
  return json(200, changed, etagHeader(etag));
}

async function orUnavailable(sync: Promise<void>, id: string, context: InvocationContext) {
  await sync.catch((error: unknown) => {
    context.error(`Syncing the deviations of inspection ${id} failed`, error);
    throw new ServiceUnavailableError(
      'The deviation records could not be updated, so nothing was changed. Try again.',
    );
  });
}

/** Best effort: the next successful write syncs again anyway. */
async function resyncFromBlob(id: string, context: InvocationContext): Promise<void> {
  try {
    const latest = await loadInspection(id);
    if (latest) await syncSettled(latest.data, latest.etag, context);
  } catch (error) {
    context.warn(`Re-syncing the deviations of inspection ${id} failed`, error);
  }
}

app.http('inspectionFinalise', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'inspections/{id}/finalise',
  handler: finaliseInspection,
});

app.http('inspectionReopen', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'inspections/{id}/reopen',
  handler: reopenInspection,
});
