/**
 * Following up an inspection's deviations (shared/src/deviationLog.ts): close one with what was
 * done, edit that, or reopen it. On an inspection in progress or finalised alike: closing a
 * deviation doesn't change what the inspection found, and it is stored apart from it.
 *
 *   GET /api/inspections/{id}/follow-ups        inspector  FollowUps (none yet: an empty map)
 *   PUT /api/inspections/{id}/follow-ups/{key}  inspector  FollowUpRequest → FollowUp
 *
 * `key` is the deviation's: a NOK row's item id or an extra deviation's id (404 if it is not a
 * deviation of the inspection now). A PUT sets what it is given, so sending it again is safe.
 */
import { app, type HttpRequest } from '@azure/functions';
import {
  applyFollowUp,
  deriveDeviations,
  FollowUpRequestSchema,
  IdSchema,
  swedishDay,
  type FollowUps,
} from '@modig/shared';
import { loadFollowUps, writeFollowUp } from '../lib/followUps';
import {
  BadRequestError,
  endpoint,
  idParam,
  json,
  NotFoundError,
  readJsonBody,
  ServiceUnavailableError,
} from '../lib/http';
import { inspectionNotFound, loadInspection, syncSettled } from '../lib/inspections';

export const getFollowUps = endpoint({ role: 'inspector' }, async (req) => {
  const inspectionId = idParam(req);
  const stored = await loadFollowUps(inspectionId);
  const body: FollowUps = stored?.data ?? { inspectionId, followUps: {} };
  return json(200, body);
});

/**
 * Writes the follow-up, then brings the deviation table in line (the log reads it from there).
 * If that fails, the follow-up is stored but the log doesn't show it yet: the answer is a 503,
 * and sending the same request again stores the same and tries the table again.
 */
export const setFollowUp = endpoint({ role: 'inspector' }, async (req, context, user) => {
  const inspectionId = idParam(req);
  const key = keyParam(req);
  const request = await readJsonBody(req, FollowUpRequestSchema);

  const stored = await loadInspection(inspectionId);
  if (!stored) throw inspectionNotFound();
  if (!deriveDeviations(stored.data).some((deviation) => deviation.key === key)) {
    throw new NotFoundError('This deviation is not in the inspection (any more). Reload the page.');
  }

  const now = new Date();
  const followUp = await writeFollowUp(inspectionId, key, (current) =>
    applyFollowUp(current, request, {
      today: swedishDay(now),
      name: user.name,
      email: user.email,
      now: now.toISOString(),
    }),
  );
  await syncSettled(stored.data, stored.etag, context).catch((error: unknown) => {
    context.error(`Followed up a deviation of ${inspectionId}; syncing the table failed`, error);
    throw new ServiceUnavailableError(
      'The change was saved, but the deviation log could not be updated. Try again.',
    );
  });
  return json(200, followUp);
});

/** The `{key}` route parameter: a deviation's key is an id, like the rest of its RowKey. */
function keyParam(req: HttpRequest): string {
  const result = IdSchema.safeParse(req.params.key);
  if (!result.success) throw new BadRequestError('The deviation in the URL is not valid.');
  return result.data;
}

// One function for both routes (keeps the registration count low): the key is optional.
app.http('inspectionFollowUps', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'inspections/{id}/follow-ups/{key?}',
  handler: (req, context) => (req.method === 'PUT' ? setFollowUp : getFollowUps)(req, context),
});
