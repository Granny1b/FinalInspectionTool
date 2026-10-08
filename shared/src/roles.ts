/**
 * App roles, assigned through Azure Static Web Apps role invitations.
 * `admin` is a superset of `inspector`.
 */
export const ROLES = ['inspector', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Keep only the roles this app knows about (drops SWA's built-in `anonymous` / `authenticated`). */
export function appRoles(roles: readonly string[]): Role[] {
  return ROLES.filter((role) => roles.includes(role));
}

/** True if the user may act as `role`. Admins can do everything inspectors can. */
export function hasRole(roles: readonly string[], role: Role): boolean {
  if (roles.includes('admin')) return true;
  return roles.includes(role);
}
