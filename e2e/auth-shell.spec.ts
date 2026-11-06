import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { removePeople } from './support/people';

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
    await expect(nav.getByRole('link', { name: 'Quality checks' })).toBeVisible();
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
    for (const name of ['Inspections', 'Quality checks', 'Templates', 'Insights', 'Settings']) {
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

  test('a user neither on the list nor invited gets the no-access page', async ({
    page,
    context,
  }) => {
    await signIn(context, 'visitor@example.com', []);
    // Into the app (the gate only wants a sign-in), whose /api/me is refused by the API.
    await page.goto('/');

    await expect(page).toHaveURL(/\/forbidden\.html$/);
    await expect(page.getByRole('heading', { name: "You don't have access yet" })).toBeVisible();
    await expect(page.getByText('visitor@example.com', { exact: true })).toBeVisible();
    await expect(page.locator('.steps')).toContainText(
      'Ask a Quality admin to add your email in Settings → Users & access.',
    );
    // The sign-in's id, which an admin compares with Role management.
    await expect(page.getByText(/^Account ID /).filter({ visible: true })).toHaveText(
      'Account ID e2e-visitor@example.com',
    );
    await expect(
      page.getByRole('link', { name: 'Sign out and use another account' }),
    ).toBeVisible();

    // Asks the API again, in place.
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('status')).toHaveText(/^Still no access at \d\d:\d\d:\d\d\./);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/forbidden\.html$/);
  });

  test('an admin adds someone in Settings, who gets in by name without an invitation', async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    // Emails of this run's own: the list is shared by every test, and nobody else is on it.
    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const adminEmail = `e2e-admin-${run}@example.com`;
    const personEmail = `e2e-person-${run}@example.com`;
    try {
      await signIn(context, adminEmail, ['admin']);
      await page.goto('/settings');
      const card = page.getByRole('region', { name: 'Users & access' });

      // Invited through Azure but not on the list: the admin adds themselves first.
      await card.getByRole('button', { name: 'Add yourself' }).click();
      const self = page.getByRole('dialog', { name: 'Add yourself' });
      await expect(self.getByLabel('Email')).toHaveValue(adminEmail);
      await expect(self.getByRole('radio', { name: /^Admin/ })).toBeChecked();
      await expect(self.getByRole('radio', { name: /^Inspector/ })).toBeDisabled();
      await self.getByLabel('Name', { exact: true }).fill('Ada Admin');
      await self.getByRole('button', { name: 'Add me' }).click();
      await expect(self).toBeHidden();

      const adminRow = card.getByRole('row').filter({ hasText: adminEmail });
      await expect(adminRow).toContainText('Ada Admin');
      await expect(adminRow).toContainText('You');
      // Your own row can't be removed.
      await expect(adminRow.getByRole('button', { name: 'Remove Ada Admin' })).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Add yourself' })).toHaveCount(0);
      // The sidebar picks up the name (the table has it too).
      const sidebar = page
        .getByRole('complementary', { name: 'Sidebar' })
        .filter({ visible: true });
      await expect(sidebar.getByText('Ada Admin', { exact: true })).toBeVisible();

      // Then someone else, as an inspector (the default).
      await card.getByRole('button', { name: 'Add person' }).click();
      const add = page.getByRole('dialog', { name: 'Add a person' });
      await add.getByLabel('Name', { exact: true }).fill('Petra Persson');
      await add.getByLabel('Email').fill(personEmail.toUpperCase());
      await expect(add.getByRole('radio', { name: /^Inspector/ })).toBeChecked();
      await add.getByRole('button', { name: 'Add person' }).click();

      // The invitation to pass on: the app's address and the account to sign in with.
      const invitation = page.getByRole('dialog', { name: 'Petra Persson can sign in now' });
      await expect(invitation.getByLabel('Invitation to send')).toHaveValue(
        `Hi Petra,\n\nYou now have access to Modig Final Inspection as an inspector.\n\n` +
          `Open ${baseURL}/ and sign in with your Microsoft account ${personEmail}.`,
      );
      await expect(invitation.getByRole('link', { name: 'Open in email' })).toHaveAttribute(
        'href',
        `mailto:${personEmail}?subject=Your%20access%20to%20Modig%20Final%20Inspection&body=` +
          encodeURIComponent(await invitation.getByLabel('Invitation to send').inputValue()),
      );
      await invitation.getByRole('button', { name: 'Done' }).click();
      await expect(invitation).toBeHidden();
      const personRow = card.getByRole('row').filter({ hasText: personEmail });
      // Person, role, added, actions.
      const roleCell = personRow.getByRole('cell').nth(1);
      await expect(personRow).toContainText('Petra Persson');
      await expect(roleCell).toHaveText('Inspector');
      await expect(personRow).toContainText('by Ada Admin');

      // Petra signs in with no Static Web Apps role at all.
      const petra = await browser.newContext({ baseURL });
      try {
        await signIn(petra, personEmail, []);
        const petraPage = await petra.newPage();
        await petraPage.goto('/');
        await expect(
          petraPage.getByRole('heading', { level: 1, name: 'Inspections' }),
        ).toBeVisible();
        await expect(userName(petraPage, 'Petra Persson')).toBeVisible();
        await expect(mainNav(petraPage).getByRole('link', { name: 'Settings' })).toHaveCount(0);
        // The sign-in page, asked by someone the API lets in, goes straight into the app.
        await petraPage.goto('/login.html');
        await expect(petraPage).toHaveURL(/\/inspections$/);

        // An edit counts at once, without signing in again.
        await personRow.getByRole('button', { name: 'Edit Petra Persson' }).click();
        const edit = page.getByRole('dialog', { name: 'Edit Petra Persson' });
        await edit.getByLabel('Name', { exact: true }).fill('Petra Pettersson');
        await edit.getByRole('radio', { name: /^Admin/ }).check();
        await edit.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(edit).toBeHidden();
        await expect(personRow).toContainText('Petra Pettersson');
        await expect(roleCell).toHaveText('Admin');
        expect(await (await petraPage.request.get('/api/me')).json()).toMatchObject({
          name: 'Petra Pettersson',
          roles: ['admin'],
        });

        // So does removing her, after a confirmation.
        await personRow.getByRole('button', { name: 'Remove Petra Pettersson' }).click();
        const confirm = page.getByRole('dialog', { name: 'Remove Petra Pettersson?' });
        await confirm.getByRole('button', { name: 'Remove', exact: true }).click();
        await expect(personRow).toHaveCount(0);
        await expect(card.getByText('Petra Pettersson was removed.')).toBeVisible();
        expect((await petraPage.request.get('/api/me')).status()).toBe(403);
      } finally {
        await petra.close();
      }
    } finally {
      await removePeople([adminEmail, personEmail]);
    }
  });

  test('an admin whose request is refused sees what was refused, instead of bouncing', async ({
    page,
    context,
  }) => {
    await signIn(context, 'asa.oberg@modig.se', ['admin']);
    // Refused the way Azure's front door refuses: 403 with an HTML page, not the API's JSON.
    await page.route('**/api/me', (route) =>
      route.fulfill({ status: 403, contentType: 'text/html', body: '<!doctype html><p>No</p>' }),
    );
    await page.goto('/');

    await expect(page).toHaveURL(/\/forbidden\.html$/);
    await expect(page.getByRole('heading', { name: 'The server refused a request' })).toBeVisible();
    const message = page.locator('p.lead').filter({ visible: true });
    await expect(message).toContainText(
      "You're signed in as asa.oberg@modig.se with the role admin, but the app's request " +
        'GET /api/me was refused (HTTP 403) at',
    );
    await expect(message).toHaveText(/at \d\d:\d\d:\d\d\.\s*$/);
    await expect(page.getByText(/^Account ID /).filter({ visible: true })).toHaveText(
      'Account ID e2e-asa.oberg@modig.se',
    );
    // The page stays (its sign-in check is done once the network is idle): no bouncing.
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/forbidden\.html$/);

    // Once the API answers again, Try again goes back into the app.
    await page.unroute('**/api/me');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Inspections' })).toBeVisible();
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
