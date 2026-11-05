/**
 * Template storage (brief §3): `templates/{id}/draft.json` is the one draft admins edit and
 * `templates/{id}/rev-{n}.json` are the immutable published revisions. Revision numbers always
 * come from the blob listing, never from the number stored in a draft.
 */
import type { InvocationContext } from '@azure/functions';
import { isRestError } from '@azure/storage-blob';
import {
  blobNames,
  checklistIds,
  CONTAINERS,
  hasUnpublishedChanges,
  TemplateSchema,
  type Section,
  type Template,
  type TemplateDetail,
  type TemplateRevisionInfo,
  type TemplateSummary,
} from '@modig/shared';
import { NotFoundError, PreconditionFailedError } from './http';
import { containerClient, ensureStorage, listBlobNames, readJson } from './storage';

const { templates } = CONTAINERS;

export type StoredTemplate = {
  id: string;
  /** The stored draft, with `revision` normalised to latest published + 1. */
  draft: Template;
  /** The draft blob's ETag. */
  etag: string;
  /** Published revision numbers, ascending. */
  revisions: number[];
};

export function templateNotFound(): NotFoundError {
  return new NotFoundError('This template does not exist.');
}

/** The revision the next publish gets: latest published + 1 (1 if never published). */
export function nextRevision(revisions: readonly number[]): number {
  return (revisions.at(-1) ?? 0) + 1;
}

/** The draft of one template, or null if there is none. */
export async function loadTemplate(id: string): Promise<StoredTemplate | null> {
  const [stored, revisionsById] = await Promise.all([
    readJson(templates, blobNames.templateDraft(id), TemplateSchema),
    listRevisions(`${id}/`),
  ]);
  return stored && withNormalisedDraft(id, stored, revisionsById.get(id) ?? []);
}

/**
 * Every template that has a draft. A folder holding only revisions is an interrupted seed import
 * (the seed completes it on its next run), not an editable template, so it is left out.
 */
export async function loadAllTemplates(): Promise<StoredTemplate[]> {
  const revisionsById = await listRevisions();
  const loaded = await Promise.all(
    [...revisionsById].map(async ([id, revisions]) => {
      const stored = await readJson(templates, blobNames.templateDraft(id), TemplateSchema);
      return stored && withNormalisedDraft(id, stored, revisions);
    }),
  );
  return loaded.filter((template) => template !== null);
}

/** A published revision, or null if it does not exist. */
export async function loadRevision(id: string, revision: number): Promise<Template | null> {
  const stored = await readJson(
    templates,
    blobNames.templateRevision(id, revision),
    TemplateSchema,
  );
  return stored?.data ?? null;
}

/** The latest published revision, or null if the template has never been published. */
export async function loadLatestPublished(template: StoredTemplate): Promise<Template | null> {
  const latest = template.revisions.at(-1);
  return latest === undefined ? null : loadListedRevision(template.id, latest);
}

/** Swedish alphabetical order (å, ä, ö after z), ignoring case; "HHV3" before "HHV10". */
const byName = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

/** GET /api/templates: one summary per template, sorted by name. */
export async function loadSummaries(): Promise<TemplateSummary[]> {
  const summaries = await Promise.all(
    (await loadAllTemplates()).map(async (template): Promise<TemplateSummary | null> => {
      const { id, draft } = template;
      const published = await loadLatestPublished(template).catch(unlessDeleted(id));
      if (published === DELETED) return null;
      return {
        id,
        name: draft.name,
        modelCode: draft.modelCode,
        publishedRevision: published?.revision ?? null,
        publishedName: published?.name ?? null,
        publishedModelCode: published?.modelCode ?? null,
        draftRevision: draft.revision,
        hasUnpublishedChanges: hasUnpublishedChanges(draft, published),
        itemCount: draft.sections.reduce((count, section) => count + section.items.length, 0),
        ...(draft.coverImageId && { coverImageId: draft.coverImageId }),
        updatedAt: draft.updatedAt,
        updatedBy: draft.updatedBy,
      };
    }),
  );
  return summaries
    .filter((summary) => summary !== null)
    .sort((a, b) => byName.compare(a.name, b.name) || a.id.localeCompare(b.id));
}

/** The draft, its revision history and its ETag, or null if there is no draft. */
export async function loadDetail(
  id: string,
): Promise<{ detail: TemplateDetail; etag: string } | null> {
  const template = await loadTemplate(id);
  if (!template) return null;
  const published = await Promise.all(
    template.revisions.map((n) => loadListedRevision(id, n)),
  ).catch(unlessDeleted(id));
  if (published === DELETED) return null;
  const detail: TemplateDetail = {
    draft: template.draft,
    revisions: published.map(revisionInfo).reverse(),
    hasUnpublishedChanges: hasUnpublishedChanges(template.draft, published.at(-1) ?? null),
  };
  return { detail, etag: template.etag };
}

/** The other template whose draft uses `modelCode`, if any (one template per model, brief §1). */
export async function findTemplateForModel(
  modelCode: string,
  exceptId?: string,
): Promise<StoredTemplate | undefined> {
  return (await loadAllTemplates()).find(
    (template) => template.draft.modelCode === modelCode && template.id !== exceptId,
  );
}

/**
 * Ids used more than once: among the sections, or among all rows of the template (inspection
 * results and KPIs are keyed by row id, so a row id must be unique across sections too).
 */
export function duplicateIds(sections: readonly Section[]): string[] {
  const duplicates = new Set<string>();
  for (const ids of [
    sections.map((section) => section.id),
    sections.flatMap((section) => section.items.map((item) => item.id)),
  ]) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
  }
  return [...duplicates];
}

/** A history line. A revision's updatedAt/updatedBy say when and by whom it was published. */
function revisionInfo(revision: Template): TemplateRevisionInfo {
  return {
    revision: revision.revision,
    publishedAt: revision.updatedAt,
    publishedBy: revision.updatedBy,
    changeNote: revision.changeNote,
  };
}

/** Template ids under `prefix` with their published revision numbers, ascending. */
export async function listRevisions(prefix?: string): Promise<Map<string, number[]>> {
  const revisionsById = new Map<string, number[]>();
  for (const name of await listBlobNames(templates, prefix)) {
    const [id, file, ...rest] = name.split('/');
    if (!id || file === undefined || rest.length > 0) continue; // not a template blob
    const revisions = revisionsById.get(id) ?? [];
    revisionsById.set(id, revisions);
    const match = blobNames.templateRevisionPattern.exec(file);
    if (match) revisions.push(Number(match[1]));
  }
  for (const revisions of revisionsById.values()) revisions.sort((a, b) => a - b);
  return revisionsById;
}

/** A listed revision that was gone by the time it was read. */
class RevisionVanishedError extends Error {
  override name = 'RevisionVanishedError';
}

/**
 * A revision the listing just showed. Only deleting the whole template removes revisions, and it
 * deletes the draft first; so a miss with the draft still there is a server error.
 */
async function loadListedRevision(id: string, revision: number): Promise<Template> {
  const loaded = await loadRevision(id, revision);
  if (!loaded) {
    throw new RevisionVanishedError(
      `templates/${blobNames.templateRevision(id, revision)} vanished`,
    );
  }
  return loaded;
}

const DELETED = Symbol('deleted');

/** For `.catch`: a revision that vanished because the template was deleted meanwhile. */
function unlessDeleted(id: string) {
  return async (error: unknown): Promise<typeof DELETED> => {
    if (error instanceof RevisionVanishedError) {
      const draft = await readJson(templates, blobNames.templateDraft(id), TemplateSchema);
      if (!draft) return DELETED;
    }
    throw error;
  };
}

/**
 * Deletes a template: its draft, only while it is still version `ifMatch` (412 otherwise), and
 * then every published revision. The draft goes first, so the template is gone for everyone at
 * once (a folder without a draft is never listed). Images stay: inspections share the cover and
 * the guide images through their snapshots. Inspections and their deviation rows keep their own
 * copies. A revision that can't be deleted is logged and left behind, unlisted: the template is
 * already gone, and a retry would find nothing to delete.
 */
export async function deleteTemplate(
  id: string,
  ifMatch: string,
  context: InvocationContext,
): Promise<void> {
  await ensureStorage();
  const container = containerClient(templates);
  const blob = container.getBlobClient(blobNames.templateDraft(id));
  await blob.delete({ conditions: { ifMatch } }).catch(async (error: unknown) => {
    if (isRestError(error) && error.statusCode === 412) {
      // Storage may answer the condition with 412 when the blob is gone, too: another admin
      // deleted it first, which is a 404 to the caller, not a conflict.
      throw (await blob.exists()) ? new PreconditionFailedError() : templateNotFound();
    }
    if (isRestError(error) && error.statusCode === 404) throw templateNotFound();
    throw error;
  });
  // Listed again: a publish may have added a revision since the caller read the template.
  const names = await listBlobNames(templates, `${id}/`);
  const results = await Promise.allSettled(
    names.map((name) => container.getBlobClient(name).deleteIfExists()),
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      context.warn(`Deleted template ${id}; templates/${names[index]} was left`, result.reason);
    }
  });
}

/**
 * Every section and row id any template uses, in its draft or in any published revision
 * (inspections and KPIs know rows by these ids, so an imported template must not reuse one).
 */
export async function usedChecklistIds(): Promise<Set<string>> {
  const revisionsById = await listRevisions();
  const documents = await Promise.all(
    [...revisionsById].flatMap(([id, revisions]) => [
      readJson(templates, blobNames.templateDraft(id), TemplateSchema).then(
        (stored) => stored?.data ?? null,
      ),
      ...revisions.map((revision) => loadRevision(id, revision)),
    ]),
  );
  return new Set(
    documents.flatMap((template) => (template ? checklistIds(template.sections) : [])),
  );
}

/** The ids of these images that are stored here (`images/{id}.jpg`). */
export async function storedImages(imageIds: readonly string[]): Promise<Set<string>> {
  await ensureStorage();
  const images = containerClient(CONTAINERS.images);
  const stored = await Promise.all(
    imageIds.map(async (imageId) =>
      (await images.getBlobClient(blobNames.image(imageId)).exists()) ? imageId : null,
    ),
  );
  return new Set(stored.filter((imageId) => imageId !== null));
}

/** The server owns revision numbers: whatever the stored draft says, it is the next one. */
function withNormalisedDraft(
  id: string,
  stored: { data: Template; etag: string },
  revisions: number[],
): StoredTemplate {
  return {
    id,
    draft: { ...stored.data, status: 'draft', revision: nextRevision(revisions) },
    etag: stored.etag,
    revisions,
  };
}
