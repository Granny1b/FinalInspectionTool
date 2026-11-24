/**
 * Assembly instructions: written by admins on the Assembly page (tasks of steps, each with its
 * instructions, department, time, parts, bolts and documents), published, exported and imported
 * as JSON, several files at once; read by everyone, with a search and the documents' paths to
 * copy.
 */
import { readFile } from 'node:fs/promises';
import {
  ASSEMBLY_EXPORT_FORMAT,
  AssemblyExportSchema,
  TemplateDetailSchema,
  type AssemblyExportInput,
} from '@modig/shared';
import { expect, test as base, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { deleteTemplate } from './support/storage';

const ADMIN = 'anna.andersson@modig.se';
const INSPECTOR = 'sam.andersson@modig.se';

/** The instructions a test made (by their address), deleted after it. */
const test = base.extend<{ made: string[] }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  made: async ({}, use) => {
    const ids: string[] = [];
    await use(ids);
    await Promise.all(ids.map((id) => deleteTemplate(id)));
  },
});

const saveStatus = (page: Page) => page.locator('main header [role="status"]');

function file(name: string): AssemblyExportInput {
  return {
    format: ASSEMBLY_EXPORT_FORMAT,
    version: 1,
    instruction: {
      name,
      modelCode: 'RMMG',
      tasks: [
        {
          title: 'Task 1',
          steps: [
            { text: 'Mount Pan 80069', fasteners: ['4 pcs - MC6S M10x25'], minutes: 10 },
            { text: 'Mount Coolant pipes in base', department: 'Media', minutes: 90 },
          ],
        },
      ],
    },
  };
}

const upload = (name: string, content: unknown) => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(content)),
});

test('an admin writes an assembly instruction and publishes it; an inspector reads it', async ({
  page,
  context,
  browser,
  made,
}, testInfo) => {
  test.setTimeout(120_000);
  await signIn(context, ADMIN, ['admin']);
  const name = `E2E build ${testInfo.workerIndex}-${Date.now()}`;
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Instructions' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Assembly instructions' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'New instruction' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New assembly instruction' });
  await dialog.getByLabel('Machine model').selectOption('RMMG');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create instruction' }).click();
  await page.waitForURL(/\/assembly\/[A-Za-z0-9]{16}$/);
  const id = page.url().split('/').at(-1)!;
  made.push(id);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  // A task, then its steps from the keyboard: Enter in the title starts them, Enter in a step
  // adds the next.
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByLabel('Task 1 title')).toBeFocused();
  await page.keyboard.type('Base');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Step 1.1', { exact: true })).toBeFocused();
  await page.keyboard.type('Mount Base tend 80065 & 82053');
  await page.getByLabel('Step 1.1 instructions').fill('Tighten crosswise.');

  // A new step's details are open: a pasted bolt list and a server path are read as typed.
  const first = page.locator('li', { has: page.getByLabel('Step 1.1', { exact: true }) });
  await first.getByLabel('Department').selectOption('Mechanical');
  await first.getByLabel('Estimated time (min)').fill('1,5 h');
  await first.getByLabel('Part numbers').fill('80065, 82053');
  await first.getByLabel('Bolts').fill('8 pcs - M6S M8x25\n8 pcs - TBRSB M8 FZB\n');
  await first.getByLabel('Documents').fill('"\\\\SRV102\\share\\Base assy.pdf"');
  await first.getByLabel('Documents').blur();
  await expect(first.getByLabel('Bolts')).toHaveValue('8 pcs M6S M8x25\n8 pcs TBRSB M8 FZB');
  await expect(first.getByLabel('Estimated time (min)')).toHaveValue('90');
  await expect(first.getByLabel('Documents')).toHaveValue('\\\\SRV102\\share\\Base assy.pdf');

  await page.getByLabel('Step 1.1', { exact: true }).press('End');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Step 1.2', { exact: true })).toBeFocused();
  await page.keyboard.type('Mount Pan 80069');
  await expect(page.getByText('2 steps · 1 h 30 min', { exact: true })).toBeVisible();
  await expect(saveStatus(page)).toHaveText(/Saved/);

  const stored = TemplateDetailSchema.parse(
    await (await page.request.get(`/api/templates/${id}`)).json(),
  ).draft;
  expect(stored.kind).toBe('assembly');
  expect(stored.sections[0]?.items[0]).toMatchObject({
    text: 'Mount Base tend 80065 & 82053',
    guide: { description: 'Tighten crosswise.' },
    assembly: {
      department: 'Mechanical',
      minutes: 90,
      partNumbers: ['80065', '82053'],
      fasteners: [
        { quantity: 8, designation: 'M6S M8x25' },
        { quantity: 8, designation: 'TBRSB M8 FZB' },
      ],
      documents: [{ target: '\\\\SRV102\\share\\Base assy.pdf' }],
    },
  });

  // Export JSON writes the draft as an assembly instruction file.
  await page.getByRole('button', { name: 'Instruction actions' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Export JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${name} – RigiMill MG.json`);
  const exported = AssemblyExportSchema.parse(
    JSON.parse(await readFile(await download.path(), 'utf8')),
  );
  expect(exported.instruction.tasks[0]?.steps.map((step) => step.text)).toEqual([
    'Mount Base tend 80065 & 82053',
    'Mount Pan 80069',
  ]);

  await page.getByRole('button', { name: 'Publish' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Publish/ })
    .click();
  await expect(page.getByText('Published revision 1.')).toBeVisible();

  // An inspector reads it: no inputs, the bolts as a table, the path to copy; a search narrows it.
  const reader = await browser.newContext();
  await signIn(reader, INSPECTOR, ['inspector']);
  const read = await reader.newPage();
  await read.goto('/assembly');
  await expect(read.getByRole('button', { name: 'New instruction' })).toHaveCount(0);
  await read.getByRole('link', { name }).click();
  await expect(read.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(read.getByRole('textbox', { name: 'Step 1.1' })).toHaveCount(0);
  await expect(read.getByText('Tighten crosswise.')).toBeVisible();
  await expect(read.getByRole('table', { name: 'Bolts of step 1.1' }).getByRole('row')).toHaveText([
    /8 ×\s*M6S M8x25/,
    /8 ×\s*TBRSB M8 FZB/,
  ]);
  await expect(read.getByText('\\\\SRV102\\share\\Base assy.pdf')).toBeVisible();
  await expect(read.getByRole('button', { name: 'Copy the path of Base assy.pdf' })).toBeVisible();
  await read.getByLabel('Search the steps').fill('80069');
  await expect(read.getByText('1 step in 1 task.')).toBeVisible();
  await expect(read.getByText('Mount Base tend 80065 & 82053')).toHaveCount(0);
  // The draft is the admins': the API refuses an inspector.
  expect((await read.request.get(`/api/templates/${id}`)).status()).toBe(403);
  await reader.close();
});

test('an admin imports several assembly instruction files at once', async ({
  page,
  context,
  made,
}, testInfo) => {
  await signIn(context, ADMIN, ['admin']);
  const stamp = `${testInfo.workerIndex}-${Date.now()}`;
  await page.goto('/assembly');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Assembly instructions' }),
  ).toBeVisible();
  await page
    .locator('input[type=file]')
    .setInputFiles([
      upload('one.json', file(`E2E import one ${stamp}`)),
      upload('two.json', file(`E2E import two ${stamp}`)),
      upload('template.json', { format: 'modig-final-inspection/template', version: 1 }),
    ]);
  const dialog = page.getByRole('dialog', { name: 'Import assembly instructions' });
  await expect(dialog.getByLabel('Machine model')).toHaveValue('RMMG');
  await expect(dialog.getByText('“template.json” can’t be imported.')).toBeVisible();
  await expect(dialog.getByText('It is a final inspection template file.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Import 2 instructions' }).click();
  const links = dialog.getByRole('link');
  await expect(links).toHaveText([`E2E import one ${stamp}`, `E2E import two ${stamp}`]);
  for (const link of await links.all()) {
    made.push((await link.getAttribute('href'))!.split('/').at(-1)!);
  }
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('link', { name: `E2E import two ${stamp}` })).toBeVisible();

  // The imported draft opens in the editor with its bolts read from the file's text.
  await page.getByRole('link', { name: `E2E import one ${stamp}` }).click();
  await expect(page.getByLabel('Step 1.1', { exact: true })).toHaveValue('Mount Pan 80069');
  await page.getByRole('button', { name: 'Details' }).first().click();
  await expect(page.getByLabel('Bolts').first()).toHaveValue('4 pcs MC6S M10x25');
});
