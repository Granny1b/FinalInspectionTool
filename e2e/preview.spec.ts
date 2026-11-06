import { InspectionSchema, type Inspection, type Template } from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { createTemplate, deleteInspection, deleteTemplate } from './support/storage';

/**
 * The quick Preview on the inspection page: the printed pages in a dialog, at once, from what is
 * on screen (unsaved edits included), light paper in the dark theme too; and the template's
 * print preview, which never prints by itself. Each test has its own throwaway template (two
 * sections of three rows, model E2E); its inspections are deleted afterwards.
 */

const INSPECTOR = 'erik.lund@modig.se';
const ADMIN = 'anna.andersson@modig.se';

const test = base.extend<{
  published: Template;
  /** Creates an inspection through the API with the page's sign-in; deleted after the test. */
  createInspection: (machineName: string) => Promise<Inspection>;
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  published: async ({}, use, testInfo) => {
    const template = await createTemplate(`E2E preview – ${testInfo.title}`, true);
    await use(template);
    await deleteTemplate(template.id);
  },
  createInspection: async ({ page, published }, use) => {
    const ids: string[] = [];
    await use(async (machineName) => {
      const response = await page.request.post('/api/inspections', {
        data: {
          templateId: published.id,
          front: {
            machineName,
            serialNumber: 'SN-4711',
            participants: ['Erik Lund'],
            location: 'Kalmar, Sweden',
            date: '2026-10-07',
          },
        },
      });
      expect(response.status()).toBe(201);
      const inspection = InspectionSchema.parse(await response.json());
      ids.push(inspection.id);
      return inspection;
    });
    await Promise.all(ids.map(deleteInspection));
  },
});

// The app in the dark theme (no choice stored: the system's), so the paper must stay light.
test.use({ colorScheme: 'dark' });

const previewButton = (page: Page) => page.getByRole('button', { name: 'Preview', exact: true });
const previewDialog = (page: Page) => page.getByRole('dialog', { name: 'Preview' });
const row = (page: Page, itemId: string) => page.locator(`#row-${itemId}`);

async function openInspection(page: Page, inspection: Inspection): Promise<void> {
  await page.goto(`/inspections/${inspection.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `${inspection.number} · ${inspection.front.machineName}`,
  );
}

/** Marks a row NOK and types its comment, as an inspector does on the sheet. */
async function markNok(page: Page, itemId: string, comment: string): Promise<void> {
  await row(page, itemId).getByRole('button', { name: 'NOK', exact: true }).click();
  await page.locator(`[data-comment="${itemId}"]`).fill(comment);
}

async function stored(request: APIRequestContext, id: string): Promise<Inspection> {
  const response = await request.get(`/api/inspections/${id}`);
  expect(response.status()).toBe(200);
  return InspectionSchema.parse(await response.json());
}

test.describe('an inspector', () => {
  test.beforeEach(({ context }) => signIn(context, INSPECTOR, ['inspector']));

  test('Preview shows the report with unsaved edits on light paper, and closes with Escape', async ({
    page,
    published,
    createInspection,
  }) => {
    const inspection = await createInspection(`Preview – ${published.id}`);
    const [a1] = published.sections[0]!.items;
    // Saves never arrive, so everything typed below stays unsaved.
    await page.route(`**/api/inspections/${inspection.id}`, (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
    });
    await openInspection(page, inspection);
    const renamed = `Renamed, not saved – ${published.id}`;
    await page.getByLabel('Machine ID', { exact: true }).fill(renamed);
    await markNok(page, a1!.id, 'Seal torn at the hinge');
    await expect(page.locator('main header [role="status"]').first()).not.toHaveText('Saved');

    await previewButton(page).click();
    const dialog = previewDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
    const root = dialog.locator('[data-print-root]');
    await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
    // The report first, with what is on screen.
    await expect(root).toHaveAttribute('data-print-mode', 'report');
    await expect(dialog.getByRole('button', { name: 'Report' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(root.locator('.paper-fields')).toContainText(renamed);
    await expect(root).toContainText('NOT FINALISED – DRAFT REPORT');
    const card = root.locator('[data-deviation-card="D-01"]');
    await expect(card).toContainText(a1!.text);
    await expect(card).toContainText('Seal torn at the hinge');

    // White sheets and black text, while the app around them is dark.
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(15, 18, 22)');
    await expect(root.locator('.paper-sheet').first()).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
    await expect(root).toHaveCSS('color', 'rgb(0, 0, 0)');

    // The blank checklist, switched in place.
    await dialog.getByRole('button', { name: 'Blank checklist' }).click();
    await expect(root).toHaveAttribute('data-print-mode', 'blank');
    await expect(root).toHaveAttribute('data-print-ready', 'true');
    await expect(root.locator('[data-deviation-card]')).toHaveCount(0);

    // Escape closes it and hands the focus back; nothing was saved on the way.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(previewButton(page)).toBeFocused();
    const saved = await stored(page.request, inspection.id);
    expect(saved.front.machineName).toBe(inspection.front.machineName);
    expect(saved.results).toEqual({});
  });

  test('Close closes the preview; its Print / Save PDF saves first and prints in a new tab', async ({
    page,
    context,
    published,
    createInspection,
  }) => {
    // The print tab's window.print() is counted, not shown.
    await context.addInitScript(() => {
      window.print = () => {
        document.documentElement.dataset.printed = String(
          Number(document.documentElement.dataset.printed ?? 0) + 1,
        );
      };
    });
    const inspection = await createInspection(`Preview print – ${published.id}`);
    await openInspection(page, inspection);

    await previewButton(page).click();
    await previewDialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(previewDialog(page)).toBeHidden();
    await expect(previewButton(page)).toBeFocused();

    const renamed = `Printed from the preview – ${published.id}`;
    await page.getByLabel('Machine ID', { exact: true }).fill(renamed);
    await previewButton(page).click();
    const dialog = previewDialog(page);
    await expect(dialog.locator('[data-print-root]')).toHaveAttribute('data-print-ready', 'true', {
      timeout: 30_000,
    });
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      dialog.getByRole('button', { name: 'Print / Save PDF' }).click(),
    ]);
    await expect(dialog).toBeHidden();
    const printed = tab.locator('[data-print-root]');
    await expect(printed).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
    await expect(printed).toHaveAttribute('data-print-mode', 'report');
    await expect(printed.locator('.paper-fields')).toContainText(renamed);
    await expect(tab.locator('html')).toHaveAttribute('data-printed', '1');
    // The print route loads the inspection from the server: it was saved before it opened.
    expect((await stored(page.request, inspection.id)).front.machineName).toBe(renamed);
  });

  test('on a tablet the sheets are scaled to fit, and the cards are laid out as on paper', async ({
    page,
    published,
    createInspection,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    const inspection = await createInspection(`Preview tablet – ${published.id}`);
    const [a1, b1] = published.sections[0]!.items;
    await openInspection(page, inspection);
    await markNok(page, a1!.id, 'Seal torn at the hinge');
    await markNok(page, b1!.id, 'Guard rail loose');

    await previewButton(page).click();
    const root = previewDialog(page).locator('[data-print-root]');
    await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
    // A4 is 794 px wide; here it is drawn narrower than the window, with no sideways scrolling.
    const sheet = await root.locator('.paper-sheet').first().boundingBox();
    expect(sheet!.width).toBeLessThan(768 - 24);
    expect(sheet!.width).toBeGreaterThan(600);
    // Measured through the scaling: two short cards share one page, as they do on paper.
    const cards = root.locator('.paper-card-page');
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText(`${inspection.number} · D-01–D-02`);
  });
});

test('a template’s print preview, opened from the editor, never prints by itself', async ({
  page,
  context,
  published,
}) => {
  await signIn(context, ADMIN, ['admin']);
  await context.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = 'yes';
    };
  });
  await page.goto(`/templates/${published.id}`);
  await page.getByRole('link', { name: 'Print preview' }).click();
  await expect(page).toHaveURL(new RegExp(`/templates/${published.id}/print$`));
  const root = page.locator('[data-print-root]');
  await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(root).toHaveAttribute('data-print-mode', 'blank');
  // Ready, and a moment later still not printed.
  await page.waitForTimeout(500);
  await expect(page.locator('html')).not.toHaveAttribute('data-printed', 'yes');
});
