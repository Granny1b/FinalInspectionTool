/** GET /api/me — who the signed-in user is, so the app can show their name and role-gated UI. */
import { app } from '@azure/functions';
import { MeSchema } from '@modig/shared';
import { endpoint, json } from '../lib/http';

export const getMe = endpoint({ role: 'inspector' }, async (_req, _context, user) =>
  json(200, MeSchema.parse({ name: user.name, email: user.email, roles: user.roles })),
);

// 'anonymous' = no function keys: SWA authenticates the user and endpoint() checks the role.
app.http('me', { methods: ['GET'], authLevel: 'anonymous', route: 'me', handler: getMe });
