import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/auth';

/**
 * The light and dark themes: System (the default) follows the browser's setting, Light and Dark
 * are kept in this browser and applied before the first paint (public/theme.js), on the app and
 * on the pre-login pages alike.
 */

// The canvas (page background) of each theme, from app/src/index.css.
const LIGHT_CANVAS = 'rgb(246, 247, 249)';
const DARK_CANVAS = 'rgb(15, 18, 22)';

/** The visible theme control: the closed tablet drawer holds a second copy of the sidebar. */
const themeGroup = (page: Page) =>
  page.getByRole('group', { name: 'Theme' }).filter({ visible: true });

/** Picks System, Light or Dark (the radios themselves are visually hidden). */
async function pickTheme(page: Page, label: 'System' | 'Light' | 'Dark'): Promise<void> {
  const group = themeGroup(page);
  await group.getByText(label, { exact: true }).click();
  await expect(group.getByRole('radio', { name: label })).toBeChecked();
}

const html = (page: Page) => page.locator('html');
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('theme'));

/** Stores a choice before any page script runs, as an earlier visit would have. */
async function storeTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('theme', value);
    } catch {
      // A document without storage (about:blank).
    }
  }, theme);
}

test.describe('a signed-in user', () => {
  // The system is set to dark, so Light is a choice that differs from it.
  test.use({ colorScheme: 'dark' });
  test.beforeEach(({ context }) => signIn(context, 'sam.andersson@modig.se', ['inspector']));

  test('follows the system until a theme is picked; the pick is kept over a reload', async ({
    page,
  }) => {
    // What the page had when its HTML was parsed, before the app's script ran.
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.dataset.themeAtLoad =
          document.documentElement.dataset.theme ?? 'none';
      });
    });
    await page.goto('/inspections');
    await expect(page.getByRole('heading', { level: 1, name: 'Inspections' })).toBeVisible();
    await expect(themeGroup(page).getByRole('radio', { name: 'System' })).toBeChecked();
    await expect(html(page)).not.toHaveAttribute('data-theme');
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_CANVAS);

    await pickTheme(page, 'Light');
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS('background-color', LIGHT_CANVAS);
    expect(await stored(page)).toBe('light');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Inspections' })).toBeVisible();
    // Set before the first paint, not by the app once it had loaded: no flash of the dark theme.
    await expect(html(page)).toHaveAttribute('data-theme-at-load', 'light');
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS('background-color', LIGHT_CANVAS);
    await expect(themeGroup(page).getByRole('radio', { name: 'Light' })).toBeChecked();

    await pickTheme(page, 'Dark');
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(html(page)).toHaveAttribute('data-theme-at-load', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_CANVAS);

    // System again: nothing kept, the browser's setting rules.
    await pickTheme(page, 'System');
    await expect(html(page)).not.toHaveAttribute('data-theme');
    expect(await stored(page)).toBeNull();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('body')).toHaveCSS('background-color', LIGHT_CANVAS);
  });

  test('on a tablet the drawer has the same control, in step with the choice', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto('/inspections');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer).toBeVisible();
    await pickTheme(page, 'Light');
    await expect(html(page)).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    // The desktop sidebar's copy shows the same choice.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(themeGroup(page).getByRole('radio', { name: 'Light' })).toBeChecked();
  });

  test('prints on light paper in the dark theme', async ({ page }) => {
    await storeTheme(page, 'dark');
    await page.goto('/inspections');
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_CANVAS);
    await page.emulateMedia({ media: 'print' });
    // Printing uses the light tokens: the page is light paper whatever the theme.
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(22, 27, 33)');
  });
});

test.describe('an anonymous visitor', () => {
  test('gets the theme script and the light logo for dark pages without signing in', async ({
    request,
  }) => {
    for (const asset of ['/theme.js', '/modig-logo-dark.png']) {
      expect((await request.get(asset, { maxRedirects: 0 })).status()).toBe(200);
    }
  });

  test('sees the sign-in page in the theme picked in the app', async ({ page }) => {
    await storeTheme(page, 'dark');
    await page.goto('/login.html');
    await expect(page.getByRole('heading', { name: 'Final Inspection' })).toBeVisible();
    await expect(html(page)).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_CANVAS);
    // The logo with a white wordmark, behind the page's one logo image.
    await expect(page.locator('.logo')).toHaveCSS('background-image', /modig-logo-dark\.png/);
  });

  test.describe('with the system set to dark', () => {
    test.use({ colorScheme: 'dark' });

    test('sees the sign-in page dark when nothing is picked', async ({ page }) => {
      await page.goto('/login.html');
      await expect(page.getByRole('heading', { name: 'Final Inspection' })).toBeVisible();
      await expect(html(page)).not.toHaveAttribute('data-theme');
      await expect(page.locator('body')).toHaveCSS('background-color', DARK_CANVAS);
    });
  });
});
