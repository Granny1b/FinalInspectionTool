import { SettingsSchema, type MachineModel } from '@modig/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './api';

/** App settings (machine models, company details). They change rarely and only by admins. */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async ({ signal }) =>
      (await apiFetch('/api/settings', { schema: SettingsSchema, signal })).data,
    staleTime: 5 * 60_000,
  });
}

/** "RigiMill MG" for "RMMG"; the code itself for a model no longer in the settings. */
export function modelName(models: readonly MachineModel[] | undefined, code: string): string {
  return models?.find((model) => model.code === code)?.name ?? code;
}
