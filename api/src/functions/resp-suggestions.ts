/** GET /api/resp-suggestions — "Resp" values used before, for the autocomplete (brief §4). */
import { app } from '@azure/functions';
import { loadRespSuggestions } from '../lib/deviations';
import { endpoint, json } from '../lib/http';

export const getRespSuggestions = endpoint({ role: 'inspector' }, async () =>
  json(200, await loadRespSuggestions()),
);

app.http('respSuggestions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'resp-suggestions',
  handler: getRespSuggestions,
});
