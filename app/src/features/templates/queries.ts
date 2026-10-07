/**
 * Server state for templates (brief §8), all through apiFetch and the shared schemas.
 * Query keys live here so invalidation after create/save/publish is in one place.
 */
import {
  SaveTemplateResponseSchema,
  TemplateDetailSchema,
  TemplateListSchema,
  TemplateSchema,
  type CreateTemplateRequest,
  type PublishIssue,
  type TemplateDetail,
  type TemplateDraftInput,
} from '@modig/shared';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiRequestError, type ApiResponse } from '../../lib/api';

export const templateKeys = {
  list: ['templates', 'list'] as const,
  detail: (id: string) => ['templates', 'detail', id] as const,
  revision: (id: string, revision: number) => ['templates', 'revision', id, revision] as const,
};

const templatePath = (id: string) => `/api/templates/${encodeURIComponent(id)}`;

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

export function useTemplates() {
  return useQuery({
    queryKey: templateKeys.list,
    queryFn: async ({ signal }) =>
      (await apiFetch('/api/templates', { schema: TemplateListSchema, signal })).data,
  });
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

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateTemplateRequest): Promise<LoadedTemplate> => {
      const { data, etag } = withEtag(
        await apiFetch('/api/templates', {
          method: 'POST',
          body: request,
          schema: TemplateDetailSchema,
        }),
      );
      return { detail: data, etag };
    },
    onSuccess: (created) => {
      // The editor opens straight from this answer instead of loading it again.
      queryClient.setQueryData(templateKeys.detail(created.detail.draft.id), created);
      return queryClient.invalidateQueries({ queryKey: templateKeys.list });
    },
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

const PublishIssuesSchema = z.array(
  z.object({
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('template') }),
      z.object({ kind: z.literal('section'), sectionId: z.string() }),
      z.object({ kind: z.literal('item'), sectionId: z.string(), itemId: z.string() }),
    ]),
    message: z.string(),
  }),
);

/** The publish problems a 400 from …/publish carries in `details`, if that's what it is. */
export function publishIssuesOf(error: unknown): PublishIssue[] | null {
  if (!(error instanceof ApiRequestError) || error.status !== 400) return null;
  const parsed = PublishIssuesSchema.safeParse(error.details);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}
