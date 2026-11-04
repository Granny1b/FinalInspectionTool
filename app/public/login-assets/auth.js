// Behaviour for the pre-login pages (login.html, forbidden.html). Plain JS without a bundler:
// these pages are served to anonymous visitors and must not load the app bundle. It lives in
// its own file so the Content-Security-Policy needs no 'unsafe-inline'. Type-checked with
// app/tsconfig.public.json.

/** @typedef {{ userId?: string, userDetails?: string, userRoles?: string[] }} ClientPrincipal */

const APP_ROLES = ['inspector', 'admin'];
const page = document.body.dataset.page;

// An absolute return URL keeps the user on the host they came from (default or custom domain).
// Sign-out stays relative (see forbidden.html): the SWA CLI breaks an absolute logout return URL.
setHref(
  'sign-in',
  `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(`${location.origin}/`)}`,
);

const principal = await getPrincipal();
// Exact match, as the SWA CLI's route check does: forwarding a user that the gate then refuses
// would bounce between this page and '/' forever. Roles are invited in lowercase.
const hasAppRole = principal?.userRoles?.some((role) => APP_ROLES.includes(role)) ?? false;

if (hasAppRole) {
  // Already signed in with access: straight into the app.
  location.replace('/');
} else if (page === 'login' && principal) {
  // Signed in, but not invited: signing in again would only end up here.
  location.replace('/forbidden.html');
} else if (page === 'forbidden') {
  if (principal) showSignedInAs(principal);
  else location.replace('/login.html');
}

/**
 * The SWA client principal, or null when signed out (or when /.auth/me is unavailable).
 * @returns {Promise<ClientPrincipal | null>}
 */
async function getPrincipal() {
  try {
    const res = await fetch('/.auth/me', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.clientPrincipal ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {string} href
 */
function setHref(id, href) {
  const link = document.getElementById(id);
  if (link instanceof HTMLAnchorElement) link.href = href;
}

/**
 * The email and the account id of the sign-in without access. Static Web Apps gives an invited
 * role to one sign-in (its id), not to an email: someone with two Microsoft accounts on the same
 * email (personal and work) can accept an invitation with one and come back with the other. The
 * id shows which one this is; Role management in the Azure portal lists the invited ids.
 * @param {ClientPrincipal} principal
 */
function showSignedInAs({ userDetails: email, userId }) {
  const slot = document.getElementById('signed-in-email');
  const signedInAs = document.getElementById('signed-in-as');
  const fallback = document.getElementById('signed-in-fallback');
  if (email && slot && signedInAs && fallback) {
    slot.textContent = email;
    signedInAs.hidden = false;
    fallback.hidden = true;
  }
  const account = document.getElementById('account');
  const accountId = document.getElementById('account-id');
  if (userId && account && accountId) {
    accountId.textContent = userId;
    account.hidden = false;
  }
}
