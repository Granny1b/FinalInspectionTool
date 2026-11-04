/**
 * `config/settings.json` (brief §5.6): machine models, company details and the pick lists
 * (responsibles, deviation categories). Created by the seed, then edited by admins.
 */
import {
  blobNames,
  CONTAINERS,
  SettingsSchema,
  type MachineModel,
  type Settings,
} from '@modig/shared';
import { ConflictError, PreconditionFailedError, ServiceUnavailableError } from './http';
import { readJson, writeJson } from './storage';

/** Null until the seed has created them. */
export async function loadSettings(): Promise<Settings | null> {
  return (await loadStoredSettings())?.data ?? null;
}

/** The settings with their blob ETag (for conditional writes), or null before the seed. */
export async function loadStoredSettings(): Promise<{ data: Settings; etag: string } | null> {
  return readJson(CONTAINERS.config, blobNames.settings, SettingsSchema);
}

/** Writes the settings if they are still version `ifMatch` (412 otherwise); returns the ETag. */
export async function writeSettings(settings: Settings, ifMatch: string): Promise<string> {
  return writeJson(CONTAINERS.config, blobNames.settings, SettingsSchema.parse(settings), {
    ifMatch,
  });
}

/** Tries after the first when another write got in between (a 412); then 503. */
const RETRIES = 3;

/**
 * Applies `change` to the latest settings and writes them conditionally, reading again if
 * another write got in between: for server-side changes that must not overwrite an admin's edit
 * (a machine model added while creating a template). `change` returns null to write nothing.
 * Throws a 409 when there are no settings yet (run the seed).
 */
export async function updateSettings(
  change: (settings: Settings) => Settings | null,
  by: string,
): Promise<Settings> {
  for (let attempt = 0; ; attempt++) {
    const stored = await loadStoredSettings();
    if (!stored) throw new ConflictError('The settings have not been created yet: run the seed.');
    const next = change(stored.data);
    if (!next) return stored.data;
    const updated = { ...next, updatedAt: new Date().toISOString(), updatedBy: by };
    try {
      await writeSettings(updated, stored.etag);
      return updated;
    } catch (error) {
      if (!(error instanceof PreconditionFailedError) || attempt === RETRIES) {
        if (error instanceof PreconditionFailedError) {
          throw new ServiceUnavailableError('The settings are being changed. Try again.');
        }
        throw error;
      }
    }
  }
}

/** Adds a machine model to the settings unless its code is already there. */
export async function addMachineModel(model: MachineModel, by: string): Promise<Settings> {
  return updateSettings(
    (settings) =>
      settings.machineModels.some((existing) => existing.code === model.code)
        ? null
        : { ...settings, machineModels: [...settings.machineModels, model] },
    by,
  );
}
