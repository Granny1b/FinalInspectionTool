/**
 * Taking a picture live with the device's camera, where pictures are added (here a quality
 * check's row): the camera's picture, Take picture, then the same editor a chosen file opens in.
 * Chromium stands in for the camera with a generated picture and answers the permission prompt.
 */
import { TemplateDetailSchema, type Template } from '@modig/shared';
import { expect, test as base } from '@playwright/test';
import { signIn } from './support/auth';
import {
  createQualityCheck,
  createTemplate,
  deleteQualityChecks,
  deleteTemplate,
} from './support/storage';

const ADMIN = 'anna.andersson@modig.se';

const test = base.extend<{ machine: Template }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  machine: async ({}, use, testInfo) => {
    const machine = await createTemplate(`E2E camera machine – ${testInfo.title}`, true);
    await use(machine);
    await deleteQualityChecks(machine.id);
    await deleteTemplate(machine.id);
  },
});

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test('an admin takes a row’s picture with the camera', async ({ page, context, machine }) => {
  await signIn(context, ADMIN, ['admin']);
  const check = await createQualityCheck(machine);
  await page.goto(`/templates/${machine.id}/quality-checks/${check.id}`);
  await page.getByRole('button', { name: 'Add pictures to row 1.a' }).click();
  const pictures = page.locator('dialog[data-guide-editor]');
  await pictures.getByRole('button', { name: /^Take picture/ }).click();

  const camera = page.getByRole('dialog', { name: 'Take a picture' });
  const video = camera.getByLabel('The camera’s picture');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  await camera.getByRole('button', { name: 'Take picture' }).click();
  await expect(camera).toBeHidden();
  // The camera is switched off with its dialog.
  await expect(page.locator('video')).toHaveCount(0);

  // From here on it is a picture like any other: drawn on, saved, uploaded.
  const annotation = page.locator('dialog[data-annotation-editor]');
  await expect(annotation.getByRole('heading', { name: 'New picture' })).toBeVisible();
  await expect(annotation.locator('[data-annotation-canvas]')).toBeVisible({ timeout: 20_000 });
  await annotation.getByRole('button', { name: 'Save' }).click();
  await expect(annotation).toBeHidden({ timeout: 30_000 });
  await pictures.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pictures).toBeHidden();
  await expect(page.locator('main header [role="status"]')).toHaveText(/Saved/);

  const stored = TemplateDetailSchema.parse(
    await (await page.request.get(`/api/templates/${check.id}`)).json(),
  ).draft;
  expect(stored.sections[0]?.items[0]?.guide?.images).toHaveLength(1);
});

test('a camera that is not allowed says so', async ({ page, context, machine }) => {
  await signIn(context, ADMIN, ['admin']);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  const check = await createQualityCheck(machine);
  await page.goto(`/templates/${machine.id}/quality-checks/${check.id}`);
  await page.getByRole('button', { name: 'Add pictures to row 1.a' }).click();
  await page
    .locator('dialog[data-guide-editor]')
    .getByRole('button', { name: /^Take picture/ })
    .click();
  const camera = page.getByRole('dialog', { name: 'Take a picture' });
  await expect(camera.getByRole('alert')).toContainText('The camera is not allowed for this site.');
  await expect(camera.getByRole('button', { name: 'Take picture' })).toBeDisabled();
  await camera.getByRole('button', { name: 'Cancel' }).click();
  await expect(camera).toBeHidden();
});
