/** `config/settings.json` (brief §5.6): machine models and company details, made by the seed. */
import { blobNames, CONTAINERS, SettingsSchema, type Settings } from '@modig/shared';
import { readJson } from './storage';

/** Null until the seed has created them. */
export async function loadSettings(): Promise<Settings | null> {
  const stored = await readJson(CONTAINERS.config, blobNames.settings, SettingsSchema);
  return stored?.data ?? null;
}
