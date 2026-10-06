// Behaviour for the pre-login pages (login.html, forbidden.html). Plain JS without a bundler:
// these pages are served to anonymous visitors and must not load the app bundle. It lives in
// its own file so the Content-Security-Policy needs no 'unsafe-inline'.

const APP_ROLES = ['inspector', 'admin'];
const page = document.body.dataset.page;

// Absolute return URLs keep the user on the host they came from (default or custom domain).
setHref(
  'sign-in',
  `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(`${location.origin}/`)}`,
);
setHref(
  'sign-out',
  `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(`${location.origin}/login.html`)}`,
);

const principal = await getPrincipal();
const hasAppRole = principal?.userRoles?.some((role) => APP_ROLES.includes(role)) ?? false;

if (hasAppRole) {
  // Already signed in with access: straight into the app.
  location.replace('/');
} else if (page === 'login' && principal) {
  // Signed in, but not invited: signing in again would only end up here.
  location.replace('/forbidden.html');
} else if (page === 'forbidden') {
  if (principal) showSignedInAs(principal.userDetails);
  else location.replace('/login.html');
}

/** The SWA client principal, or null when signed out (or when /.auth/me is unavailable). */
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

function setHref(id, href) {
  const link = document.getElementById(id);
  if (link) link.href = href;
}

function showSignedInAs(email) {
  const slot = document.getElementById('signed-in-email');
  if (!email || !slot) return;
  slot.textContent = email;
  document.getElementById('signed-in-as').hidden = false;
  document.getElementById('signed-in-fallback').hidden = true;
}
