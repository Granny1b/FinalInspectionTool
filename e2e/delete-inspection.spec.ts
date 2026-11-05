import { InspectionSchema, type Inspection, type Template } from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { testPhoto, uploadPhoto } from './support/photos';
import {
  createTemplate,
  deleteImages,
  deleteInspection,
  deleteTemplate,
  deviationRows,
} from './support/storage';

const INSPECTOR = 'sam.andersson@modig.se';
const ADMIN = 'anna.andersson@modig.se';

type Loaded = { inspection: Inspection; etag: string };

/**
 * Each test gets its own throwaway template (published revision 1, model E2E) and creates its
 * inspections through the API. Whatever a test leaves behind (a failed test's inspection, a photo)
 * is deleted afterwards, straight from the local Azurite.
 */
const test = base.extend<{
  published: Template;
  created: { create: (request: APIRequestContext, machine: string) => Promise<Loaded> };
  photos: string[];
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  published: async ({}, use, testInfo) => {
    const template = await createTemplate(`E2E delete inspection – ${testInfo.title}`, true);
    await use(template);
    await deleteTemplate(template.id);
  },
  created: async ({ published }, use) => {
    const ids: string[] = [];
    await use({
      create: async (request, machine) => {
        const response = await request.post('/api/inspections', {
          data: {
            templateId: published.id,
            front: {
              machineName: machine,
              serialNumber: 'SN-4711',
              participants: ['Erik Lund'],
              location: 'Kalmar, Sweden',
              date: '2026-11-05',
            },
          },
        });
        expect(response.status()).toBe(201);
        const loaded = loadedFrom(await response.json(), response.headers());
        ids.push(loaded.inspection.id);
        return loaded;
      },
    });
    await Promise.all(ids.map(deleteInspection));
  },
  // eslint-disable-next-line no-empty-pattern -- as above
  photos: async ({}, use) => {
    const ids: string[] = [];
    await use(ids);
    await deleteImages(ids);
  },
});

function loadedFrom(body: unknown, headers: Record<string, string>): Loaded {
  const etag = headers['etag'];
  expect(etag).toBeTruthy();
  return { inspection: InspectionSchema.parse(body), etag: etag! };
}

/** PUT of the client-owned fields with these results, as the page's autosave sends them. */
async function saveResults(
  request: APIRequestContext,
  { inspection, etag }: Loaded,
  results: Inspection['results'],
): Promise<Loaded> {
  const { modelCode: _model, ...front } = inspection.front;
  const response = await request.put(`/api/inspections/${inspection.id}`, {
    headers: { 'If-Match': etag },
    data: { front, results, extraDeviations: inspection.extraDeviations },
  });
  expect(response.status()).toBe(200);
  return loadedFrom(await response.json(), response.headers());
}

async function openInspection(page: Page, { inspection }: Loaded): Promise<void> {
  await page.goto(`/inspections/${inspection.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `${inspection.number} · ${inspection.front.machineName}`,
  );
}

test('an admin deletes an inspection from its page, with its photos and deviation records', async ({
  page,
  context,
  browser,
  published,
  created,
  photos,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const loaded = await created.create(page.request, `Delete me – ${published.id}`);
  const { id, number } = loaded.inspection;
  const [rowId] = published.sections[0]!.items.map((item) => item.id);
  const photoId = await uploadPhoto(
    page.request,
    await testPhoto(browser, { width: 320, height: 240, label: 'Delete me' }),
  );
  photos.push(photoId);
  await saveResults(page.request, loaded, {
    [rowId!]: {
      status: 'NOK',
      comment: 'Screw missing',
      photos: [{ imageId: photoId, annotations: [] }],
    },
  });
  expect(await deviationRows(id)).toHaveLength(1);

  await openInspection(page, loaded);
  const menu = page.getByRole('button', { name: 'Inspection actions' });
  await menu.click();
  await page.getByRole('menuitem', { name: 'Delete inspection' }).click();
  const confirm = page.getByRole('dialog', { name: `Delete ${number}?` });
  await expect(confirm).toContainText(
    'its deviation photos and its deviation records will be deleted, and Insights stops counting it',
  );
  await expect(confirm).toContainText('This can’t be undone.');
  // Cancel keeps it, and the focus goes back to the menu.
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await page.getByRole('menuitem', { name: 'Delete inspection' }).click();
  await confirm.getByRole('button', { name: 'Delete inspection' }).click();
  await page.waitForURL(/\/inspections(\?.*)?$/);
  await expect(
    page.getByRole('status').filter({ hasText: `${number} was deleted.` }),
  ).toBeVisible();
  // The list has loaded (other tests' inspections, or none at all), without it.
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /^\d+ inspections?$/ })
      .or(page.getByText('No inspections yet')),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: number, exact: true })).toHaveCount(0);

  // Gone from the API, the deviation table (Insights' source) and storage.
  expect((await page.request.get(`/api/inspections/${id}`)).status()).toBe(404);
  const listed = (await (await page.request.get('/api/inspections')).json()) as { id: string }[];
  expect(listed.map((summary) => summary.id)).not.toContain(id);
  await expect.poll(() => deviationRows(id)).toEqual([]);
  expect((await page.request.get(`/api/images/${photoId}/url`)).status()).toBe(404);

  // Dismissed, it stays away on reload.
  await page
    .getByRole('status')
    .filter({ hasText: `${number} was deleted.` })
    .getByRole('button', { name: 'Dismiss' })
    .click();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Inspections' })).toBeVisible();
  await expect(page.getByText(`${number} was deleted.`)).toHaveCount(0);
});

test('an admin’s delete is refused when someone else saved in between, and offers Reload', async ({
  page,
  context,
  published,
  created,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const loaded = await created.create(page.request, `Changed meanwhile – ${published.id}`);
  const { id, number } = loaded.inspection;
  await openInspection(page, loaded);
  // Someone else saves after the page has opened.
  const [rowId] = published.sections[0]!.items.map((item) => item.id);
  await saveResults(page.request, loaded, { [rowId!]: { status: 'OK' } });

  await page.getByRole('button', { name: 'Inspection actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete inspection' }).click();
  const confirm = page.getByRole('dialog', { name: `Delete ${number}?` });
  await confirm.getByRole('button', { name: 'Delete inspection' }).click();
  await expect(confirm.getByRole('alert')).toHaveText(
    /^Someone else changed this inspection since you opened it, so nothing was deleted\./,
  );
  const reload = confirm.getByRole('button', { name: 'Reload' });
  await expect(reload).toBeFocused();
  expect((await page.request.get(`/api/inspections/${id}`)).status()).toBe(200);

  // Reload shows their change; the inspection is still there.
  await reload.click();
  await expect(confirm).toBeHidden();
  await expect(page.locator(`#row-${rowId}`).locator('[aria-pressed="true"]')).toHaveText('OK');
  await expect(page).toHaveURL(new RegExp(`/inspections/${id}$`));
});

test('an inspector has no Delete inspection, and the API refuses it', async ({
  page,
  context,
  published,
  created,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const loaded = await created.create(page.request, `Keep me – ${published.id}`);
  await openInspection(page, loaded);
  await expect(page.getByRole('button', { name: 'Finalise', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspection actions' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Delete inspection' })).toHaveCount(0);

  const refused = await page.request.delete(`/api/inspections/${loaded.inspection.id}`, {
    headers: { 'If-Match': loaded.etag },
  });
  expect(refused.status()).toBe(403);
  expect((await page.request.get(`/api/inspections/${loaded.inspection.id}`)).status()).toBe(200);
});
