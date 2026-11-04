/**
 * Who is calling. Azure Static Web Apps authenticates the user and forwards the identity to the
 * managed functions as `x-ms-client-principal`: base64-encoded JSON
 * `{ identityProvider, userId, userDetails, userRoles }` (no claims). SWA replaces any value the
 * client sends, so in Azure the header can be trusted. Locally, only requests through the SWA CLI
 * (:4280) are trustworthy — the Functions host (:7071) accepts any forged header.
 *
 * The caller's role and name come from the people list (lib/people.ts), matched on the sign-in's
 * email; someone not on it keeps the roles of their Static Web Apps role invitation, if any.
 */
import type { HttpRequest } from '@azure/functions';
import { appRoles, type Person, type Role } from '@modig/shared';
import { z } from 'zod';
import { cachedPeople } from './people';

export const CLIENT_PRINCIPAL_HEADER = 'x-ms-client-principal';

const ClientPrincipalSchema = z.object({
  identityProvider: z.string().min(1),
  userId: z.string().min(1),
  /** For Entra ID this is the user's email / UPN. */
  userDetails: z.string().min(1),
  /** Includes SWA's built-in `anonymous` / `authenticated` next to invited roles. */
  userRoles: z.array(z.string()),
});
export type ClientPrincipal = z.infer<typeof ClientPrincipalSchema>;

export type User = {
  /** Lowercased: `userId` changes when a user is re-invited, so anything per-user keys on this. */
  email: string;
  /** The name on the people list, else one made from the email. */
  name: string;
  /** App roles: the person's role on the people list, else `invitedRoles`. */
  roles: Role[];
  /** App roles from Static Web Apps role invitations; built-in roles grant nothing. */
  invitedRoles: Role[];
  userId: string;
  identityProvider: string;
};

/** Decodes the header. Returns null for a missing or malformed value — never throws. */
export function parseClientPrincipal(
  headerValue: string | null | undefined,
): ClientPrincipal | null {
  if (!headerValue) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf8'));
  } catch {
    return null;
  }
  const result = ClientPrincipalSchema.safeParse(json);
  return result.success ? result.data : null;
}

/** The caller, or null without a (valid) principal. Reads the people list (cached briefly). */
export async function getUser(req: HttpRequest): Promise<User | null> {
  const principal = parseClientPrincipal(req.headers.get(CLIENT_PRINCIPAL_HEADER));
  if (!principal) return null;
  return resolveUser(principal, await cachedPeople());
}

export function resolveUser(principal: ClientPrincipal, people: readonly Person[]): User {
  const email = principal.userDetails.trim().toLowerCase();
  const { identityProvider } = principal;
  // SWA treats role names case-insensitively, so an invite for "Admin" must still count here.
  const invitedRoles = appRoles(principal.userRoles.map((role) => role.toLowerCase()));
  const person = listedPerson(people, { email, identityProvider });
  return {
    email,
    name: person?.name ?? nameFromEmail(email),
    roles: rolesOf(person, invitedRoles),
    invitedRoles,
    userId: principal.userId,
    identityProvider,
  };
}

/**
 * The caller's entry on the people list. Only Microsoft sign-ins are matched: their
 * `userDetails` is the account's email (a work account's UPN). The route rules switch the other
 * providers off; were one ever back, its `userDetails` would be a user name anyone could pick.
 */
export function listedPerson<P extends Pick<Person, 'email'>>(
  people: readonly P[],
  caller: Pick<User, 'email' | 'identityProvider'>,
): P | undefined {
  if (caller.identityProvider !== 'aad') return undefined;
  return people.find((person) => person.email === caller.email);
}

/** A person's role on the list replaces their invitation's roles; off the list, those count. */
export function rolesOf(person: Pick<Person, 'role'> | undefined, invitedRoles: Role[]): Role[] {
  return person ? [person.role] : invitedRoles;
}

/**
 * SWA gives us no display name, only the email. "sam.andersson@modig.se" → "Sam Andersson".
 * A local part without separators is kept as-is; a value without "@" is returned unchanged.
 */
export function nameFromEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const local = at > 0 ? email.slice(0, at) : '';
  if (!local) return email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length < 2) return local;
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
