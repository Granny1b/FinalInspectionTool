/** Pre-login pages and SWA built-in auth endpoints (see public/staticwebapp.config.json). */
export const LOGIN_PAGE = '/login.html';
export const FORBIDDEN_PAGE = '/forbidden.html';

export function signOutUrl(): string {
  const back = `${window.location.origin}${LOGIN_PAGE}`;
  return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(back)}`;
}
