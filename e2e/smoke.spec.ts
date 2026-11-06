import { InspectionSchema, TemplateListSchema } from '@modig/shared';
import { expect, test } from '@playwright/test';
import { signIn } from './support/auth';
import {
  deleteInspection,
  deleteMachines,
  findSeededRevision,
  uniqueMachineId,
} from './support/storage';

/**
 * The smoke test of brief §9, literally: create an inspection from the seeded template in the
 * UI (on a new machine, as inspections start now), mark its rows from the keyboard, finalise it
 * and open the print route. Uses the seeded RigiMill MG as it is (its latest published
 * revision); the machine, the inspection and its deviation rows are deleted afterwards.
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

  // Create: a machine of the model, then its final inspection.
  await page.goto('/inspections');
  await page.getByRole('link', { name: 'New final inspection' }).click();
  await page.getByRole('link', { name: 'New machine' }).click();
  await page.getByRole('radio', { name: /^RigiMill MG/ }).check();
  // Only the final inspection (whatever quality checks the seeded model may have got since).
  const all = page.getByRole('button', { name: 'Select none' });
  if (await all.isVisible()) await all.click();
  await page.getByRole('checkbox', { name: /Final inspection/ }).check();
  await page.getByLabel('Machine ID', { exact: true }).fill(uniqueMachineId('RigiMill MG smoke'));
  await page.getByLabel('Serial number', { exact: true }).fill('RM-SMOKE-1');
  await page.getByRole('button', { name: 'Create machine' }).click();
  await page.waitForURL(/\/machines\/[A-Za-z0-9]{16}$/);
  const machineId = new URL(page.url()).pathname.split('/').pop()!;
  await page.getByRole('button', { name: 'Start Final inspection' }).click();
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
    await expect(root).toContainText(
      `${total} checkpoints: ${total - 1} OK · 1 NOK · 0 N/A · 1 deviation`,
    );
    await expect(root.locator('[data-deviation-card="D-01"]')).toContainText(
      'Torque mark missing on one screw',
    );
  } finally {
    await deleteInspection(id);
    await deleteMachines([machineId]);
  }
});
