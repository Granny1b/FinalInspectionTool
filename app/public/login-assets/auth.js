// Behaviour for the pre-login pages (login.html, forbidden.html). Plain JS without a bundler:
// these pages are served to anonymous visitors and must not load the app bundle. It lives in
// its own file so the Content-Security-Policy needs no 'unsafe-inline'. Type-checked with
// app/tsconfig.public.json.
//
// The API decides who gets in (the people list in Settings, or a Static Web Apps role
// invitation), so these pages ask /api/me, as the app does: /.auth/me only knows invitations.

/** @typedef {{ userId?: string, userDetails?: string, userRoles?: string[] }} ClientPrincipal */
/**
 * What /api/me answered: in, with these roles; no access (the API's 403); signed out; or any
 * other answer (`status` 0 for none at all).
 * @typedef {{ kind: 'in', roles: string[] } | { kind: 'no-access' } | { kind: 'signed-out' }
 *   | { kind: 'failed', status: number }} Access
 */

const APP_ROLES = ['inspector', 'admin'];
/** Where the app records a refused request before coming here (REFUSAL_KEY in app/src/lib/api.ts). */
const REFUSAL_KEY = 'auth.refused';
const page = document.body.dataset.page;

// An absolute return URL keeps the user on the host they came from (default or custom domain).
// Sign-out stays relative (see forbidden.html): the SWA CLI breaks an absolute logout return URL.
setHref(
  'sign-in',
  `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(`${location.origin}/`)}`,
);

const principal = await getPrincipal();
/** @type {Access} */
const access = principal ? await getAccess() : { kind: 'signed-out' };
const refusal = readRefusal();

if (access.kind === 'signed-out') {
  if (page === 'forbidden') location.replace('/login.html');
} else if (access.kind === 'in' && !refusal) {
  // Signed in with access: straight into the app.
  location.replace('/');
} else if (page !== 'forbidden') {
  // No access, or the app was just refused: signing in again would only end up there.
  location.replace('/forbidden.html');
} else if (access.kind === 'no-access') {
  showNoAccess(principal);
} else {
  // The app was just refused although the API lets this sign-in in (going back would only be
  // refused again), or the API itself failed. Stay, and show what was refused. The app records
  // a refusal before every trip here, and this page only sends someone back without one, so the
  // two never bounce back and forth.
  showRefusal(
    principal,
    access.kind === 'in' ? access.roles : invitedRoles(principal),
    refusal ?? {
      path: '/api/me',
      status: access.kind === 'failed' ? access.status : 0,
      at: new Date().toISOString(),
    },
  );
}

/**
 * The request the app was refused, as it recorded just before coming here (app/src/lib/api.ts,
 * REFUSAL_KEY), if that was less than a minute ago. Only Try again and Check again clear it; the
 * age limit keeps an old refusal from holding a later visit on this page.
 * @typedef {{ path: string, status: number, at: string }} Refusal
 * @returns {Refusal | null}
 */
function readRefusal() {
  try {
    const raw = sessionStorage.getItem(REFUSAL_KEY);
    /** @type {Partial<Refusal> | null} */
    const refusal = raw ? JSON.parse(raw) : null;
    if (!refusal?.path || !refusal.status || !refusal.at) return null;
    const age = Date.now() - Date.parse(refusal.at);
    return age >= 0 && age < 60_000 ? /** @type {Refusal} */ (refusal) : null;
  } catch {
    return null; // storage blocked or not JSON
  }
}

function clearRefusal() {
  try {
    sessionStorage.removeItem(REFUSAL_KEY);
  } catch {
    // Storage blocked: nothing was recorded either.
  }
}

/**
 * The refused request, the sign-in and its roles, so the cause is on screen. Try again clears the
 * record first, so the next visit (if refused again) records the new refusal.
 * @param {ClientPrincipal | null} principal
 * @param {string[]} roles
 * @param {Refusal} refusal
 */
function showRefusal(principal, roles, refusal) {
  setText('refused-email', principal?.userDetails ?? 'an unknown account');
  setText('refused-role', roles.length > 0 ? ` with the role ${roles.join(', ')}` : '');
  setText('refused-request', `GET ${refusal.path}`);
  setText('refused-status', refusal.status ? `HTTP ${refusal.status}` : 'no answer');
  setText('refused-at', new Date(refusal.at).toLocaleTimeString('en-GB'));
  setText('refused-account', principal?.userId ?? '');
  show('no-access', false);
  show('refused', true);
  document.title = 'Request refused · Modig Final Inspection';
  document.getElementById('try-again')?.addEventListener('click', () => {
    clearRefusal();
    location.assign('/');
  });
}

/**
 * The email and the account id of the sign-in without access, and Check again, which asks the
 * API once more (after an admin has added them) without leaving the page.
 * @param {ClientPrincipal | null} principal
 */
function showNoAccess(principal) {
  const email = principal?.userDetails;
  if (email) {
    setText('signed-in-email', email);
    show('signed-in-as', true);
    show('signed-in-fallback', false);
  }
  // A Static Web Apps role invitation belongs to one Microsoft sign-in (this id), not to an
  // email: Role management in the Azure portal lists the invited ids.
  if (principal?.userId) {
    setText('account-id', principal.userId);
    show('account', true);
  }
  const button = document.getElementById('check-again');
  if (!(button instanceof HTMLButtonElement)) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    setText('check-status', 'Checking…');
    const again = await getAccess();
    button.disabled = false;
    if (again.kind === 'in') {
      clearRefusal();
      location.assign('/');
    } else if (again.kind === 'signed-out') {
      location.assign('/login.html');
    } else {
      const time = new Date().toLocaleTimeString('en-GB');
      setText(
        'check-status',
        again.kind === 'no-access'
          ? `Still no access at ${time}. Ask your admin to check the email they added.`
          : `The server didn't answer at ${time}. Try again in a moment.`,
      );
    }
  });
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
 * Asks the API whether this sign-in may use the app. A 403 counts as "no access" only with the
 * API's own JSON error; a 403 page from elsewhere is a failure, like a 500.
 * @returns {Promise<Access>}
 */
async function getAccess() {
  try {
    const res = await fetch('/api/me', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      // SWA answers an ended session with a redirect to this page; following it gains nothing.
      redirect: 'manual',
    });
    if (res.type === 'opaqueredirect' || res.status === 401) return { kind: 'signed-out' };
    /** @type {{ roles?: unknown, error?: unknown } | null} */
    const body = await res.json().catch(() => null);
    if (res.ok) {
      const roles = Array.isArray(body?.roles)
        ? body.roles.filter((role) => APP_ROLES.includes(role))
        : [];
      return roles.length > 0 ? { kind: 'in', roles } : { kind: 'failed', status: res.status };
    }
    if (res.status === 403 && body?.error === 'forbidden') return { kind: 'no-access' };
    return { kind: 'failed', status: res.status };
  } catch {
    return { kind: 'failed', status: 0 };
  }
}

/**
 * The sign-in's Static Web Apps invitation roles: all there is to show when the API failed.
 * @param {ClientPrincipal | null} principal
 */
function invitedRoles(principal) {
  return (principal?.userRoles ?? []).filter((role) => APP_ROLES.includes(role));
}

/**
 * @param {string} id
 * @param {string} text
 */
function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

/**
 * @param {string} id
 * @param {boolean} visible
 */
function show(id, visible) {
  const element = document.getElementById(id);
  if (element) element.hidden = !visible;
}

/**
 * @param {string} id
 * @param {string} href
 */
function setHref(id, href) {
  const link = document.getElementById(id);
  if (link instanceof HTMLAnchorElement) link.href = href;
}
