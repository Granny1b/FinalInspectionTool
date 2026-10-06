/** SWA built-in auth endpoints (see staticwebapp.config.json). */
export function signOutUrl(): string {
  const back = `${window.location.origin}/login.html`;
  return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(back)}`;
}
