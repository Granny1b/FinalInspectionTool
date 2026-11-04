import {
  SettingsSchema,
  type MachineModel,
  type Settings,
  type SettingsInput,
} from '@modig/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiRequestError, type ApiResponse } from './api';

export const settingsKeys = {
  settings: ['settings'] as const,
  /** With the ETag, for the Settings page. */
  stored: ['settings', 'stored'] as const,
};

/**
 * App settings (machine models, company details, the Responsible and category lists). They
 * change rarely and only by admins.
 */
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.settings,
    queryFn: async ({ signal }) =>
      (await apiFetch('/api/settings', { schema: SettingsSchema, signal })).data,
    staleTime: 5 * 60_000,
  });
}

/** "RigiMill MG" for "RMMG"; the code itself for a model no longer in the settings. */
export function modelName(models: readonly MachineModel[] | undefined, code: string): string {
  return models?.find((model) => model.code === code)?.name ?? code;
}

/** The settings with the ETag a save must send back. */
export type LoadedSettings = { settings: Settings; etag: string };

/** A save gives up after this long (SWA's gateway itself gives up at 45 s), as for templates. */
const WRITE_TIMEOUT_MS = 30_000;

function withEtag({ data, etag }: ApiResponse<Settings>): LoadedSettings {
  // The API sends one with the settings; without it no save could ever succeed.
  if (!etag) {
    throw new ApiRequestError(500, {
      error: 'internal',
      message: 'The server did not say which version of the settings these are.',
    });
  }
  return { settings: data, etag };
}

export async function fetchStoredSettings(signal?: AbortSignal): Promise<LoadedSettings> {
  return withEtag(await apiFetch('/api/settings', { schema: SettingsSchema, signal }));
}

/**
 * The settings for editing. The page copies them into its form when it opens, so every visit
 * loads afresh: a cached copy could carry an ETag a save has since replaced.
 */
export function useStoredSettings() {
  return useQuery({
    queryKey: settingsKeys.stored,
    queryFn: ({ signal }) => fetchStoredSettings(signal),
    gcTime: 0,
  });
}

/** PUT of every editable field (admins); 412 if someone else saved since `ifMatch`. */
export async function saveSettings(input: SettingsInput, ifMatch: string): Promise<LoadedSettings> {
  return withEtag(
    await apiFetch('/api/settings', {
      method: 'PUT',
      body: input,
      ifMatch,
      schema: SettingsSchema,
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    }),
  );
}
