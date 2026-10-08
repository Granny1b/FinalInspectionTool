/** GET /api/settings — machine models and company details, e.g. for the template model picker. */
import { app } from '@azure/functions';
import { endpoint, json, NotFoundError } from '../lib/http';
import { loadSettings } from '../lib/settings';

export const getSettings = endpoint({ role: 'inspector' }, async () => {
  const settings = await loadSettings();
  if (!settings) throw new NotFoundError('The settings have not been created yet: run the seed.');
  return json(200, settings);
});

app.http('settings', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'settings',
  handler: getSettings,
});
