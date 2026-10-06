import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Sign in the way the SWA CLI's mock login does: it only sets this cookie (base64 JSON of the
 * client principal), so setting it directly skips the emulator's form.
 */
async function signIn(context: BrowserContext, email: string, appRoles: string[]): Promise<void> {
  const principal = {
    identityProvider: 'aad',
    userId: `e2e-${email}`,
    userDetails: email,
    userRoles: ['anonymous', 'authenticated', ...appRoles],
    claims: [],
  };
  await context.addCookies([
    {
      name: 'StaticWebAppsAuthCookie',
      value: Buffer.from(JSON.stringify(principal)).toString('base64'),
      domain: 'localhost',
      path: '/',
    },
  ]);
}

async function hasSession(context: BrowserContext): Promise<boolean> {
  return (await context.cookies()).some((cookie) => cookie.name === 'StaticWebAppsAuthCookie');
}

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
// The closed mobile drawer holds a second, hidden copy of the sidebar.
const userName = (page: Page, name: string) =>
  page.getByText(name, { exact: true }).filter({ visible: true });

test.describe('anonymous visitor', () => {
  for (const path of ['/', '/templates']) {
    test(`is sent from ${path} to the sign-in page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\.html$/);
      await expect(page.getByRole('heading', { name: 'Final Inspection' })).toBeVisible();
    });
  }

  test('gets no data from the API', async ({ request }) => {
    // A redirect to the sign-in page, never a 200 with JSON.
    const response = await request.get('/api/me', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toMatch(/\/login\.html$/);
  });

  test('gets the pre-login assets, but not the app bundle through them', async ({ request }) => {
    for (const asset of ['/login-assets/auth.js', '/login-assets/auth.css']) {
      expect((await request.get(asset, { maxRedirects: 0 })).status()).toBe(200);
    }
    // An encoded "../" must not turn an anonymous route into a way past the role check.
    const traversal = await request.get('/login-assets/..%2findex.html', { maxRedirects: 0 });
    expect(traversal.status()).toBe(302);
    expect(traversal.headers()['location']).toMatch(/\/login\.html$/);
  });

  test('signs in with Microsoft Entra ID', async ({ page, baseURL }) => {
    await page.goto('/login.html');
    const returnUrl = encodeURIComponent(`${baseURL}/`);
    await expect(page.getByRole('link', { name: 'Sign in with Microsoft' })).toHaveAttribute(
      'href',
      `/.auth/login/aad?post_login_redirect_uri=${returnUrl}`,
    );
  });
});

test.describe('signed in', () => {
  test('an inspector sees inspections and templates, but no admin pages', async ({
    page,
    context,
  }) => {
    await signIn(context, 'Sam.Andersson@modig.se', ['inspector']);
    await page.goto('/');

    await expect(page).toHaveURL(/\/inspections$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Inspections' })).toBeVisible();
    const nav = mainNav(page);
    await expect(nav.getByRole('link', { name: 'Inspections' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('link', { name: 'Templates' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Insights' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    await expect(userName(page, 'Sam Andersson')).toBeVisible();

    // Through the SWA CLI, which forwards the principal to the Functions host.
    const me = await page.request.get('/api/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toEqual({
      name: 'Sam Andersson',
      email: 'sam.andersson@modig.se',
      roles: ['inspector'],
    });
  });

  test('an admin also sees insights and settings', async ({ page, context }) => {
    await signIn(context, 'asa.oberg@modig.se', ['admin']);
    await page.goto('/');

    const nav = mainNav(page);
    for (const name of ['Inspections', 'Templates', 'Insights', 'Settings']) {
      await expect(nav.getByRole('link', { name })).toBeVisible();
    }
    await expect(userName(page, 'Asa Oberg')).toBeVisible();
  });

  test('an admin can open a deep link to settings', async ({ page, context }) => {
    await signIn(context, 'asa.oberg@modig.se', ['admin']);
    const response = await page.goto('/settings');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Users & access' })).toBeVisible();
    await expect(mainNav(page).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('a user without an app role gets the no-access page', async ({ page, context }) => {
    await signIn(context, 'visitor@example.com', []);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: "You don't have access yet" })).toBeVisible();
    await expect(page.getByText('visitor@example.com')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Sign out and use another account' }),
    ).toBeVisible();
  });

  test('signing out from the sidebar ends on the sign-in page', async ({ page, context }) => {
    await signIn(context, 'Sam.Andersson@modig.se', ['inspector']);
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign out' }).filter({ visible: true }).click();

    await expect(page).toHaveURL(/\/login\.html$/);
    await expect(page.getByRole('heading', { name: 'Final Inspection' })).toBeVisible();
    expect(await hasSession(context)).toBe(false);
  });

  test('signing out from the no-access page ends on the sign-in page', async ({
    page,
    context,
  }) => {
    await signIn(context, 'visitor@example.com', []);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: "You don't have access yet" })).toBeVisible();
    await page.getByRole('link', { name: 'Sign out and use another account' }).click();

    await expect(page).toHaveURL(/\/login\.html$/);
    await expect(page.getByRole('heading', { name: 'Final Inspection' })).toBeVisible();
    expect(await hasSession(context)).toBe(false);
  });
});
