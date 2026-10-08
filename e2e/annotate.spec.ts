import { ANNOTATION_COLORS, InspectionSchema, type Annotation, type Template } from '@modig/shared';
import { expect, test as base, type Locator, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { jpegSize, testPhoto } from './support/photos';
import { createTemplate, deleteInspection, deleteTemplate } from './support/storage';

/**
 * Deviation photos (brief §5.4, in phase 4 at the user's request): a photo added to a deviation
 * and marked up in the real annotation editor with the mouse, saved, and still there after a
 * reload: the marks stored as fractions of the photo, plus a flattened copy with them, which the
 * thumbnail and the printed deviation card show. Throwaway template and inspection, deleted
 * afterwards with their photos.
 */

const INSPECTOR = 'erik.lund@modig.se';

const test = base.extend<{ published: Template; tracked: string[] }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  published: async ({}, use) => {
    const template = await createTemplate('E2E annotate', true);
    await use(template);
    await deleteTemplate(template.id);
  },
  // eslint-disable-next-line no-empty-pattern -- as above
  tracked: async ({}, use) => {
    const ids: string[] = [];
    await use(ids);
    await Promise.all(ids.map(deleteInspection));
  },
});

const editor = (page: Page) => page.locator('dialog[data-annotation-editor]');
const canvas = (page: Page) => editor(page).locator('[data-annotation-canvas]');

/** A point on the photo in the editor, as fractions of its width and height. */
async function onPhoto(page: Page, [x, y]: [number, number]): Promise<[number, number]> {
  const box = (await canvas(page).boundingBox())!;
  return [box.x + x * box.width, box.y + y * box.height];
}

async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(...(await onPhoto(page, from)));
  await page.mouse.down();
  await page.mouse.move(...(await onPhoto(page, to)), { steps: 10 });
  await page.mouse.up();
}

async function pick(page: Page, group: 'Tool' | 'Colour', name: string): Promise<void> {
  await editor(page).getByRole('group', { name: group }).getByRole('button', { name }).click();
}

/** Every number of a mark: a fraction of the photo, rounded to at most 4 decimals. */
function fractions(annotation: Annotation): number[] {
  switch (annotation.kind) {
    case 'arrow':
    case 'freehand':
      return annotation.points;
    case 'text':
      return [annotation.x, annotation.y, annotation.size];
    default:
      return [annotation.x, annotation.y, annotation.w, annotation.h];
  }
}

/** RGB of a pixel of an image (by its read URL), at fractions of its size, decoded in the page. */
async function pixel(page: Page, url: string, at: [number, number]): Promise<number[]> {
  return page.evaluate(
    async ({ url, at }) => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      const x = Math.round(at[0] * bitmap.width);
      const y = Math.round(at[1] * bitmap.height);
      return Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
    },
    { url, at },
  );
}

async function readUrl(page: Page, imageId: string): Promise<string> {
  const response = await page.request.get(`/api/images/${imageId}/url`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { url: string }).url;
}

test('a deviation photo marked up with an arrow and a label is saved, reloaded and printed', async ({
  page,
  context,
  browser,
  published,
  tracked,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const created = await page.request.post('/api/inspections', {
    data: {
      templateId: published.id,
      front: {
        machineName: 'RigiMill MG – Volvo Cars Skövde',
        serialNumber: 'RM-2026-041',
        participants: ['Erik Lund'],
        location: 'Kalmar, Sweden',
        date: '2026-10-08',
      },
    },
  });
  expect(created.status()).toBe(201);
  const { id } = InspectionSchema.parse(await created.json());
  tracked.push(id);
  const itemId = published.sections[0]!.items[1]!.id;

  // Row 1.b is NOK: it becomes D-01 on the Deviations tab, where photos are added.
  await page.goto(`/inspections/${id}`);
  await page.locator(`#row-${itemId}`).getByRole('button', { name: 'NOK', exact: true }).click();
  await page.locator(`[data-comment="${itemId}"]`).fill('Cable not fixed to the rail');
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  const card: Locator = page.locator('article[data-deviation="D-01"]');
  const original = await testPhoto(browser, { width: 1200, height: 900, label: 'Cabinet' });
  await card
    .locator('[data-photo-input]')
    .setInputFiles({ name: 'cabinet.jpg', mimeType: 'image/jpeg', buffer: original });

  // The editor opens on the new photo: an arrow and a label, in red, drawn with the mouse.
  await expect(editor(page)).toBeVisible();
  await expect(canvas(page)).toBeVisible({ timeout: 20_000 });
  await pick(page, 'Tool', 'Arrow');
  await pick(page, 'Colour', 'Red');
  await drag(page, [0.3, 0.3], [0.55, 0.55]);
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 1 mark');
  await pick(page, 'Tool', 'Text');
  await page.mouse.click(...(await onPhoto(page, [0.6, 0.62])));
  await page.keyboard.type('Loose cable');
  await page.keyboard.press('Enter');
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 2 marks');
  await editor(page).getByRole('textbox', { name: 'Caption' }).fill('Terminal row X2');
  await editor(page).getByRole('button', { name: 'Save' }).click();
  // Save uploads the photo and its flattened copy, then closes.
  await expect(editor(page)).toBeHidden({ timeout: 30_000 });
  await expect(card.getByRole('button', { name: 'Edit photo 1: Terminal row X2' })).toBeFocused();

  // Autosaved with the inspection: the marks as fractions, and the flattened copy.
  await expect
    .poll(
      async () => {
        const stored = InspectionSchema.parse(
          await (await page.request.get(`/api/inspections/${id}`)).json(),
        );
        return stored.results[itemId]?.photos?.[0]?.renderedImageId ?? null;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  const stored = InspectionSchema.parse(
    await (await page.request.get(`/api/inspections/${id}`)).json(),
  );
  const [photo] = stored.results[itemId]!.photos!;
  expect(stored.results[itemId]!.photos).toHaveLength(1);
  expect(photo!.caption).toBe('Terminal row X2');
  expect(photo!.renderedImageId).not.toBe(photo!.imageId);
  const [arrow, label] = photo!.annotations;
  expect(arrow).toMatchObject({ kind: 'arrow', color: ANNOTATION_COLORS.red });
  expect(label).toMatchObject({ kind: 'text', text: 'Loose cable', color: ANNOTATION_COLORS.red });
  if (arrow?.kind !== 'arrow' || label?.kind !== 'text') throw new Error('Unexpected marks');
  arrow.points.forEach((value, index) =>
    expect(value).toBeCloseTo([0.3, 0.3, 0.55, 0.55][index]!, 1),
  );
  expect(label.x).toBeCloseTo(0.6, 1);
  expect(label.y).toBeCloseTo(0.62, 1);
  for (const value of photo!.annotations.flatMap(fractions)) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
    expect(Math.round(value * 1e4) / 1e4).toBe(value);
  }

  // The flattened copy is a JPEG of the photo's own size, red along the arrow, the photo
  // elsewhere.
  const [photoUrl, renderedUrl] = await Promise.all([
    readUrl(page, photo!.imageId),
    readUrl(page, photo!.renderedImageId!),
  ]);
  const rendered = Buffer.from(await (await fetch(renderedUrl)).arrayBuffer());
  expect(jpegSize(rendered)).toEqual({ width: 1200, height: 900 });
  const [red, green, blue] = await pixel(page, renderedUrl, [0.425, 0.425]);
  expect(red).toBeGreaterThan(170);
  expect(green).toBeLessThan(90);
  expect(blue).toBeLessThan(90);
  const away = await pixel(page, renderedUrl, [0.1, 0.9]);
  const unmarked = await pixel(page, photoUrl, [0.1, 0.9]);
  away.forEach((value, index) => expect(Math.abs(value - unmarked[index]!)).toBeLessThan(16));

  // After a reload: the thumbnail shows the flattened copy, and the marks open again.
  await page.reload();
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  const thumbnail = card.getByRole('button', { name: 'Edit photo 1: Terminal row X2' });
  await expect(thumbnail.locator('img')).toHaveAttribute(
    'src',
    new RegExp(`/images/${photo!.renderedImageId}\\.jpg\\?`),
  );
  await thumbnail.click();
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 2 marks', {
    timeout: 20_000,
  });
  await editor(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(editor(page)).toBeHidden();

  // The report's card prints the flattened copy.
  await page.goto(`/inspections/${id}/print?mode=report`);
  await expect(page.locator('[data-print-root]')).toHaveAttribute('data-print-ready', 'true', {
    timeout: 30_000,
  });
  const printed = page.locator('[data-deviation-card="D-01"] img');
  await expect(printed).toHaveAttribute(
    'src',
    new RegExp(`/images/${photo!.renderedImageId}\\.jpg\\?`),
  );
  expect(await printed.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1200);
});
