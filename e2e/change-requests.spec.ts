/**
 * Change requests: a reader flags a step of an assembly instruction as wrong with a small form;
 * the admins see it under Admin → Change requests (with a count in the sidebar), open the step in
 * the editor and mark the request fixed.
 */
import { newId } from '@modig/shared';
import { expect, test as base, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { deleteChangeRequestsOf, deleteTemplate } from './support/storage';

const ADMIN = 'anna.andersson@modig.se';
const INSPECTOR = 'sam.andersson@modig.se';

/** The instructions a test made, deleted after it with the requests on them. */
const test = base.extend<{ made: string[] }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  made: async ({}, use) => {
    const ids: string[] = [];
    await use(ids);
    await deleteChangeRequestsOf(ids);
    await Promise.all(ids.map((id) => deleteTemplate(id)));
  },
});

/** A published assembly instruction for RigiMill MG: one task, two steps. */
async function publishInstruction(page: Page, name: string): Promise<string> {
  const created = await page.request.post('/api/templates', {
    data: { kind: 'assembly', name, modelCode: 'RMMG' },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).draft.id as string;
  const saved = await page.request.put(`/api/templates/${id}`, {
    headers: { 'If-Match': created.headers().etag! },
    data: {
      name,
      modelCode: 'RMMG',
      sections: [
        {
          id: newId(),
          title: 'Base',
          items: [
            { id: newId(), text: 'Mount Pan 80069' },
            { id: newId(), text: 'Mount Coolant pipes in base' },
          ],
        },
      ],
    },
  });
  const published = await page.request.post(`/api/templates/${id}/publish`, {
    headers: { 'If-Match': saved.headers().etag! },
    data: {},
  });
  expect(published.status()).toBe(200);
  return id;
}

test('an inspector flags a step as wrong; an admin opens it and marks it fixed', async ({
  page,
  context,
  browser,
  made,
}) => {
  test.setTimeout(120_000);
  await signIn(context, ADMIN, ['admin']);
  await page.goto('/assembly');
  const name = `E2E flagged ${Date.now()}`;
  const templateId = await publishInstruction(page, name);
  made.push(templateId);
  const message = `The washers are missing ${Date.now()}`;

  // The reader: a small flag on the step, a small form, and a word of thanks.
  const reader = await browser.newContext();
  await signIn(reader, INSPECTOR, ['inspector']);
  const read = await reader.newPage();
  await read.goto(`/assembly/${templateId}`);
  await read.getByRole('button', { name: 'Something is wrong with step 1.2' }).click();
  const form = read.getByRole('dialog', { name: 'Something wrong with step 1.2?' });
  await expect(form).toContainText('Mount Coolant pipes in base');
  await expect(form.getByRole('button', { name: 'Send to the admins' })).toBeDisabled();
  await form.getByLabel('What is wrong?').fill(message);
  await form.getByRole('button', { name: 'Send to the admins' }).click();
  await expect(read.getByText('Sent to the admins. Thank you.')).toBeVisible();
  // The list is the admins': neither the page nor the API is the inspector's.
  expect((await read.request.get('/api/change-requests')).status()).toBe(403);
  await expect(
    read.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Change requests/ }),
  ).toHaveCount(0);
  await reader.close();

  // The admin: a count in the sidebar, the request with its step and who flagged it.
  await page.reload();
  const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
    name: /Change requests\s*\d+ open/,
  });
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Change requests' })).toBeVisible();
  const card = page.getByRole('listitem').filter({ hasText: message });
  await expect(card).toContainText('1.2 Mount Coolant pipes in base');
  await expect(card).toContainText(name);
  await expect(card).toContainText('Flagged by');

  // Open the step: the editor, at that step.
  await card.getByRole('link', { name: 'Open the step' }).click();
  await expect(page).toHaveURL(new RegExp(`/assembly/${templateId}#row-`));
  await expect(page.getByLabel('Step 1.2', { exact: true })).toBeFocused();

  // Back, and fixed with a note: it moves to Fixed.
  await page.goto('/change-requests');
  await page
    .getByRole('listitem')
    .filter({ hasText: message })
    .getByRole('button', { name: 'Mark as fixed' })
    .click();
  const fix = page.getByRole('dialog', { name: 'Mark as fixed' });
  await fix.getByLabel(/What was done/).fill('Washers added in rev 2.');
  await fix.getByRole('button', { name: 'Mark as fixed' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: message })).toHaveCount(0);
  await page.getByRole('tab', { name: /Fixed/ }).click();
  const fixed = page.getByRole('listitem').filter({ hasText: message });
  await expect(fixed).toContainText('Washers added in rev 2.');
  await expect(fixed.getByRole('button', { name: 'Reopen' })).toBeVisible();
});
