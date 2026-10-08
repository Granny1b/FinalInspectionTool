import { InspectionSchema, TemplateListSchema } from '@modig/shared';
import { expect, test } from '@playwright/test';
import { signIn } from './support/auth';
import { deleteInspection, findSeededRevision } from './support/storage';

/**
 * The smoke test of brief §9, literally: create an inspection from the seeded template in the
 * UI, mark its rows from the keyboard, finalise it and open the print route. Uses the seeded
 * RigiMill MG as it is (its latest published revision); the inspection and its deviation rows
 * are deleted afterwards.
 */
test('create from the seeded template → mark rows → finalise → print the report', async ({
  page,
  context,
}) => {
  await signIn(context, 'erik.lund@modig.se', ['inspector']);
  // The print tab's window.print() is counted, not shown.
  await context.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = String(
        Number(document.documentElement.dataset.printed ?? 0) + 1,
      );
    };
  });
  const seeded = await findSeededRevision();
  const templates = TemplateListSchema.parse(
    await (await page.request.get('/api/templates')).json(),
  );
  const template = templates.find((candidate) => candidate.id === seeded?.revision.id);
  expect(template?.publishedName).toBeTruthy();

  // Create: pick the checklist, fill in the front page.
  await page.goto('/inspections');
  await page.getByRole('link', { name: 'New inspection' }).click();
  await page.getByRole('radio', { name: template!.publishedName! }).check();
  await page.getByLabel('Machine name', { exact: true }).fill('RigiMill MG – smoke test');
  await page.getByLabel('Serial number', { exact: true }).fill('RM-SMOKE-1');
  await page.getByRole('button', { name: 'Create inspection' }).click();
  await page.waitForURL(/\/inspections\/[A-Za-z0-9]{16}$/);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  try {
    const inspection = InspectionSchema.parse(
      await (await page.request.get(`/api/inspections/${id}`)).json(),
    );
    const sections = inspection.templateSnapshot.sections;
    const total = sections.reduce((sum, section) => sum + section.items.length, 0);

    // Mark every row from the keyboard: the first row NOK with a comment, then R (the rest of the
    // section OK) and J down to the next section.
    await expect(page.getByRole('button', { name: 'Continue at 1.a' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('2');
    await page.keyboard.press('c');
    await page.keyboard.type('Torque mark missing on one screw');
    await page.keyboard.press('Escape');
    for (const [index, section] of sections.entries()) {
      await page.keyboard.press('r');
      if (index < sections.length - 1) {
        for (let row = 0; row < section.items.length; row += 1) await page.keyboard.press('j');
      }
    }
    await expect(page.locator('main header').getByText(/rows filled/)).toHaveText(
      `${total} / ${total} rows filled · 1 NOK`,
    );

    // Finalise.
    await page.getByRole('button', { name: 'Finalise', exact: true }).click();
    await page
      .getByRole('dialog', { name: `Finalise ${inspection.number}?` })
      .getByRole('button', { name: 'Finalise', exact: true })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Finalised.' })).toBeVisible();

    // Print: the report opens in a new tab and prints once it is ready.
    await page.getByRole('button', { name: 'Print / Save PDF' }).click();
    const [report] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('menuitem', { name: 'Report' }).click(),
    ]);
    const root = report.locator('[data-print-root]');
    await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
    await expect(root).toHaveAttribute('data-print-mode', 'report');
    await expect(report.locator('html')).toHaveAttribute('data-printed', '1');
    // The front page carries the inspection's number.
    await expect(root.getByText(inspection.number, { exact: true })).toBeVisible();
    await expect(root).toContainText(`${total} / ${total} rows filled · 1 NOK · 1 deviation`);
    await expect(root.locator('[data-deviation-card="D-01"]')).toContainText(
      'Torque mark missing on one screw',
    );
  } finally {
    await deleteInspection(id);
  }
});
