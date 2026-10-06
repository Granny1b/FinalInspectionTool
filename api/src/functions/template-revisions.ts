/**
 * Published revisions (brief §5.2): publishing freezes the draft as an immutable `rev-{n}.json`,
 * which inspections are created from and which never changes again.
 *
 *   POST /api/templates/{id}/publish        admin      If-Match, PublishTemplateRequest
 *                                                      → TemplateDetail + ETag
 *   GET  /api/templates/{id}/revisions/{n}  inspector  Template (cacheable forever)
 */
import { app, type HttpRequest } from '@azure/functions';
import {
  blobNames,
  CONTAINERS,
  PublishTemplateRequestSchema,
  validateForPublish,
  type Template,
} from '@modig/shared';
import {
  BadRequestError,
  ConflictError,
  endpoint,
  etagHeader,
  idParam,
  json,
  NotFoundError,
  PreconditionFailedError,
  readJsonBody,
  requireIfMatch,
} from '../lib/http';
import { writeJson } from '../lib/storage';
import {
  loadDetail,
  loadRevision,
  loadTemplate,
  nextRevision,
  templateNotFound,
} from '../lib/templates';

/**
 * If-Match is the draft ETag the admin is looking at, so what gets published is exactly what
 * they saw. Answers like GET /api/templates/{id}, with the bumped draft's ETag.
 */
export const publishTemplate = endpoint({ role: 'admin' }, async (req, context, user) => {
  const id = idParam(req);
  const ifMatch = requireIfMatch(req);
  const { changeNote } = await readJsonBody(req, PublishTemplateRequestSchema);

  const current = await loadTemplate(id);
  if (!current) throw templateNotFound();
  if (current.etag !== ifMatch) throw new PreconditionFailedError();
  const issues = validateForPublish(current.draft);
  if (issues.length > 0) {
    const problems = issues.length === 1 ? 'one problem' : `${issues.length} problems`;
    throw new BadRequestError(`Fix ${problems} before publishing.`, issues);
  }

  const revision = nextRevision(current.revisions);
  const now = new Date().toISOString();
  // A draft carries no change note; the note belongs to the revision being published.
  const { changeNote: _draftNote, ...content } = current.draft;
  const published: Template = {
    ...content,
    status: 'published',
    revision,
    ...(changeNote ? { changeNote } : {}),
    updatedAt: now,
    updatedBy: user.email,
  };
  await writeJson(
    CONTAINERS.templates,
    blobNames.templateRevision(id, revision),
    published,
    // Never overwrite a revision. Losing this race means someone else published this draft first.
    { ifNoneMatch: '*' },
  ).catch((error: unknown) => {
    throw error instanceof ConflictError ? new PreconditionFailedError() : error;
  });

  // The draft now continues as the next revision. If someone saved in between, the publish still
  // stands and their draft is kept; reads normalise its revision number anyway. rev-N is committed,
  // so nothing from here on may turn the publish into a failure: the user would try again, and the
  // unchanged ETag would let that publish the same content again as N + 1.
  const draft: Template = {
    ...content,
    revision: revision + 1,
    updatedAt: now,
    updatedBy: user.email,
  };
  await writeJson(CONTAINERS.templates, blobNames.templateDraft(id), draft, { ifMatch }).catch(
    (error: unknown) => {
      if (!(error instanceof PreconditionFailedError)) {
        context.warn(`Published revision ${revision} of ${id}; moving the draft on failed`, error);
      }
    },
  );

  const after = await loadDetail(id);
  if (!after) throw templateNotFound();
  return json(200, after.detail, etagHeader(after.etag));
});

/** Published revisions never change, so the browser may cache them for good. */
const IMMUTABLE = 'private, max-age=31536000, immutable';

export const getRevision = endpoint({ role: 'inspector' }, async (req) => {
  const id = idParam(req);
  const n = revisionParam(req);
  const revision = await loadRevision(id, n);
  if (!revision) throw new NotFoundError(`Revision ${n} of this template does not exist.`);
  return json(200, revision, { 'Cache-Control': IMMUTABLE });
});

/** `{n}` must be a plain positive integer ("3", not "03", "3.0" or "-1"). */
function revisionParam(req: HttpRequest): number {
  const value = req.params.n ?? '';
  if (!/^[1-9]\d{0,8}$/.test(value)) {
    throw new BadRequestError('The revision number in the URL is not valid.');
  }
  return Number(value);
}

app.http('templatePublish', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'templates/{id}/publish',
  handler: publishTemplate,
});

app.http('templateRevision', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'templates/{id}/revisions/{n}',
  handler: getRevision,
});
