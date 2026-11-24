/** Server state for change requests: flagging a step, and the admins' list of them. */
import {
  ChangeRequestListSchema,
  ChangeRequestSchema,
  ChangeRequestSummarySchema,
  type CreateChangeRequest,
  type UpdateChangeRequest,
} from '@modig/shared';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

export const changeRequestKeys = {
  all: ['change-requests'] as const,
  list: ['change-requests', 'list'] as const,
  summary: ['change-requests', 'summary'] as const,
};

/** New requests come from other people: the admins' count and list are refreshed this often. */
const REFRESH_MS = 60_000;
/** The sidebar's count is on every page an admin has open, so it asks less often. */
const COUNT_REFRESH_MS = 5 * 60_000;

/** Flags a step of an assembly instruction (everyone signed in). */
export function useFlagStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: CreateChangeRequest) =>
      (
        await apiFetch('/api/change-requests', {
          method: 'POST',
          body: request,
          schema: ChangeRequestSchema,
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: changeRequestKeys.all }),
  });
}

/** Every change request, open first (admins). */
export function useChangeRequests() {
  return useQuery({
    queryKey: changeRequestKeys.list,
    queryFn: async ({ signal }) =>
      (await apiFetch('/api/change-requests', { schema: ChangeRequestListSchema, signal })).data,
    refetchInterval: REFRESH_MS,
  });
}

/** How many are open, for the sidebar; idle for those who are no admin. */
export function useOpenChangeRequests(enabled: boolean) {
  return useQuery({
    queryKey: changeRequestKeys.summary,
    queryFn: enabled
      ? async ({ signal }) =>
          (
            await apiFetch('/api/change-requests/summary', {
              schema: ChangeRequestSummarySchema,
              signal,
            })
          ).data.open
      : skipToken,
    refetchInterval: COUNT_REFRESH_MS,
  });
}

/** Marks a request fixed or open again, or deletes it (admins). */
export function useChangeRequestAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: { id: string } & ({ delete: true } | UpdateChangeRequest)) => {
      const path = `/api/change-requests/${encodeURIComponent(action.id)}`;
      if ('delete' in action) await apiFetch(path, { method: 'DELETE' });
      else {
        const { id: _id, ...body } = action;
        await apiFetch(path, { method: 'POST', body, schema: ChangeRequestSchema });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: changeRequestKeys.all }),
  });
}
