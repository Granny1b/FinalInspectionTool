/**
 * Settings (brief §5.6): machine models, company details and the pick lists (Responsible,
 * deviation categories), read by every page that offers them and edited by admins.
 *
 *   GET /api/settings  inspector  Settings + ETag
 *   PUT /api/settings  admin      If-Match, SettingsInput → Settings + ETag
 */
import { app } from '@azure/functions';
import { SettingsInputSchema, type Settings } from '@modig/shared';
import {
  endpoint,
  etagHeader,
  json,
  NotFoundError,
  PreconditionFailedError,
  readJsonBody,
  requireIfMatch,
} from '../lib/http';
import { loadStoredSettings, writeSettings } from '../lib/settings';

const notCreated = () => new NotFoundError('The settings have not been created yet: run the seed.');

export const getSettings = endpoint({ role: 'inspector' }, async () => {
  const stored = await loadStoredSettings();
  if (!stored) throw notCreated();
  return json(200, stored.data, etagHeader(stored.etag));
});

/** The whole editable part at once (the Settings page has one Save). */
export const saveSettings = endpoint({ role: 'admin' }, async (req, _context, user) => {
  const ifMatch = requireIfMatch(req);
  const input = await readJsonBody(req, SettingsInputSchema);
  const stored = await loadStoredSettings();
  if (!stored) throw notCreated();
  // Checked here as well as by the write, so an outdated page gets the 412 before anything else.
  if (stored.etag !== ifMatch) throw new PreconditionFailedError();
  const settings: Settings = {
    ...input,
    updatedAt: new Date().toISOString(),
    updatedBy: user.email,
  };
  const etag = await writeSettings(settings, ifMatch);
  return json(200, settings, etagHeader(etag));
});

// One function for both methods (keeps the registration count low).
app.http('settings', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'settings',
  handler: (req, context) => (req.method === 'PUT' ? saveSettings : getSettings)(req, context),
});
