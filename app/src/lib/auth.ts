/** Pre-login pages and SWA built-in auth endpoints (see public/staticwebapp.config.json). */
export const LOGIN_PAGE = '/login.html';
export const FORBIDDEN_PAGE = '/forbidden.html';

/**
 * Relative return path on purpose: the SWA CLI builds the redirect as origin + this value, so an
 * absolute URL would become "http://hosthttp://host/login.html" locally.
 */
export function signOutUrl(): string {
  return `/.auth/logout?post_logout_redirect_uri=${LOGIN_PAGE}`;
}
