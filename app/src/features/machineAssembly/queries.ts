/**
 * Server state for a machine's assemblies: the assembly instructions bound to it and the
 * sign-offs of their steps.
 */
import {
  MachineAssemblyDetailSchema,
  MachineAssemblyListSchema,
  type MachineAssemblyDetail,
} from '@modig/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';

export const machineAssemblyKeys = {
  list: (machineId: string) => ['machines', 'assemblies', machineId] as const,
  detail: (machineId: string, id: string) => ['machines', 'assemblies', machineId, id] as const,
};

const base = (machineId: string) => `/api/machines/${encodeURIComponent(machineId)}/assemblies`;
const path = (machineId: string, id: string) => `${base(machineId)}/${encodeURIComponent(id)}`;

/** Others sign on other screens: what is shown is brought up to date this often. */
const REFRESH_MS = 20_000;

export function machineAssemblyHref(machineId: string, id: string): string {
  return `/machines/${machineId}/assembly/${id}`;
}

/** The machine's assemblies with how far each has come. */
export function useMachineAssemblies(machineId: string) {
  return useQuery({
    queryKey: machineAssemblyKeys.list(machineId),
    queryFn: async ({ signal }) =>
      (await apiFetch(base(machineId), { schema: MachineAssemblyListSchema, signal })).data,
  });
}

/** One assembly with its sign-offs, kept up to date while it is open. */
export function useMachineAssembly(machineId: string, id: string) {
  return useQuery({
    queryKey: machineAssemblyKeys.detail(machineId, id),
    queryFn: async ({ signal }) =>
      (await apiFetch(path(machineId, id), { schema: MachineAssemblyDetailSchema, signal })).data,
    refetchInterval: REFRESH_MS,
  });
}

/** Binds an assembly instruction to the machine. */
export function useAddMachineAssembly(machineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) =>
      (
        await apiFetch(base(machineId), {
          method: 'POST',
          body: { templateId },
          schema: MachineAssemblyDetailSchema,
        })
      ).data,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: machineAssemblyKeys.list(machineId) }),
  });
}

export function useRemoveMachineAssembly(machineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(path(machineId, id), { method: 'DELETE' });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: machineAssemblyKeys.list(machineId) }),
  });
}

type Action =
  | { action: 'sign'; itemIds: string[]; initials: string }
  | { action: 'unsign'; itemIds: string[] }
  | { action: 'update' };

/**
 * Signs steps, takes sign-offs back, or updates the copy to the latest revision. The answer is
 * the assembly as it now is, everyone's sign-offs included, and replaces what is shown.
 */
export function useMachineAssemblyAction(machineId: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, ...body }: Action): Promise<MachineAssemblyDetail> =>
      (
        await apiFetch(`${path(machineId, id)}/${action}`, {
          method: 'POST',
          body,
          schema: MachineAssemblyDetailSchema,
        })
      ).data,
    onSuccess: (detail) => {
      queryClient.setQueryData(machineAssemblyKeys.detail(machineId, id), detail);
      void queryClient.invalidateQueries({
        queryKey: machineAssemblyKeys.list(machineId),
        exact: true,
      });
    },
  });
}
