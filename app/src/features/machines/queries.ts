/**
 * Server state for machines and their checks, all through apiFetch and the shared schemas. A
 * machine's checks are inspections: starting one, its own checklist and its update to a newer
 * template revision go through the inspection routes.
 */
import {
  InspectionSchema,
  MachineDetailSchema,
  MachineListSchema,
  MachinesFromInspectionsResultSchema,
  QualityCheckOrderSchema,
  type CreateMachineRequest,
  type Inspection,
  type MachineDetail,
  type Section,
  type StartCheckRequest,
  type TemplateUpdateRequest,
  type UpdateMachineRequest,
} from '@modig/shared';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiRequestError, type ApiResponse } from '../../lib/api';
import { inspectionKeys, type LoadedInspection } from '../inspections/queries';
import { templateKeys } from '../templates/queries';

export const machineKeys = {
  all: ['machines'] as const,
  list: ['machines', 'list'] as const,
  detail: (id: string) => ['machines', 'detail', id] as const,
  qualityOrder: (templateId: string) => ['templates', 'quality-check-order', templateId] as const,
};

const machinePath = (id: string) => `/api/machines/${encodeURIComponent(id)}`;
const inspectionPath = (id: string) => `/api/inspections/${encodeURIComponent(id)}`;

/** Writes give up after this long (SWA's gateway itself gives up at 45 s), as for inspections. */
const WRITE_TIMEOUT_MS = 30_000;

/** A machine with its checks and the ETag an edit or a delete must send back. */
export type LoadedMachine = { detail: MachineDetail; etag: string };

function withEtag<T>({ data, etag }: ApiResponse<T>, what: string): { data: T; etag: string } {
  if (!etag) {
    throw new ApiRequestError(500, {
      error: 'internal',
      message: `The server did not say which version of the ${what} this is.`,
    });
  }
  return { data, etag };
}

function loadedMachine(response: ApiResponse<MachineDetail>): LoadedMachine {
  const { data, etag } = withEtag(response, 'machine');
  return { detail: data, etag };
}

function loadedInspection(response: ApiResponse<Inspection>): LoadedInspection {
  const { data, etag } = withEtag(response, 'check');
  return { inspection: data, etag };
}

export function useMachines() {
  return useQuery({
    queryKey: machineKeys.list,
    queryFn: async ({ signal }) =>
      (await apiFetch('/api/machines', { schema: MachineListSchema, signal })).data,
  });
}

export async function fetchMachine(id: string, signal?: AbortSignal): Promise<LoadedMachine> {
  return loadedMachine(await apiFetch(machinePath(id), { schema: MachineDetailSchema, signal }));
}

/** One machine and its checks; idle while `id` is null. */
export function useMachine(id: string | null) {
  return useQuery({
    queryKey: machineKeys.detail(id ?? ''),
    queryFn: id === null ? skipToken : ({ signal }) => fetchMachine(id, signal),
  });
}

/**
 * Everything a machine's change can touch: the machines, the inspection lists (a check started or
 * linked), and Insights and the deviation log (which name machines).
 */
function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: machineKeys.all }),
    queryClient.invalidateQueries({ queryKey: inspectionKeys.list }),
    queryClient.invalidateQueries({ queryKey: ['insights'] }),
    queryClient.invalidateQueries({ queryKey: ['deviations', 'log'] }),
  ]);
}

export function useCreateMachine() {
  const queryClient = useQueryClient();
  return useMutation({
    // No client timeout: giving up on a create that went through would invite a second machine.
    mutationFn: async (request: CreateMachineRequest) =>
      loadedMachine(
        await apiFetch('/api/machines', {
          method: 'POST',
          body: request,
          schema: MachineDetailSchema,
        }),
      ),
    onSuccess: (created) => {
      queryClient.setQueryData(machineKeys.detail(created.detail.machine.id), created);
      return invalidateAll(queryClient);
    },
  });
}

/** A new Machine ID or serial number, for the version shown (`etag`). */
export function useUpdateMachine(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ request, etag }: { request: UpdateMachineRequest; etag: string }) =>
      loadedMachine(
        await apiFetch(machinePath(id), {
          method: 'PUT',
          body: request,
          ifMatch: etag,
          schema: MachineDetailSchema,
          signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(machineKeys.detail(id), updated);
      return invalidateAll(queryClient);
    },
  });
}

/** Deletes a machine nobody has started a check on (admins). Gone already counts as done. */
export function useDeleteMachine(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (etag: string) => {
      await apiFetch(machinePath(id), {
        method: 'DELETE',
        ifMatch: etag,
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      }).catch((error: unknown) => {
        if (!(error instanceof ApiRequestError && error.status === 404)) throw error;
      });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: machineKeys.detail(id) });
      return invalidateAll(queryClient);
    },
  });
}

/** Another check on the machine, copied from the template's latest published revision. */
export function useAddCheck(machineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) =>
      loadedMachine(
        await apiFetch(`${machinePath(machineId)}/checks`, {
          method: 'POST',
          body: { templateId },
          schema: MachineDetailSchema,
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(machineKeys.detail(machineId), updated);
      return invalidateAll(queryClient);
    },
  });
}

/**
 * Removes a check nobody has started from its machine (admins): deletes it, as the version stored
 * now (read first: the machine's page has no ETag of it).
 */
export function useRemoveCheck(machineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { etag } = await apiFetch(inspectionPath(id), { schema: InspectionSchema });
      await apiFetch(inspectionPath(id), {
        method: 'DELETE',
        ifMatch: etag ?? '',
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
      });
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: machineKeys.detail(machineId) }),
        invalidateAll(queryClient),
      ]),
  });
}

/**
 * Starts a machine's check: its number, today's date and Checked by. Opens straight from the
 * answer (the check's page starts from it instead of loading it again).
 */
export function useStartCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, request }: { id: string; request: StartCheckRequest }) =>
      loadedInspection(
        await apiFetch(`${inspectionPath(id)}/start`, {
          method: 'POST',
          body: request,
          schema: InspectionSchema,
        }),
      ),
    onSuccess: (started) => {
      queryClient.setQueryData(inspectionKeys.detail(started.inspection.id), started);
      return invalidateAll(queryClient);
    },
  });
}

/** The one-time action (admins): machines for the inspections done before machines existed. */
export function useMachinesFromInspections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await apiFetch('/api/machines/from-inspections', {
          method: 'POST',
          schema: MachinesFromInspectionsResultSchema,
        })
      ).data,
    onSuccess: () => invalidateAll(queryClient),
  });
}

/** PUT of a machine's check's own checklist (admins; the checklist editor's autosave). */
export async function saveChecklist(
  id: string,
  sections: Section[],
  ifMatch: string,
): Promise<LoadedInspection> {
  return loadedInspection(
    await apiFetch(`${inspectionPath(id)}/checklist`, {
      method: 'PUT',
      body: { sections },
      ifMatch,
      schema: InspectionSchema,
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    }),
  );
}

/** Brings a machine's check up to a newer revision of its template, as previewed (admins). */
export function useUpdateToTemplate(machineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      request,
      etag,
    }: {
      id: string;
      request: TemplateUpdateRequest;
      etag: string;
    }) =>
      loadedInspection(
        await apiFetch(`${inspectionPath(id)}/template-update`, {
          method: 'POST',
          body: request,
          ifMatch: etag,
          schema: InspectionSchema,
          signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
        }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: machineKeys.detail(machineId) }),
        invalidateAll(queryClient),
      ]),
  });
}

/** Links an inspection to a machine, or unlinks it (null), for the version given (admins). */
export async function linkInspection(
  id: string,
  machineRef: string | null,
  ifMatch: string,
): Promise<LoadedInspection> {
  return loadedInspection(
    await apiFetch(`${inspectionPath(id)}/machine`, {
      method: 'PUT',
      body: { machineRef },
      ifMatch,
      schema: InspectionSchema,
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    }),
  );
}

/** linkInspection, then everything that shows machines and inspections is loaded again. */
export function useLinkInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      machineRef,
      etag,
    }: {
      id: string;
      machineRef: string | null;
      /** The version shown; left out from the machine page, which reads it first. */
      etag?: string;
    }) => {
      const ifMatch =
        etag ?? (await apiFetch(inspectionPath(id), { schema: InspectionSchema })).etag ?? '';
      return linkInspection(id, machineRef, ifMatch);
    },
    onSuccess: () => invalidateAll(queryClient),
  });
}

/** A machine model's quality check order with its ETag (null before one was saved). */
export type LoadedOrder = { order: string[]; etag: string | null };

export function useQualityCheckOrder(templateId: string) {
  return useQuery({
    queryKey: machineKeys.qualityOrder(templateId),
    queryFn: async ({ signal }): Promise<LoadedOrder> => {
      const { data, etag } = await apiFetch(
        `/api/templates/${encodeURIComponent(templateId)}/quality-check-order`,
        { schema: QualityCheckOrderSchema, signal },
      );
      return { order: data.order, etag };
    },
  });
}

/** Saves a new order over the version shown (the first one with If-None-Match: *). */
export function useSaveQualityCheckOrder(templateId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ order, etag }: LoadedOrder): Promise<LoadedOrder> => {
      const response = await apiFetch(
        `/api/templates/${encodeURIComponent(templateId)}/quality-check-order`,
        {
          method: 'PUT',
          body: { order },
          ...(etag ? { ifMatch: etag } : { ifNoneMatch: '*' as const }),
          schema: QualityCheckOrderSchema,
          signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
        },
      );
      return { order: response.data.order, etag: response.etag };
    },
    // Shown at once, while it is saved; the list's positions follow.
    onMutate: ({ order }) => {
      const key = machineKeys.qualityOrder(templateId);
      const previous = queryClient.getQueryData<LoadedOrder>(key);
      queryClient.setQueryData<LoadedOrder>(key, (current) => ({
        order,
        etag: current?.etag ?? null,
      }));
      return { previous };
    },
    onError: (_error, _order, context) => {
      if (context?.previous) {
        queryClient.setQueryData(machineKeys.qualityOrder(templateId), context.previous);
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(machineKeys.qualityOrder(templateId), saved);
      return queryClient.invalidateQueries({ queryKey: templateKeys.list });
    },
  });
}
