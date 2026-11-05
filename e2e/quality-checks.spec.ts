/**
 * Quality checks: set up by admins under a machine's final inspection template (its Quality
 * checks tab), edited as row cards with pictures, published, exported and imported; read-only for
 * inspectors, and never the source of an inspection.
 */
import { readFile } from 'node:fs/promises';
import {
  QualityCheckExportSchema,
  TemplateDetailSchema,
  TemplateListSchema,
  type Template,
} from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { testPhoto } from './support/photos';
import {
  createQualityCheck,
  createTemplate,
  deleteQualityChecks,
  deleteTemplate,
} from './support/storage';

const ADMIN = 'anna.andersson@modig.se';
const INSPECTOR = 'sam.andersson@modig.se';

/**
 * A throwaway machine: a published final inspection template (model E2E, not in the settings, so
 * its name is its code). Its quality checks, made in the test or in the UI, go with it.
 */
const test = base.extend<{ machine: Template }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  machine: async ({}, use, testInfo) => {
    const machine = await createTemplate(`E2E QC machine – ${testInfo.title}`, true);
    await use(machine);
    await deleteQualityChecks(machine.id);
    await deleteTemplate(machine.id);
  },
});

async function savedDraft(request: APIRequestContext, id: string): Promise<Template> {
  const response = await request.get(`/api/templates/${id}`);
  expect(response.status()).toBe(200);
  return TemplateDetailSchema.parse(await response.json()).draft;
}

/** "Saved", "Unsaved changes", "Saving…" … in the editor's header. */
const saveStatus = (page: Page) => page.locator('main header [role="status"]');
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Checklists of this machine' });

test.describe('an admin', () => {
  test.beforeEach(({ context }) => signIn(context, ADMIN, ['admin']));

  test('sets up a quality check on the machine’s Quality checks tab and publishes it', async ({
    page,
    browser,
    machine,
  }) => {
    test.setTimeout(120_000);
    await page.goto(`/templates/${machine.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E' })).toBeVisible();
    await tabs(page).getByRole('link', { name: 'Quality checks (0)' }).click();
    await expect(tabs(page).getByRole('link', { name: 'Quality checks (0)' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    // Position and operation make its title.
    await page.getByRole('button', { name: 'New quality check', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New quality check' });
    await expect(dialog.getByRole('button', { name: 'Create quality check' })).toBeDisabled();
    await dialog.getByLabel('Position').fill('QC4');
    await dialog.getByLabel('Operation').fill('Pre start up');
    await dialog.getByRole('button', { name: 'Create quality check' }).click();
    await page.waitForURL(new RegExp(`/templates/${machine.id}/quality-checks/[A-Za-z0-9]{16}$`));
    const id = page.url().split('/').at(-1)!;
    await expect(page.getByRole('heading', { level: 1, name: 'QC4 · Pre start up' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link')).toHaveText(
      ['Templates', 'E2E', 'Quality checks'],
    );

    // The front page: the title follows the operation.
    await expect(page.getByLabel('Department')).toHaveValue('Quality');
    await expect(page.getByLabel('Made by')).toHaveValue('Anna Andersson');
    await page.getByLabel('Operation').fill('Pre start-up');
    await expect(page.getByRole('heading', { level: 1, name: 'QC4 · Pre start-up' })).toBeVisible();
    await page.getByLabel('Document no.').fill('1.22.2');
    await page.getByLabel('Made by').fill('Sam Andersson');
    await page.getByLabel('Date', { exact: true }).fill('2026-11-05');

    // A section, then its rows from the keyboard: Enter in the title starts them, Enter in What
    // adds the next.
    await page.getByRole('button', { name: 'Add section' }).click();
    await expect(page.getByLabel('Section 1 title')).toBeFocused();
    await page.keyboard.type('Safety features');
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Row 1.a what to check')).toBeFocused();
    await page.keyboard.type('Check the safety decals on the X motors.');
    await page.getByLabel('Row 1.a how').fill('Visible and not turned inward.');
    // A comma adds a reference, Enter the last one.
    await page.getByLabel('Add a reference to row 1.a').fill('ISO 12100, ISO 7010');
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('list', { name: 'References of row 1.a' }).getByRole('listitem'),
    ).toHaveText(['ISO 12100', 'ISO 7010']);
    // A Swedish keyboard's decimal comma counts.
    await page.getByLabel('Row 1.a time in hours').fill('0,2');
    await page.getByLabel('Row 1.a what to check').press('End');
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Row 1.b what to check')).toBeFocused();
    await page.keyboard.type('Warning signs inside the electrical cabinet.');
    await page.getByLabel('Row 1.b how').fill('Readable from the door.');
    await page.getByLabel('Add a reference to row 1.b').fill('IEC 60204-1');
    await page.keyboard.press('Enter');
    await page.getByLabel('Row 1.b time in hours').fill('0.1');
    await page.getByLabel('Row 1.b time in hours').blur();
    await expect(page.getByLabel('Row 1.a time in hours')).toHaveValue('0.2');
    await expect(page.getByText('2 rows · 0.3 h', { exact: true })).toBeVisible();
    await expect(page.getByText('1 section · 2 rows · 0.3 h')).toBeVisible();

    // The row's pictures: the guide editor, in a quality check's words.
    await page.getByRole('button', { name: 'Add pictures to row 1.a' }).click();
    const pictures = page.getByRole('dialog', {
      name: 'Pictures · 1.a Check the safety decals on the X motors.',
    });
    await expect(pictures).toContainText('Mark each one Should look like this');
    await pictures.getByLabel('More information').fill('Both X motors, left and right.');
    const jpeg = await testPhoto(browser, { width: 1200, height: 900, label: 'Decal' });
    await pictures
      .locator('input[data-photo-input]')
      .setInputFiles({ name: 'decal.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    const annotation = page.locator('dialog[data-annotation-editor]');
    await expect(annotation.getByRole('heading', { name: 'New picture' })).toBeVisible();
    await expect(annotation.locator('[data-annotation-canvas]')).toBeVisible({ timeout: 20_000 });
    await annotation.getByRole('button', { name: 'Save' }).click();
    await expect(annotation).toBeHidden({ timeout: 30_000 });
    const verdict = pictures.getByRole('group', { name: 'Verdict, picture 1' });
    await expect(verdict.getByRole('radio', { name: 'Info' })).toBeChecked();
    await verdict.getByText('Should look like this', { exact: true }).click();
    await expect(verdict.getByRole('radio', { name: 'Should look like this' })).toBeChecked();
    await expect(verdict.getByRole('radio', { name: 'Should not look like this' })).toBeVisible();
    await pictures.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(pictures).toBeHidden();
    // The card shows the picture with its verdict, and the more information.
    await expect(
      page.getByRole('button', {
        name: 'Pictures of row 1.a: 1 picture, the first one should look like this, and more information',
      }),
    ).toBeVisible();
    await expect(page.locator('#row-' + (await rowId(page, '1.a')))).toContainText(
      'Both X motors, left and right.',
    );

    // Autosaved: the front page, the rows' fields and the pictures.
    await expect(saveStatus(page)).toHaveText('Saved');
    const draft = await savedDraft(page.request, id);
    expect(draft).toMatchObject({
      kind: 'quality',
      parentId: machine.id,
      name: 'QC4 · Pre start-up',
      modelCode: 'E2E',
      quality: {
        position: 'QC4',
        operation: 'Pre start-up',
        department: 'Quality',
        documentNumber: '1.22.2',
        madeBy: 'Sam Andersson',
        date: '2026-11-05',
      },
    });
    expect(draft.sections[0]!.items).toEqual([
      {
        id: expect.any(String),
        text: 'Check the safety decals on the X motors.',
        guide: {
          description: 'Both X motors, left and right.',
          images: [expect.objectContaining({ imageId: expect.any(String), verdict: 'good' })],
        },
        how: 'Visible and not turned inward.',
        references: ['ISO 12100', 'ISO 7010'],
        timeHours: 0.2,
      },
      {
        id: expect.any(String),
        text: 'Warning signs inside the electrical cabinet.',
        how: 'Readable from the door.',
        references: ['IEC 60204-1'],
        timeHours: 0.1,
      },
    ]);

    // Publish, as a template.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publish = page.getByRole('dialog', { name: 'Publish revision 1' });
    await publish.getByRole('button', { name: 'Publish revision 1' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Published revision 1.' }),
    ).toBeVisible();
    await expect(page.getByText('Published Rev 1')).toBeVisible();

    // On the machine's tab, and counted on its card on the Templates page.
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Quality checks' })
      .click();
    const card = page.getByRole('listitem').filter({
      has: page.getByRole('link', { name: 'QC4 · Pre start-up' }),
    });
    await expect(card).toContainText('Quality · document 1.22.2 · made by Sam Andersson');
    await expect(card).toContainText('Rev 1');
    await expect(card.getByRole('list', { name: 'Sections' })).toHaveText('1Safety features');
    await expect(card).toContainText('0.3 h');
    await expect(tabs(page).getByRole('link', { name: 'Quality checks (1)' })).toBeVisible();

    await page.goto('/templates');
    await page.evaluate(() => localStorage.setItem('templates.view', 'cards'));
    await page.reload();
    const machineCard = page
      .getByRole('listitem')
      .filter({ has: page.getByRole('link', { name: machine.name, exact: true }) });
    await expect(machineCard).toContainText('1 quality check');
    await expect(machineCard.locator('dd').nth(1)).toHaveText('QC4');
    // The quality check is listed under its machine only, never as a template of its own.
    await expect(page.getByRole('link', { name: 'QC4 · Pre start-up' })).toHaveCount(0);
    await page.evaluate(() => localStorage.setItem('templates.view', 'list'));
    await page.reload();
    await expect(page.getByRole('row', { name: machine.name }).getByRole('cell').nth(4)).toHaveText(
      '1QC4',
    );
  });

  test('exports a quality check and imports it on the same machine as a new draft', async ({
    page,
    machine,
  }) => {
    const check = await createQualityCheck(machine, true);
    await page.goto(`/templates/${machine.id}/quality-checks/${check.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'QC4 · Pre start up' })).toBeVisible();
    // Not saved yet: the file has what the editor shows.
    await page.getByLabel('Row 1.b how').fill('Readable from the door.');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Quality check actions' }).click();
    await page.getByRole('menuitem', { name: 'Export JSON' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('QC4 Pre start up – E2E.json');
    const content = await readFile((await download.path())!, 'utf8');
    const file = QualityCheckExportSchema.parse(JSON.parse(content));
    expect(file.qualityCheck.quality).toEqual(check.quality);
    expect(file.qualityCheck.sections[0]!.items[1]!.how).toBe('Readable from the door.');
    expect(file.qualityCheck.sections[0]!.items[0]).toMatchObject({
      references: ['ISO 12100', 'ISO 7010'],
      timeHours: 0.2,
    });

    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Quality checks' })
      .click();
    const chooseFile = async (chosen: { name: string; buffer: Buffer }) => {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import JSON' }).click();
      await (await chooser).setFiles({ ...chosen, mimeType: 'application/json' });
    };

    // A final inspection template's file is not a quality check's.
    const templateFile = await page.request.get(`/api/templates/${machine.id}`);
    expect(templateFile.status()).toBe(200);
    await chooseFile({
      name: 'template.json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'modig-final-inspection/template',
          version: 1,
          exportedAt: new Date().toISOString(),
          template: { name: machine.name, modelCode: 'E2E', sections: machine.sections },
        }),
      ),
    });
    await expect(page.getByRole('alert')).toContainText(
      '“template.json” can’t be imported. This is a final inspection template file.',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await chooseFile({ name: download.suggestedFilename(), buffer: Buffer.from(content) });
    const dialog = page.getByRole('dialog', { name: 'Import quality check' });
    await expect(dialog).toContainText(
      `From “${download.suggestedFilename()}”: 1 section, 2 rows. It becomes a new draft for E2E`,
    );
    await expect(dialog.getByLabel('Position')).toHaveValue('QC4');
    await expect(dialog.getByLabel('Position')).toHaveAccessibleDescription(
      '“QC4 · Pre start up” has this position too.',
    );
    await dialog.getByLabel('Position').fill('QC5');
    await dialog.getByLabel('Operation').fill('Run in');
    await dialog.getByRole('button', { name: 'Import quality check' }).click();
    await page.waitForURL(new RegExp(`/templates/${machine.id}/quality-checks/[A-Za-z0-9]{16}$`));
    const importedId = page.url().split('/').at(-1)!;
    expect(importedId).not.toBe(check.id);
    await expect(page.getByRole('heading', { level: 1, name: 'QC5 · Run in' })).toBeVisible();
    await expect(page.getByText('Not published', { exact: true })).toBeVisible();

    const imported = await savedDraft(page.request, importedId);
    expect(imported).toMatchObject({
      kind: 'quality',
      parentId: machine.id,
      quality: { ...check.quality, position: 'QC5', operation: 'Run in' },
    });
    // Fresh ids, the rest as exported.
    const oldIds = new Set([check.sections[0]!.id, ...check.sections[0]!.items.map((i) => i.id)]);
    expect(
      [imported.sections[0]!.id, ...imported.sections[0]!.items.map((i) => i.id)].filter((x) =>
        oldIds.has(x),
      ),
    ).toEqual([]);
    expect(imported.sections[0]!.items.map(({ id: _id, ...item }) => item)).toEqual(
      file.qualityCheck.sections[0]!.items.map(({ id: _id, ...item }) => item),
    );

    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Quality checks' })
      .click();
    await expect(tabs(page).getByRole('link', { name: 'Quality checks (2)' })).toBeVisible();
  });

  test('deleting the machine’s template deletes its quality checks, after saying so', async ({
    page,
    machine,
  }) => {
    const check = await createQualityCheck(machine);
    await page.goto(`/templates/${machine.id}`);
    await page.getByRole('button', { name: 'Template actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete template' }).click();
    const confirm = page.getByRole('dialog', { name: `Delete “${machine.name}”?` });
    await expect(confirm).toContainText('Its quality check, QC4 · Pre start up, is deleted too.');
    await confirm.getByRole('button', { name: 'Delete template' }).click();
    await page.waitForURL(/\/templates$/);
    await expect(
      page.getByRole('status').filter({ hasText: 'Its quality check was deleted too.' }),
    ).toBeVisible();
    expect((await page.request.get(`/api/templates/${check.id}`)).status()).toBe(404);
  });
});

test.describe('an inspector', () => {
  test.beforeEach(({ context }) => signIn(context, INSPECTOR, ['inspector']));

  test('sees a quality check read-only and cannot change it', async ({ page, machine }) => {
    const check = await createQualityCheck(machine, true);
    await page.goto(`/templates/${machine.id}/quality-checks`);
    await expect(page.getByRole('button', { name: /New quality check|Import JSON/ })).toHaveCount(
      0,
    );
    await page.getByRole('link', { name: 'QC4 · Pre start up' }).click();
    await page.waitForURL(`**/templates/${machine.id}/quality-checks/${check.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'QC4 · Pre start up' })).toBeVisible();
    await expect(page.getByText('Rev 1', { exact: true })).toBeVisible();
    const main = page.locator('main');
    await expect(main).toContainText('Document no.1.22.2');
    await expect(main.getByRole('heading', { level: 2, name: 'Safety features' })).toBeVisible();
    await expect(main).toContainText('Should be visible and not turned inward.');
    await expect(
      main.getByRole('list', { name: 'References of row 1.a' }).getByRole('listitem'),
    ).toHaveText(['ISO 12100', 'ISO 7010']);
    await expect(main).toContainText('0.2 h');
    await expect(main.locator('input, textarea, select')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Publish|Add row|Add section|Move|actions/ }),
    ).toHaveCount(0);

    // The API refuses every change, the quality check's and a new one.
    const forbidden = [
      await page.request.get(`/api/templates/${check.id}`),
      await page.request.put(`/api/templates/${check.id}`, {
        data: { name: 'x', modelCode: 'E2E', sections: [] },
        headers: { 'If-Match': '"x"' },
      }),
      await page.request.delete(`/api/templates/${check.id}`, { headers: { 'If-Match': '"x"' } }),
      await page.request.post(`/api/templates/${check.id}/publish`, {
        data: {},
        headers: { 'If-Match': '"x"' },
      }),
      await page.request.post('/api/templates', {
        data: { kind: 'quality', parentId: machine.id, position: 'QC9', operation: '' },
      }),
    ];
    expect(forbidden.map((response) => response.status())).toEqual([403, 403, 403, 403, 403]);
    // Reading the published revision is allowed.
    expect((await page.request.get(`/api/templates/${check.id}/revisions/1`)).status()).toBe(200);
  });

  test('cannot create an inspection from a quality check', async ({ page, machine }) => {
    const check = await createQualityCheck(machine, true);
    // The new inspection page offers the machine's final inspection template only.
    await page.goto('/inspections/new');
    await expect(page.getByText(machine.name).first()).toBeVisible();
    await expect(page.getByText('QC4 · Pre start up')).toHaveCount(0);

    const response = await page.request.post('/api/inspections', {
      data: {
        templateId: check.id,
        front: {
          machineName: 'RigiMill MG #7',
          serialNumber: 'SN-1',
          participants: [],
          location: 'Kalmar, Sweden',
          date: '2026-11-05',
        },
      },
    });
    expect(response.status()).toBe(400);
    expect(((await response.json()) as { message: string }).message).toBe(
      'A quality check can’t be used for an inspection. Choose the machine’s final inspection template.',
    );
    // Nothing is listed as a quality check's inspection.
    const list = TemplateListSchema.parse(await (await page.request.get('/api/templates')).json());
    expect(list.find((summary) => summary.id === check.id)).toMatchObject({
      kind: 'quality',
      parentId: machine.id,
    });
  });
});

/** The id of the row with this ref, from its card's What field. */
async function rowId(page: Page, ref: string): Promise<string> {
  const id = await page.getByLabel(`Row ${ref} what to check`).getAttribute('data-item-text');
  if (!id) throw new Error(`No row ${ref}`);
  return id;
}
