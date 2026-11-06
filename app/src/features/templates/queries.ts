/**
 * Server state for templates (brief §8), all through apiFetch and the shared schemas.
 * Query keys live here so invalidation after create/save/publish is in one place.
 */
import {
  ImportTemplateResponseSchema,
  PublishIssueSchema,
  SaveTemplateResponseSchema,
  TemplateDetailSchema,
  TemplateListSchema,
  TemplateSchema,
  type CreateQualityCheckRequest,
  type CreateTemplateRequest,
  type ImportQualityCheckRequest,
  type ImportTemplateRequest,
  type PublishIssue,
  type TemplateDetail,
  type TemplateDraftInput,
  type TemplateSummary,
} from '@modig/shared';
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiRequestError, type ApiResponse } from '../../lib/api';

export const templateKeys = {
  list: ['templates', 'list'] as const,
  detail: (id: string) => ['templates', 'detail', id] as const,
  revision: (id: string, revision: number) => ['templates', 'revision', id, revision] as const,
};

const templatePath = (id: string) => `/api/templates/${encodeURIComponent(id)}`;

/** A revision number from an address: as the API wants it, a positive integer without leading zeros. */
export function parseRevision(param: string | null | undefined): number | null {
  return param && /^[1-9]\d{0,8}$/.test(param) ? Number(param) : null;
}

/**
 * Saves and publishes give up after this long, so a request that hangs becomes a failure that is
 * retried or shown (SWA's gateway itself gives up at 45 s).
 */
const WRITE_TIMEOUT_MS = 30_000;

/** A template's draft with the ETag every save and publish must send back. */
export type LoadedTemplate = { detail: TemplateDetail; etag: string };

function withEtag<T>({ data, etag }: ApiResponse<T>): { data: T; etag: string } {
  // The API sends one with every draft; without it no save could ever succeed.
  if (!etag) {
    throw new ApiRequestError(500, {
      error: 'internal',
      message: 'The server did not say which version of the template this is.',
    });
  }
  return { data, etag };
}

/** Every template: the machines' final inspection templates and their quality checks. */
export function useTemplates() {
  return useQuery({
    queryKey: templateKeys.list,
    queryFn: async ({ signal }) =>
      (await apiFetch('/api/templates', { schema: TemplateListSchema, signal })).data,
  });
}

/** The final inspection templates of a list: one per machine model. */
export function finalTemplates(list: readonly TemplateSummary[]): TemplateSummary[] {
  return list.filter((template) => template.kind === 'final');
}

/** The quality checks of the machine whose final inspection template is `parentId`. */
export function qualityChecksOf(
  list: readonly TemplateSummary[],
  parentId: string,
): TemplateSummary[] {
  return list.filter((template) => template.kind === 'quality' && template.parentId === parentId);
}

/** The editor of a template: a final inspection's, or a quality check's under its machine. */
export function templateHref(template: Pick<TemplateSummary, 'id' | 'kind' | 'parentId'>): string {
  return template.kind === 'quality' && template.parentId
    ? qualityCheckHref(template.parentId, template.id)
    : `/templates/${template.id}`;
}

/** A machine's Quality checks tab. */
export function qualityChecksHref(parentId: string): string {
  return `/templates/${parentId}/quality-checks`;
}

/** A quality check's editor (or, for inspectors, its latest revision). */
export function qualityCheckHref(parentId: string, id: string): string {
  return `${qualityChecksHref(parentId)}/${id}`;
}

/** The draft with its ETag, revision history and publish state (admins). */
export async function fetchTemplate(id: string, signal?: AbortSignal): Promise<LoadedTemplate> {
  const { data, etag } = withEtag(
    await apiFetch(templatePath(id), { schema: TemplateDetailSchema, signal }),
  );
  return { detail: data, etag };
}

/** The draft for the editor (admins). */
export function useTemplateDetail(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: ({ signal }) => fetchTemplate(id, signal),
    // The editor copies the draft into its own state when it opens. A cached copy would carry an
    // ETag the editor's own autosaves have since replaced, so every visit loads afresh.
    gcTime: 0,
  });
}

/** A published revision; immutable, so it never goes stale. Idle while `revision` is null. */
export function useTemplateRevision(id: string, revision: number | null) {
  return useQuery({
    queryKey: templateKeys.revision(id, revision ?? 0),
    queryFn:
      revision === null
        ? skipToken
        : async ({ signal }) =>
            (
              await apiFetch(`${templatePath(id)}/revisions/${revision}`, {
                schema: TemplateSchema,
                signal,
              })
            ).data,
    staleTime: Infinity,
  });
}

/** A new final inspection template, or a quality check under a machine's. */
export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      request: CreateTemplateRequest | CreateQualityCheckRequest,
    ): Promise<LoadedTemplate> => {
      const { data, etag } = withEtag(
        await apiFetch('/api/templates', {
          method: 'POST',
          body: request,
          schema: TemplateDetailSchema,
        }),
      );
      return { detail: data, etag };
    },
    onSuccess: (created, request) => opened(queryClient, created, request),
  });
}

/**
 * The editor opens straight from a create's or an import's answer instead of loading it again.
 * A new machine model went into the settings with it.
 */
function opened(
  queryClient: QueryClient,
  created: LoadedTemplate,
  request: { newModel?: unknown } | { kind: 'quality' },
) {
  queryClient.setQueryData(templateKeys.detail(created.detail.draft.id), created);
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: templateKeys.list }),
    'newModel' in request && request.newModel
      ? queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
      : null,
  ]);
}

/** useSettings' key (lib/useSettings.ts): a prefix, so it matches however that query is keyed. */
const SETTINGS_KEY = ['settings'];

/**
 * A new draft from a template file, or a quality check from a quality check file; resolves to it
 * and the number of images left out.
 */
export function useImportTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      request: ImportTemplateRequest | ImportQualityCheckRequest,
    ): Promise<{ loaded: LoadedTemplate; droppedImages: number }> => {
      const { data, etag } = withEtag(
        await apiFetch('/api/templates/import', {
          method: 'POST',
          body: request,
          schema: ImportTemplateResponseSchema,
        }),
      );
      const { droppedImages, ...detail } = data;
      return { loaded: { detail, etag }, droppedImages };
    },
    onSuccess: ({ loaded }, request) => opened(queryClient, loaded, request),
  });
}

/**
 * Deletes a template (admins), if its draft is still the version the editor holds: `ifMatch`
 * resolves to that ETag (after saving what is unsaved). Already deleted by someone else counts as
 * done.
 */
export function useDeleteTemplate(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ifMatch: () => Promise<string>) => {
      const etag = await ifMatch();
      await apiFetch(templatePath(id), {
        method: 'DELETE',
        ifMatch: etag,
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      }).catch((error: unknown) => {
        if (!(error instanceof ApiRequestError && error.status === 404)) throw error;
      });
    },
    // The editor's own query is left alone: it is dropped once the editor has gone (gcTime 0).
    // Removed now, it would refetch the deleted template under the open editor.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.list }),
  });
}

/** PUT of the draft (autosave). Resolves to the saved draft and its new ETag. */
export async function saveDraft(id: string, input: TemplateDraftInput, ifMatch: string) {
  return withEtag(
    await apiFetch(templatePath(id), {
      method: 'PUT',
      body: input,
      ifMatch,
      schema: SaveTemplateResponseSchema,
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    }),
  );
}

/** Publishes the draft the user is looking at (`ifMatch`). */
export async function publishDraft(id: string, ifMatch: string, changeNote: string) {
  const note = changeNote.trim();
  return withEtag(
    await apiFetch(`${templatePath(id)}/publish`, {
      method: 'POST',
      body: note ? { changeNote: note } : {},
      ifMatch,
      schema: TemplateDetailSchema,
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    }),
  );
}

const PublishIssuesSchema = z.array(PublishIssueSchema);

/** The publish problems a 400 from …/publish carries in `details`, if that's what it is. */
export function publishIssuesOf(error: unknown): PublishIssue[] | null {
  if (!(error instanceof ApiRequestError) || error.status !== 400) return null;
  const parsed = PublishIssuesSchema.safeParse(error.details);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}
