/**
 * The people list (Settings → Users & access, see lib/people.ts) and the names to show people by.
 *
 *   GET /api/users   admin      People + ETag; { people: [] } and no ETag before anyone was added
 *   PUT /api/users   admin      If-Match (If-None-Match: * for the first list), PeopleInput
 *                               → People + ETag
 *   GET /api/people  inspector  PeopleDirectory: the name of everyone on the list, by email
 */
import { app, type HttpRequest } from '@azure/functions';
import {
  hasRole,
  PeopleInputSchema,
  type People,
  type PeopleDirectory,
  type PeopleInput,
} from '@modig/shared';
import { listedPerson, rolesOf, type User } from '../lib/auth';
import {
  BadRequestError,
  ConflictError,
  endpoint,
  etagHeader,
  json,
  PreconditionFailedError,
  readJsonBody,
  requireIfMatch,
} from '../lib/http';
import {
  cachedPeople,
  loadStoredPeople,
  writePeople,
  type PeopleWriteCondition,
} from '../lib/people';

export const getUsers = endpoint({ role: 'admin' }, async () => {
  const stored = await loadStoredPeople();
  if (!stored) return json(200, { people: [] });
  return json(200, stored.data, etagHeader(stored.etag));
});

/** Replaces the list. addedAt/addedBy are kept for people already on it, set for new ones. */
export const saveUsers = endpoint({ role: 'admin' }, async (req, _context, user) => {
  const condition = writeCondition(req);
  const input = await readJsonBody(req, PeopleInputSchema);

  const stored = await loadStoredPeople();
  // Checked here as well as by the write, so a stale list gets the 412, not a lockout message.
  const current = 'ifMatch' in condition ? stored?.etag === condition.ifMatch : !stored;
  if (!current) throw new PreconditionFailedError();
  const problem = lockoutProblem(input, user);
  if (problem) throw new BadRequestError(problem);

  const now = new Date().toISOString();
  const before = new Map(stored?.data.people.map((person) => [person.email, person]));
  const people: People = {
    people: input.people.map((person) => {
      const existing = before.get(person.email);
      return {
        ...person,
        addedAt: existing?.addedAt ?? now,
        addedBy: existing?.addedBy ?? user.email,
      };
    }),
    updatedAt: now,
    updatedBy: user.email,
  };
  try {
    return json(200, people, etagHeader(await writePeople(people, condition)));
  } catch (error) {
    // Another admin saved the first list in between: the same conflict as a changed ETag.
    if (error instanceof ConflictError) throw new PreconditionFailedError();
    throw error;
  }
});

export const getPeople = endpoint({ role: 'inspector' }, async () => {
  // endpoint() has just read the list for the caller, so this is the cached copy.
  const directory: PeopleDirectory = (await cachedPeople()).map(({ email, name }) => ({
    email,
    name,
  }));
  return json(200, directory);
});

/** If-Match with the version read, or If-None-Match: * when there was no list to read. */
function writeCondition(req: HttpRequest): PeopleWriteCondition {
  const ifNoneMatch = req.headers.get('if-none-match')?.trim();
  if (!ifNoneMatch) return { ifMatch: requireIfMatch(req) };
  if (req.headers.has('if-match')) {
    throw new BadRequestError('Send either If-Match or If-None-Match, not both.');
  }
  if (ifNoneMatch !== '*') {
    throw new BadRequestError('If-None-Match must be "*": it is only for saving the first list.');
  }
  return { ifNoneMatch: '*' };
}

/**
 * Why saving `input` would lock admins out, or null. The caller must stay an admin (by their
 * role on the list, or by their invitation when the list leaves them off), and a list with
 * people on it needs an admin: otherwise only invited admins could ever change it again.
 */
export function lockoutProblem(input: PeopleInput, caller: User): string | null {
  const own = listedPerson(input.people, caller);
  if (!hasRole(rolesOf(own, caller.invitedRoles), 'admin')) {
    return own
      ? "You can't take away your own admin role. Ask another admin to change it."
      : "You can't remove yourself: you would lose your admin access. Ask another admin to do it.";
  }
  if (input.people.length > 0 && !input.people.some((person) => person.role === 'admin')) {
    return 'The list needs at least one admin. Add yourself as an admin first.';
  }
  return null;
}

// One function per route; the methods share it (keeps the registration count low).
app.http('users', {
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  route: 'users',
  handler: (req, context) => (req.method === 'PUT' ? saveUsers : getUsers)(req, context),
});

app.http('people', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'people',
  handler: getPeople,
});
