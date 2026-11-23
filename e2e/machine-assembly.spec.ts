/**
 * An assembly instruction on a machine: bound on the machine's page, its steps signed with
 * initials by several people, a task turning green when all its steps are signed, a sign-off
 * taken back, and the machine's page showing how far it has come.
 */
import { MachineDetailSchema, newId } from '@modig/shared';
import { expect, test as base, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { deleteMachines, deleteTemplate, uniqueMachineId } from './support/storage';

const ADMIN = 'anna.andersson@modig.se';
const INSPECTOR = 'sam.andersson@modig.se';

type Fixtures = { made: { machines: string[]; templates: string[] } };

/** The machine and the instruction a test made, deleted after it. */
const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  made: async ({}, use) => {
    const made = { machines: [] as string[], templates: [] as string[] };
    await use(made);
    await deleteMachines(made.machines);
    await Promise.all(made.templates.map((id) => deleteTemplate(id)));
  },
});

/** A published assembly instruction of the model: two tasks, three steps. */
async function publishInstruction(page: Page, modelCode: string, name: string): Promise<string> {
  const created = await page.request.post('/api/templates', {
    data: { kind: 'assembly', name, modelCode },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).draft.id as string;
  const saved = await page.request.put(`/api/templates/${id}`, {
    headers: { 'If-Match': created.headers().etag! },
    data: {
      name,
      modelCode,
      sections: [
        {
          id: newId(),
          title: 'Base',
          items: [
            { id: newId(), text: 'Mount Pan 80069', assembly: { minutes: 10 } },
            { id: newId(), text: 'Mount Coolant pipes in base', assembly: { minutes: 90 } },
          ],
        },
        { id: newId(), title: 'Measuring', items: [{ id: newId(), text: 'Measure the base' }] },
      ],
    },
  });
  expect(saved.status()).toBe(200);
  const published = await page.request.post(`/api/templates/${id}/publish`, {
    headers: { 'If-Match': saved.headers().etag! },
    data: {},
  });
  expect(published.status()).toBe(200);
  return id;
}

test('an instruction is bound to a machine and signed off until it is completed', async ({
  page,
  context,
  browser,
  made,
}) => {
  test.setTimeout(120_000);
  await signIn(context, ADMIN, ['admin']);
  await page.goto('/machines');
  const name = `E2E build ${Date.now()}`;
  made.templates.push(await publishInstruction(page, 'RMMG', name));
  const created = await page.request.post('/api/machines', {
    data: {
      machineName: uniqueMachineId('E2E-ASM'),
      modelCode: 'RMMG',
      serialNumber: '1001',
      templateIds: [],
    },
  });
  expect(created.status()).toBe(201);
  const machineId = MachineDetailSchema.parse(await created.json()).machine.id;
  made.machines.push(machineId);

  // Bound on the machine's page.
  await page.goto(`/machines/${machineId}`);
  const section = page.getByRole('region', { name: 'Assembly' });
  await section.getByRole('button', { name: 'Add instruction' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add assembly instruction' });
  await dialog.getByLabel('Instruction').selectOption({ label: name });
  await dialog.getByRole('button', { name: 'Add to machine' }).click();
  await expect(section.getByText('0 of 3 steps signed')).toBeVisible();
  await section.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // The admin signs the first step, with the initials of their name to start with.
  await expect(page.getByLabel('Signing as')).toHaveValue('AA');
  await page.getByRole('button', { name: 'Sign step 1.1 as done' }).click();
  await expect(page.getByText('Done · AA')).toBeVisible();
  await expect(page.getByText('1 of 3 steps signed')).toBeVisible();

  // Someone else signs the rest of the task with their own initials: the task is completed.
  const other = await browser.newContext();
  await signIn(other, INSPECTOR, ['inspector']);
  const second = await other.newPage();
  await second.goto(page.url());
  // The field next to the button starts as theirs and is overtyped for someone else; the
  // initials signed with are then the ones the other steps offer.
  await expect(second.getByLabel('Initials for step 1.2')).toHaveValue('SA');
  await second.getByLabel('Initials for step 1.2').fill('lcs');
  await expect(second.getByLabel('Initials for step 1.2')).toHaveValue('LCS');
  await second.getByRole('button', { name: 'Sign step 1.2 as done' }).click();
  await expect(second.getByLabel('Signing as')).toHaveValue('LCS');
  await expect(second.getByLabel('Initials for step 2.1')).toHaveValue('LCS');
  const task = second.getByRole('button', { name: /Base/ });
  await expect(task).toContainText('Completed');
  await expect(task).toContainText('2 of 2 signed');
  await expect(second.getByText('Done · LCS')).toBeVisible();
  // They can't take the admin's sign-off back, only their own.
  await expect(
    second.getByRole('button', { name: 'Take back the sign-off of step 1.1' }),
  ).toHaveCount(0);
  await second.getByRole('button', { name: 'Take back the sign-off of step 1.2' }).click();
  await expect(second.getByRole('button', { name: 'Sign step 1.2 as done' })).toBeVisible();
  await second.getByRole('button', { name: 'Sign step 1.2 as done' }).click();
  await expect(second.getByText('Done · LCS')).toBeVisible();
  await second.getByRole('button', { name: 'Sign step 2.1 as done' }).click();
  await expect(second.getByText('Completed: every step is signed.')).toBeVisible();
  await other.close();

  // The machine's page says so.
  await page.goto(`/machines/${machineId}`);
  await expect(section.getByText('Completed')).toBeVisible();
  await expect(section.getByText('3 of 3 steps signed')).toBeVisible();
});
