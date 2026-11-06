/**
 * Server state for the deviation log and the follow-up of deviations (shared/src/deviationLog.ts):
 * the log of one kind, an inspection's follow-ups, and closing or reopening a deviation, which
 * shows at once (optimistically) in both and is taken back if the server refuses it.
 */
import {
  deviationLogParams,
  DeviationLogSchema,
  FollowUpSchema,
  FollowUpsSchema,
  type DeviationLog,
  type DeviationLogQuery,
  type FollowUp,
  type FollowUpRequest,
  type FollowUps,
  type InspectionKind,
} from '@modig/shared';
import { useMutation, useMutationState, useQueryClient, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiDownload, apiFetch } from '../../lib/api';

export const deviationLogKeys = {
  /** Everything here: a follow-up changes the log and the inspection's follow-ups alike. */
  all: ['deviations'] as const,
  log: (kind: InspectionKind) => ['deviations', 'log', kind] as const,
  followUps: (inspectionId: string) => ['deviations', 'follow-ups', inspectionId] as const,
};

const FOLLOW_UP_KEY = ['deviations', 'follow-up'] as const;

/** A write gives up after this long (SWA's gateway itself gives up at 45 s), as saves do. */
const WRITE_TIMEOUT_MS = 30_000;

const followUpsPath = (inspectionId: string) =>
  `/api/inspections/${encodeURIComponent(inspectionId)}/follow-ups`;

/**
 * Every deviation of one kind, open and closed: the page filters them itself, so a search or a
 * filter shows at once, and its summary counts what the status filter leaves out. Fetched again
 * whenever the page opens (inspections change the log too).
 */
export function useDeviationLog(kind: InspectionKind) {
  return useQuery({
    queryKey: deviationLogKeys.log(kind),
    queryFn: async ({ signal }) => {
      const search = new URLSearchParams(deviationLogParams({ kind, status: 'all' })).toString();
      return (await apiFetch(`/api/deviations?${search}`, { schema: DeviationLogSchema, signal }))
        .data;
    },
  });
}

/**
 * Which of an inspection's deviations are closed, and how (its Deviations tab): asked for once
 * the tab is shown (`enabled`).
 */
export function useFollowUps(inspectionId: string, enabled = true) {
  return useQuery({
    queryKey: deviationLogKeys.followUps(inspectionId),
    queryFn: async ({ signal }) =>
      (await apiFetch(followUpsPath(inspectionId), { schema: FollowUpsSchema, signal })).data,
    enabled,
  });
}

/** One follow-up to send: which deviation, and what to set. */
export type FollowUpChange = {
  inspectionId: string;
  kind: InspectionKind;
  key: string;
  request: FollowUpRequest;
  /** Runs first; false stops the change (the inspection page saves pending edits first). */
  prepare?: () => Promise<boolean>;
};

type Snapshot = { log?: DeviationLog; followUps?: FollowUps };

/**
 * PUT …/follow-ups/{key}. The change shows in the log and on the inspection's Deviations tab as
 * soon as it is sent; if it fails, both go back to what they were and the error is the caller's
 * to show. Afterwards both are fetched again, so they show what the server stored (its date and
 * name for a close that left them to it).
 */
export function useSetFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: FOLLOW_UP_KEY,
    mutationFn: async ({ inspectionId, key, request, prepare }: FollowUpChange) => {
      if (prepare && !(await prepare())) {
        throw new Error('Your latest changes couldn’t be saved first. Try again.');
      }
      return (
        await apiFetch(`${followUpsPath(inspectionId)}/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: request,
          schema: FollowUpSchema,
          signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
        })
      ).data;
    },
    onMutate: async ({ inspectionId, kind, key, request }): Promise<Snapshot> => {
      const logKey = deviationLogKeys.log(kind);
      const followUpsKey = deviationLogKeys.followUps(inspectionId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: logKey }),
        queryClient.cancelQueries({ queryKey: followUpsKey }),
      ]);
      const snapshot: Snapshot = {
        log: queryClient.getQueryData<DeviationLog>(logKey),
        followUps: queryClient.getQueryData<FollowUps>(followUpsKey),
      };
      const current = snapshot.followUps?.followUps[key];
      const shown = expected(current, request);
      queryClient.setQueryData<DeviationLog>(logKey, (log) =>
        log
          ? {
              ...log,
              entries: log.entries.map((entry) =>
                entry.inspectionId === inspectionId && entry.key === key
                  ? { ...entry, ...shownFields(entry, request) }
                  : entry,
              ),
            }
          : log,
      );
      queryClient.setQueryData<FollowUps>(followUpsKey, (followUps) =>
        followUps
          ? { ...followUps, followUps: { ...followUps.followUps, [key]: shown } }
          : followUps,
      );
      return snapshot;
    },
    onError: (_error, { inspectionId, kind }, snapshot) => {
      if (!snapshot) return;
      queryClient.setQueryData(deviationLogKeys.log(kind), snapshot.log);
      queryClient.setQueryData(deviationLogKeys.followUps(inspectionId), snapshot.followUps);
    },
    onSuccess: (followUp, { inspectionId, key }) => {
      queryClient.setQueryData<FollowUps>(deviationLogKeys.followUps(inspectionId), (followUps) =>
        followUps
          ? { ...followUps, followUps: { ...followUps.followUps, [key]: followUp } }
          : followUps,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: deviationLogKeys.all }),
  });
}

/** What a follow-up will be once the server has it, as far as the page can tell. */
function expected(current: FollowUp | undefined, request: FollowUpRequest): FollowUp {
  const now = new Date().toISOString();
  const action = request.action ?? current?.action ?? '';
  if (request.status === 'open') {
    return { status: 'open', action, closedOn: '', closedBy: '', updatedAt: now, updatedBy: '' };
  }
  return {
    status: 'closed',
    action,
    closedOn: request.closedOn ?? current?.closedOn ?? '',
    closedBy: request.closedBy ?? current?.closedBy ?? '',
    updatedAt: now,
    updatedBy: '',
  };
}

function shownFields(
  entry: { action: string; closedOn: string; closedBy: string },
  request: FollowUpRequest,
) {
  const action = request.action ?? entry.action;
  return request.status === 'open'
    ? { status: 'open' as const, action, closedOn: '', closedBy: '' }
    : {
        status: 'closed' as const,
        action,
        closedOn: request.closedOn ?? entry.closedOn,
        closedBy: request.closedBy ?? entry.closedBy,
      };
}

/**
 * The deviations being followed up right now, as `{inspectionId}/{key}`: they say "Saving…". The
 * same set while they stay the same, for memoised components.
 */
export function usePendingFollowUps(): ReadonlySet<string> {
  const pending = useMutationState({
    filters: { mutationKey: FOLLOW_UP_KEY, status: 'pending' },
    select: (mutation) => mutation.state.variables as FollowUpChange | undefined,
  });
  const keys = pending
    .flatMap((change) => (change ? [`${change.inspectionId}/${change.key}`] : []))
    .sort()
    .join('\n');
  return useMemo(() => new Set(keys ? keys.split('\n') : []), [keys]);
}

/** Saves the log under these filters as a CSV file, named by the API after them. */
export async function downloadDeviationLog(query: DeviationLogQuery): Promise<void> {
  const search = new URLSearchParams(deviationLogParams(query)).toString();
  const { blob, fileName } = await apiDownload(`/api/deviations/export.csv?${search}`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName ?? 'Deviations.csv';
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started from the URL by then; a moment later it can go.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
