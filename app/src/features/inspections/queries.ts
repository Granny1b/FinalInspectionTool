/**
 * Server state for inspections (brief §8), all through apiFetch and the shared schemas. Query keys
 * live here so invalidation after create/save/finalise is in one place.
 */
import {
  FinaliseIssueSchema,
  InspectionListSchema,
  InspectionSchema,
  type CreateInspectionRequest,
  type FinaliseIssue,
  type Inspection,
  type InspectionDraftInput,
  type InspectionSummary,
} from '@modig/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, ApiRequestError, type ApiResponse } from '../../lib/api';

export const inspectionKeys = {
  list: ['inspections', 'list'] as const,
  detail: (id: string) => ['inspections', 'detail', id] as const,
};

const inspectionPath = (id: string) => `/api/inspections/${encodeURIComponent(id)}`;

/** Writes give up after this long (SWA's gateway itself gives up at 45 s), as for templates. */
const WRITE_TIMEOUT_MS = 30_000;

/** An inspection with the ETag every save, finalise and reopen must send back. */
export type LoadedInspection = { inspection: Inspection; etag: string };

function withEtag({ data, etag }: ApiResponse<Inspection>): LoadedInspection {
  // The API sends one with every inspection; without it no save could ever succeed.
  if (!etag) {
    throw new ApiRequestError(500, {
      error: 'internal',
      message: 'The server did not say which version of the inspection this is.',
    });
  }
  return { inspection: data, etag };
}

export function useInspections() {
  return useQuery({
    queryKey: inspectionKeys.list,
    queryFn: async ({ signal }) =>
      (await apiFetch('/api/inspections', { schema: InspectionListSchema, signal })).data,
  });
}

export async function fetchInspection(id: string, signal?: AbortSignal): Promise<LoadedInspection> {
  return withEtag(await apiFetch(inspectionPath(id), { schema: InspectionSchema, signal }));
}

export function useInspection(id: string) {
  return useQuery({
    queryKey: inspectionKeys.detail(id),
    queryFn: ({ signal }) => fetchInspection(id, signal),
    // The page copies the inspection into its own state when it opens; a cached copy would carry
    // an ETag its own autosaves have since replaced, so every visit loads afresh.
    gcTime: 0,
  });
}

export function useCreateInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    // No client timeout, unlike saves: giving up on a create that went through would invite a
    // second inspection for the same machine. SWA's gateway ends a hung request at 45 s anyway.
    mutationFn: async (request: CreateInspectionRequest) =>
      withEtag(
        await apiFetch('/api/inspections', {
          method: 'POST',
          body: request,
          schema: InspectionSchema,
        }),
      ),
    onSuccess: (created) => {
      // The inspection page opens straight from this answer instead of loading it again.
      queryClient.setQueryData(inspectionKeys.detail(created.inspection.id), created);
      return queryClient.invalidateQueries({ queryKey: inspectionKeys.list });
    },
  });
}

/** PUT of the client-owned fields (autosave). */
export async function saveInspection(
  id: string,
  input: InspectionDraftInput,
  ifMatch: string,
): Promise<LoadedInspection> {
  return withEtag(
    await apiFetch(inspectionPath(id), {
      method: 'PUT',
      body: input,
      ifMatch,
      schema: InspectionSchema,
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    }),
  );
}

/** Every Insights query starts with this key: deleting an inspection changes their numbers. */
const INSIGHTS_KEY = ['insights'] as const;

/**
 * DELETE (admins) of the version the page shows: `ifMatch` is asked for once its pending saves
 * have settled. A 404 counts as deleted: another admin got there first, or this is a retry of a
 * delete whose answer was lost.
 */
export function useDeleteInspection(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ifMatch: () => Promise<string>) => {
      const etag = await ifMatch();
      await apiFetch(inspectionPath(id), {
        method: 'DELETE',
        ifMatch: etag,
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      }).catch((error: unknown) => {
        if (!(error instanceof ApiRequestError && error.status === 404)) throw error;
      });
    },
    onSuccess: () => {
      // Out of the cached list at once, so the list never shows it while it is fetched again.
      queryClient.setQueryData<InspectionSummary[]>(inspectionKeys.list, (list) =>
        list?.filter((summary) => summary.id !== id),
      );
      // The page's own query is left alone: it is dropped once the page has gone (gcTime 0).
      // Removed now, it would fetch the deleted inspection again under the open page.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: inspectionKeys.list }),
        queryClient.invalidateQueries({ queryKey: INSIGHTS_KEY }),
      ]);
    },
  });
}

export type StateChange = 'finalise' | 'reopen';

/** POST …/finalise (locks it) or …/reopen (admins), for the version the user is looking at. */
export async function changeState(
  id: string,
  change: StateChange,
  ifMatch: string,
): Promise<LoadedInspection> {
  return withEtag(
    await apiFetch(`${inspectionPath(id)}/${change}`, {
      method: 'POST',
      ifMatch,
      schema: InspectionSchema,
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    }),
  );
}

const FinaliseIssuesSchema = z.array(FinaliseIssueSchema);

/** The problems a 400 from …/finalise carries in `details`, if that's what it is. */
export function finaliseIssuesOf(error: unknown): FinaliseIssue[] | null {
  if (!(error instanceof ApiRequestError) || error.status !== 400) return null;
  const parsed = FinaliseIssuesSchema.safeParse(error.details);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

/** 503: the server changed nothing, so the same request can simply be sent again. */
export function isUnavailable(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 503;
}
