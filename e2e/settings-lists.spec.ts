/**
 * The Settings page's models and lists card (admins). The settings are one document shared by
 * every test running in parallel, so these tests change nothing that is there: they add a model
 * and list entries of their own, named with a tag, and remove them again whatever happens.
 */
import {
  CONFLICT_MESSAGE,
  InspectionSchema,
  newId,
  SettingsSchema,
  settingsInput,
  suggestModelCode,
  type Settings,
} from '@modig/shared';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { createTemplate, deleteInspection, deleteTemplate } from './support/storage';

const ADMIN = 'anna.andersson@modig.se';

test.beforeEach(({ context }) => signIn(context, ADMIN, ['admin']));

async function storedSettings(
  request: APIRequestContext,
): Promise<{ settings: Settings; etag: string }> {
  const response = await request.get('/api/settings');
  expect(response.status()).toBe(200);
  const etag = response.headers()['etag'];
  expect(etag).toBeTruthy();
  return { settings: SettingsSchema.parse(await response.json()), etag: etag! };
}

/**
 * Removes every model and list entry whose name holds `tag`, reading again when another test
 * saved in between (412); a no-op when there are none.
 */
async function removeTagged(request: APIRequestContext, tag: string): Promise<void> {
  const keep = (value: string) => !value.includes(tag);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { settings, etag } = await storedSettings(request);
    const input = settingsInput(settings);
    const cleaned = {
      ...input,
      machineModels: input.machineModels.filter((model) => keep(model.name)),
      responsibles: input.responsibles.filter(keep),
      deviationCategories: input.deviationCategories.filter(keep),
    };
    if (JSON.stringify(cleaned) === JSON.stringify(input)) return;
    const response = await request.put('/api/settings', {
      headers: { 'If-Match': etag },
      data: cleaned,
    });
    if (response.status() === 200) return;
    expect(response.status()).toBe(412);
  }
  throw new Error(`The settings still hold entries tagged ${tag}.`);
}

const card = (page: Page) => page.getByRole('region', { name: 'Models, lists & reports' });
const list = (page: Page, name: 'Responsible' | 'Deviation categories') =>
  card(page).getByRole('group', { name, exact: true });
const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });

test('an admin adds a model and list entries, which inspections then offer, and removes them again', async ({
  page,
}) => {
  const tag = newId();
  const model = `E2E model ${tag}`;
  const responsible = `E2E responsible ${tag}`;
  const category = `E2E category ${tag}`;
  try {
    const before = (await storedSettings(page.request)).settings;
    await page.goto('/settings');
    const save = card(page).getByRole('button', { name: 'Save', exact: true });
    await expect(card(page).getByText('No changes')).toBeVisible();

    // A new model's code follows its name.
    const number = before.machineModels.length + 1;
    await card(page).getByRole('button', { name: 'Add model' }).click();
    await expect(card(page).getByLabel(`Name, model ${number}`, { exact: true })).toBeFocused();
    await page.keyboard.type(model);
    const code = suggestModelCode(
      model,
      before.machineModels.map((existing) => existing.code),
    );
    await expect(card(page).getByLabel(`Code, model ${number}`, { exact: true })).toHaveValue(code);

    // Enter adds an entry at the end of its list; moving it keeps the focus on its button.
    const responsibles = list(page, 'Responsible');
    await responsibles.getByLabel('New responsible', { exact: true }).fill(responsible);
    await page.keyboard.press('Enter');
    const last = before.responsibles.length + 1;
    await expect(responsibles.getByLabel(`Responsible ${last}`, { exact: true })).toHaveValue(
      responsible,
    );
    const up = responsibles.getByRole('button', { name: `Move ${responsible} up` });
    await up.click();
    await expect(up).toBeFocused();
    await expect(responsibles.getByLabel(`Responsible ${last - 1}`, { exact: true })).toHaveValue(
      responsible,
    );

    // A category already on the list (ignoring case) is refused.
    const categories = list(page, 'Deviation categories');
    const newCategory = categories.getByLabel('New category', { exact: true });
    await newCategory.fill(before.deviationCategories[0]!.toUpperCase());
    await categories.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(categories.getByText('Already on the list')).toBeVisible();
    await newCategory.fill(category);
    await categories.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(card(page).getByText('Unsaved changes')).toBeVisible();
    await save.click();
    await expect(card(page).getByText('Settings saved.')).toBeVisible();
    // Saved, the code is fixed.
    await expect(card(page).getByLabel(`Code, model ${number}`, { exact: true })).toHaveCount(0);
    await expect(card(page).getByText(code)).toBeVisible();

    const saved = (await storedSettings(page.request)).settings;
    expect(saved).toMatchObject({
      machineModels: [...before.machineModels, { code, name: model }],
      responsibles: [...before.responsibles.slice(0, -1), responsible, before.responsibles.at(-1)],
      deviationCategories: [...before.deviationCategories, category],
      updatedBy: ADMIN,
    });

    // An inspection offers both on a NOK row.
    const template = await createTemplate(`E2E settings lists – ${tag}`, true);
    let inspectionId = '';
    try {
      const created = await page.request.post('/api/inspections', {
        data: {
          templateId: template.id,
          front: {
            machineName: `Lists – ${tag}`,
            serialNumber: 'SN-1',
            participants: [],
            location: 'Kalmar, Sweden',
            date: '2026-10-07',
          },
        },
      });
      expect(created.status()).toBe(201);
      const inspection = InspectionSchema.parse(await created.json());
      inspectionId = inspection.id;
      const itemId = inspection.templateSnapshot.sections[0]!.items[0]!.id;
      await page.goto(`/inspections/${inspection.id}`);
      await page
        .locator(`#row-${itemId}`)
        .getByRole('button', { name: 'NOK', exact: true })
        .click();
      await expect(page.locator(`[data-resp="${itemId}"] option`)).toContainText([responsible]);
      await expect(page.locator(`[data-category="${itemId}"] option`)).toContainText([category]);
      await page.locator(`[data-category="${itemId}"]`).selectOption(category);
      await expect(page.locator('main header [role="status"]')).toHaveText('Saved');
    } finally {
      if (inspectionId) await deleteInspection(inspectionId);
      await deleteTemplate(template.id);
    }

    // Removing a saved model asks first, and says what happens to what uses it.
    await page.goto('/settings');
    await card(page)
      .getByRole('button', { name: `Remove ${model}` })
      .click();
    const confirm = page.getByRole('dialog', { name: `Remove ${model}?` });
    await expect(confirm).toContainText(`keep the model code ${code}`);
    await confirm.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(card(page).getByRole('button', { name: `Remove ${model}` })).toHaveCount(0);
    await responsibles.getByRole('button', { name: `Remove ${responsible}` }).click();
    await categories.getByRole('button', { name: `Remove ${category}` }).click();
    await save.click();
    await expect(card(page).getByText('Settings saved.')).toBeVisible();
    expect((await storedSettings(page.request)).settings).toMatchObject({
      machineModels: before.machineModels,
      responsibles: before.responsibles,
      deviationCategories: before.deviationCategories,
    });
  } finally {
    await removeTagged(page.request, tag);
  }
});

test('Save after someone else saved is refused with Reload; leaving with changes asks first', async ({
  page,
}) => {
  const tag = newId();
  const responsible = `E2E responsible ${tag}`;
  try {
    await page.goto('/settings');
    const responsibles = list(page, 'Responsible');
    await responsibles.getByLabel('New responsible', { exact: true }).fill(responsible);
    await page.keyboard.press('Enter');
    const remove = responsibles.getByRole('button', { name: `Remove ${responsible}` });
    await expect(remove).toBeVisible();

    // Leaving asks first; Cancel stays, with the change.
    await mainNav(page).getByRole('link', { name: 'Inspections' }).click();
    const leave = page.getByRole('dialog', { name: 'Leave without saving?' });
    await leave.getByRole('button', { name: 'Cancel' }).click();
    await expect(leave).toBeHidden();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(remove).toBeVisible();

    // Someone else saves meanwhile: the same settings, so nothing changes for other tests.
    const { settings, etag } = await storedSettings(page.request);
    const other = await page.request.put('/api/settings', {
      headers: { 'If-Match': etag },
      data: settingsInput(settings),
    });
    expect(other.status()).toBe(200);
    await card(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(card(page).getByRole('alert')).toContainText(CONFLICT_MESSAGE);
    expect((await storedSettings(page.request)).settings.responsibles).not.toContain(responsible);

    // Reload asks before it drops the change, then shows the latest settings.
    await card(page).getByRole('button', { name: 'Reload' }).click();
    await page
      .getByRole('dialog', { name: 'Discard your changes?' })
      .getByRole('button', { name: 'Discard and reload' })
      .click();
    await expect(card(page).getByText('No changes')).toBeVisible();
    await expect(remove).toHaveCount(0);

    // Nothing unsaved: leaving doesn't ask.
    await mainNav(page).getByRole('link', { name: 'Inspections' }).click();
    await expect(page).toHaveURL(/\/inspections$/);
  } finally {
    await removeTagged(page.request, tag);
  }
});

test('inspectors can read the settings but not change them', async ({ page, context }) => {
  await context.clearCookies();
  await signIn(context, 'sam.andersson@modig.se', ['inspector']);
  const { settings, etag } = await storedSettings(page.request);
  const refused = await page.request.put('/api/settings', {
    headers: { 'If-Match': etag },
    data: settingsInput(settings),
  });
  expect(refused.status()).toBe(403);
});
