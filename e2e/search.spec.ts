/**
 * The search over everything (Ctrl+K or the sidebar): an assy number leads to the instruction on
 * its steps, a step to that step, a drawing can be copied from its hit, and an empty search
 * offers what was last open, to continue there.
 */
import { newId } from '@modig/shared';
import { expect, test as base, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { deleteTemplate } from './support/storage';

const ADMIN = 'anna.andersson@modig.se';
const INSPECTOR = 'sam.andersson@modig.se';

const test = base.extend<{ made: string[] }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  made: async ({}, use) => {
    const ids: string[] = [];
    await use(ids);
    await Promise.all(ids.map((id) => deleteTemplate(id)));
  },
});

/** A published instruction with an assy number and a drawing no other test data has. */
async function publishInstruction(page: Page, name: string, assy: string): Promise<string> {
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
            {
              id: newId(),
              text: 'Mount the pan',
              assembly: { assyNumber: assy, assyName: 'Search base' },
            },
            { id: newId(), text: `Mount coolant pipes ${assy}` },
          ],
        },
        {
          id: newId(),
          title: 'Cabinet',
          items: [
            {
              id: newId(),
              text: `Lift in the cabinet ${assy}`,
              assembly: {
                assyNumber: assy,
                documents: [{ target: `\\\\SRV102\\drawings\\${assy}-cabinet.pdf` }],
              },
            },
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

test('the search leads to an assy’s steps, to a step and to a drawing, and offers where one left off', async ({
  page,
  context,
  browser,
  made,
}) => {
  test.setTimeout(120_000);
  await signIn(context, ADMIN, ['admin']);
  await page.goto('/assembly');
  // An assy number of digits only, unique to this run.
  const assy = `9${Date.now() % 10_000_000}`;
  const name = `E2E search ${assy}`;
  const templateId = await publishInstruction(page, name, assy);
  made.push(templateId);

  const reader = await browser.newContext();
  await signIn(reader, INSPECTOR, ['inspector']);
  const read = await reader.newPage();
  await read.goto('/machines');
  await expect(read.getByRole('heading', { level: 1, name: 'Machines' })).toBeVisible();

  // From the sidebar, or Ctrl+K. Nothing was open on this device yet.
  await read.getByRole('button', { name: /^Search/ }).click();
  const box = read.getByRole('combobox', { name: 'Search everything' });
  await expect(box).toBeFocused();
  await expect(read.getByText('Continue where you left off')).toHaveCount(0);

  // The assy number: once, with its steps counted; Enter opens the instruction on those steps.
  await box.fill(assy);
  const numbers = read.getByRole('group', { name: 'Assy and part numbers' });
  await expect(numbers.getByRole('option')).toHaveText([
    new RegExp(`Assy ${assy} · Search base.*2 steps · ${name}`),
  ]);
  // Its steps and its drawing are found too, each under its own heading, in their order.
  await expect
    .poll(() =>
      read
        .getByRole('dialog', { name: 'Search' })
        .getByRole('group')
        .evaluateAll((groups) => groups.map((group) => group.getAttribute('aria-label'))),
    )
    .toEqual([
      'Assembly steps',
      'Assy and part numbers',
      'Drawings and documents',
      'Assembly instructions',
    ]);
  await expect(read.getByRole('group', { name: 'Drawings and documents' })).toContainText(
    `${assy}-cabinet.pdf`,
  );
  await expect(
    read.getByRole('button', { name: `Copy the path of ${assy}-cabinet.pdf` }),
  ).toBeVisible();
  await numbers.getByRole('option').click();
  await expect(read).toHaveURL(new RegExp(`/assembly/${templateId}/revisions/1\\?q=${assy}$`));
  await expect(read.getByLabel('Search the steps')).toHaveValue(assy);
  // The pan, the pipes (named after it here) and the cabinet.
  await expect(read.getByText('3 steps in 2 tasks.')).toBeVisible();

  // A step by its words, with Ctrl+K and the keyboard: Enter lands on that step.
  await read.keyboard.press('Control+k');
  await box.fill(`coolant pipes ${assy}`);
  const step = read.getByRole('group', { name: 'Assembly steps' }).getByRole('option').first();
  await expect(step).toContainText(`1.2 Mount coolant pipes ${assy}`);
  await expect(step).toHaveAttribute('aria-selected', 'true');
  await read.keyboard.press('Enter');
  await expect(read).toHaveURL(new RegExp(`/assembly/${templateId}/revisions/1#row-`));
  await expect(read.getByRole('dialog', { name: 'Search' })).toHaveCount(0);
  await expect(read.getByText(`Mount coolant pipes ${assy}`)).toBeInViewport();

  // Away and back: the empty search offers the instruction, to continue where one left off.
  await read.goto('/machines');
  await expect(read.getByRole('heading', { level: 1, name: 'Machines' })).toBeVisible();
  await read.getByRole('button', { name: /^Search/ }).click();
  await expect(box).toBeFocused();
  const recent = read
    .getByRole('group', { name: 'Continue where you left off' })
    .getByRole('option')
    .first();
  await expect(recent).toContainText(name);
  await expect(recent).toContainText('Assembly instruction');
  await recent.click();
  await expect(read).toHaveURL(new RegExp(`/assembly/${templateId}/revisions/1`));
  // The search has closed behind the hit before it is opened again.
  await expect(read.getByRole('dialog', { name: 'Search' })).toHaveCount(0);

  // Nothing found says so.
  await read.keyboard.press('Control+k');
  await box.fill('zzqq nothing has this');
  await expect(read.getByText(/Nothing found for “zzqq nothing has this”/)).toBeVisible();
  await read.keyboard.press('Escape');
  await expect(read.getByRole('dialog', { name: 'Search' })).toHaveCount(0);
  await reader.close();
});
