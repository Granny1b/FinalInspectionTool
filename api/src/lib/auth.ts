/**
 * Who is calling. Azure Static Web Apps authenticates the user and forwards the identity to the
 * managed functions as `x-ms-client-principal`: base64-encoded JSON
 * `{ identityProvider, userId, userDetails, userRoles }` (no claims). SWA replaces any value the
 * client sends, so in Azure the header can be trusted. Locally, only requests through the SWA CLI
 * (:4280) are trustworthy — the Functions host (:7071) accepts any forged header.
 */
import type { HttpRequest } from '@azure/functions';
import { appRoles, type Role } from '@modig/shared';
import { z } from 'zod';

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
  name: string;
  /** App roles only; built-in roles grant nothing. */
  roles: Role[];
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

export function getUser(req: HttpRequest): User | null {
  const principal = parseClientPrincipal(req.headers.get(CLIENT_PRINCIPAL_HEADER));
  if (!principal) return null;
  const email = principal.userDetails.trim().toLowerCase();
  return {
    email,
    name: nameFromEmail(email),
    // SWA treats role names case-insensitively, so an invite for "Admin" must still count here.
    roles: appRoles(principal.userRoles.map((role) => role.toLowerCase())),
    userId: principal.userId,
    identityProvider: principal.identityProvider,
  };
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
