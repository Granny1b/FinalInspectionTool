/**
 * GET /api/me — who the signed-in user is, so the app can show their name and role-gated UI:
 * name and role from the people list, else the invitation's roles and a name from the email. A
 * sign-in without any role gets a 403 with NO_ACCESS_MESSAGE, which sends the app to its
 * no-access page.
 */
import { app } from '@azure/functions';
import { MeSchema } from '@modig/shared';
import { endpoint, json } from '../lib/http';

export const getMe = endpoint({ role: 'inspector' }, async (_req, _context, user) =>
  json(200, MeSchema.parse({ name: user.name, email: user.email, roles: user.roles })),
);

// 'anonymous' = no function keys: SWA authenticates the user and endpoint() checks the role.
app.http('me', { methods: ['GET'], authLevel: 'anonymous', route: 'me', handler: getMe });
