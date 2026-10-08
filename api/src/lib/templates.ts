/**
 * Template storage (brief §3): `templates/{id}/draft.json` is the one draft admins edit and
 * `templates/{id}/rev-{n}.json` are the immutable published revisions. Revision numbers always
 * come from the blob listing, never from the number stored in a draft.
 */
import {
  blobNames,
  CONTAINERS,
  hasUnpublishedChanges,
  TemplateSchema,
  type Section,
  type Template,
  type TemplateDetail,
  type TemplateRevisionInfo,
  type TemplateSummary,
} from '@modig/shared';
import { NotFoundError } from './http';
import { listBlobNames, readJson } from './storage';

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
    (await loadAllTemplates()).map(async (template): Promise<TemplateSummary> => {
      const { id, draft } = template;
      const published = await loadLatestPublished(template);
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
        updatedAt: draft.updatedAt,
        updatedBy: draft.updatedBy,
      };
    }),
  );
  return summaries.sort((a, b) => byName.compare(a.name, b.name) || a.id.localeCompare(b.id));
}

/** The draft, its revision history and its ETag, or null if there is no draft. */
export async function loadDetail(
  id: string,
): Promise<{ detail: TemplateDetail; etag: string } | null> {
  const template = await loadTemplate(id);
  if (!template) return null;
  const published = await Promise.all(template.revisions.map((n) => loadListedRevision(id, n)));
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
async function listRevisions(prefix?: string): Promise<Map<string, number[]>> {
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

/** A revision the listing just showed; revisions are never deleted, so a miss is a server error. */
async function loadListedRevision(id: string, revision: number): Promise<Template> {
  const loaded = await loadRevision(id, revision);
  if (!loaded) throw new Error(`templates/${blobNames.templateRevision(id, revision)} vanished`);
  return loaded;
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
