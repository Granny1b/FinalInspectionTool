import {
  ANNOTATION_COLORS,
  InspectionSchema,
  MAX_PHOTOS_PER_DEVIATION,
  type AnnotatedImage,
  type Annotation,
  type ExtraDeviation,
  type Inspection,
  type RowResult,
  type Template,
} from '@modig/shared';
import {
  expect,
  test as base,
  type APIRequestContext,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
import { signIn } from './support/auth';
import { jpegSize, testPhoto, uploadPhoto } from './support/photos';
import { createTemplate, deleteInspection, deleteTemplate } from './support/storage';

/**
 * Deviation photos (brief §5.4, in phase 4 at the user's request): a photo added to a deviation
 * and marked up in the real annotation editor with the mouse, saved, and still there after a
 * reload: the marks stored as fractions of the photo, plus a flattened copy with them, which the
 * thumbnail and the printed deviation card show. Also: at most two photos a deviation, photos on
 * extra deviations, the read-only viewer of a finalised inspection, which never loads the
 * editor, leaving the page with unsaved marks, an editor that can't load, and the editor's
 * keyboard, label colour and stopped saves. Throwaway template and inspections, deleted
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

type Created = { inspection: Inspection; etag: string };

/** An inspection of the throwaway template, created through the API; deleted after the test. */
async function createInspection(
  request: APIRequestContext,
  template: Template,
  tracked: string[],
): Promise<Created> {
  const response = await request.post('/api/inspections', {
    data: {
      templateId: template.id,
      front: {
        machineName: 'RigiMill MG – Volvo Cars Skövde',
        serialNumber: 'RM-2026-041',
        participants: ['Erik Lund'],
        location: 'Kalmar, Sweden',
        date: '2026-10-08',
      },
    },
  });
  expect(response.status()).toBe(201);
  const inspection = InspectionSchema.parse(await response.json());
  tracked.push(inspection.id);
  return { inspection, etag: response.headers()['etag']! };
}

/** Saves results and extra deviations as the page's autosave would; returns the new ETag. */
async function save(
  request: APIRequestContext,
  { inspection, etag }: Created,
  results: Record<string, RowResult>,
  extraDeviations: ExtraDeviation[] = [],
): Promise<string> {
  const { modelCode: _model, ...front } = inspection.front;
  const response = await request.put(`/api/inspections/${inspection.id}`, {
    headers: { 'If-Match': etag },
    data: { front, results, extraDeviations },
  });
  expect(response.status()).toBe(200);
  return response.headers()['etag']!;
}

async function stored(request: APIRequestContext, id: string): Promise<Inspection> {
  return InspectionSchema.parse(await (await request.get(`/api/inspections/${id}`)).json());
}

/** Uploads test photos as the app would: their image ids. */
async function uploadPhotos(page: Page, labels: string[]): Promise<string[]> {
  const browser = page.context().browser()!;
  return Promise.all(
    labels.map(async (label) =>
      uploadPhoto(page.request, await testPhoto(browser, { width: 1200, height: 900, label })),
    ),
  );
}

/** Puts an image on the clipboard (as PNG, the only image type it takes) and presses Ctrl+V. */
async function pasteImage(page: Page, into: Locator): Promise<void> {
  await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(400, 300);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#9aa3ad';
    context.fillRect(0, 0, 400, 300);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  });
  await into.focus();
  await page.keyboard.press('Control+V');
}

/** Drags a file over an element and drops it there, as from the file manager. */
async function dropFile(page: Page, on: Locator, file: { name: string; type: string }) {
  const transfer = await page.evaluateHandle(({ name, type }) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type }));
    return data;
  }, file);
  for (const type of ['dragenter', 'dragover', 'drop']) {
    await on.dispatchEvent(type, { dataTransfer: transfer });
  }
}

/** Requests for the editor's code and Konva, which it alone brings along (dev and build names). */
const EDITOR_CODE = /AnnotationEditor|konva/i;

/** Uploads to (and reads from) blob storage, the browser's own requests. */
const STORAGE_IMAGES = /\/devstoreaccount1\/images\//;

/**
 * Two animation frames. The page's leave guard arms in an effect after a change, so a script
 * that goes Back in the same moment can slip past it (a person can't); this lets it arm.
 */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** An 800 × 600 PNG, transparent but for a blue square in the middle (a cut-out, a diagram). */
async function transparentPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(800, 600);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#2050bf';
    context.fillRect(300, 200, 200, 200);
    const bytes = new Uint8Array(
      await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
    );
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  });
  return Buffer.from(base64, 'base64');
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
  const {
    inspection: { id },
  } = await createInspection(page.request, published, tracked);
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

test('a deviation takes two photos: then Add goes away, and a paste or drop says why', async ({
  page,
  context,
  published,
  tracked,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const created = await createInspection(page.request, published, tracked);
  const itemId = published.sections[0]!.items[1]!.id;
  const photos: AnnotatedImage[] = (await uploadPhotos(page, ['One', 'Two'])).map((imageId) => ({
    imageId,
    annotations: [],
  }));
  expect(photos).toHaveLength(MAX_PHOTOS_PER_DEVIATION);
  await save(page.request, created, { [itemId]: { status: 'NOK', photos } });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await page.goto(`/inspections/${created.inspection.id}`);
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  const card = page.locator('article[data-deviation="D-01"]');
  await expect(card.getByRole('button', { name: /^Edit photo/ })).toHaveCount(2);
  await expect(card.getByText('2 / 2')).toBeVisible();
  await expect(card.getByRole('button', { name: /^Add photo/ })).toHaveCount(0);
  // Editable photos fetch the editor in the background (the finalised test relies on the name).
  await expect.poll(() => requested.some((url) => EDITOR_CODE.test(url))).toBe(true);

  const area = card.locator('[data-annotated-photos]');
  const message = card.getByRole('alert');
  const full = 'Up to 2 photos. Remove one to add another.';
  await dropFile(page, area, { name: 'notes.txt', type: 'text/plain' });
  await expect(message).toHaveText('That isn’t a photo. Drop a JPEG or PNG image.');
  await dropFile(page, area, { name: 'third.jpg', type: 'image/jpeg' });
  await expect(message).toHaveText(full);
  await dropFile(page, area, { name: 'notes.txt', type: 'text/plain' });
  await expect(message).not.toHaveText(full);
  await pasteImage(page, card.getByRole('button', { name: 'Edit photo 1' }));
  await expect(message).toHaveText(full);
  await expect(editor(page)).toHaveCount(0);
  expect((await stored(page.request, created.inspection.id)).results[itemId]!.photos).toEqual(
    photos,
  );
});

test('an extra deviation’s photo added in the UI is saved with the inspection', async ({
  page,
  context,
  browser,
  published,
  tracked,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const { inspection } = await createInspection(page.request, published, tracked);

  await page.goto(`/inspections/${inspection.id}`);
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  await page.getByRole('button', { name: 'Add extra deviation' }).click();
  await page
    .getByRole('textbox', { name: 'Description, D-01' })
    .fill('Paint damage on the right-hand door');
  const card = page.locator('article[data-deviation="D-01"]');
  await card.locator('[data-photo-input]').setInputFiles({
    name: 'door.jpg',
    mimeType: 'image/jpeg',
    buffer: await testPhoto(browser, { width: 1200, height: 900, label: 'Door' }),
  });
  await expect(canvas(page)).toBeVisible({ timeout: 20_000 });
  await pick(page, 'Tool', 'Ellipse');
  await drag(page, [0.3, 0.3], [0.6, 0.55]);
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 1 mark');
  await editor(page).getByRole('textbox', { name: 'Caption' }).fill('Right-hand door');
  await editor(page).getByRole('button', { name: 'Save' }).click();
  await expect(editor(page)).toBeHidden({ timeout: 30_000 });
  await expect(card.getByRole('button', { name: 'Edit photo 1: Right-hand door' })).toBeFocused();

  // Autosaved in the extra deviation: the mark and its flattened copy.
  await expect
    .poll(
      async () =>
        (await stored(page.request, inspection.id)).extraDeviations[0]?.photos?.[0]
          ?.renderedImageId ?? null,
      { timeout: 15_000 },
    )
    .not.toBeNull();
  const [extra] = (await stored(page.request, inspection.id)).extraDeviations;
  expect(extra).toMatchObject({ description: 'Paint damage on the right-hand door' });
  expect(extra!.photos).toEqual([
    {
      imageId: expect.any(String),
      caption: 'Right-hand door',
      annotations: [expect.objectContaining({ kind: 'ellipse', color: ANNOTATION_COLORS.red })],
      renderedImageId: expect.any(String),
    },
  ]);

  await page.reload();
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  await expect(
    card.getByRole('button', { name: 'Edit photo 1: Right-hand door' }).locator('img'),
  ).toHaveAttribute('src', new RegExp(`/images/${extra!.photos![0]!.renderedImageId}\\.jpg\\?`));
});

test('a finalised inspection shows its photos in a viewer, without loading the editor', async ({
  page,
  context,
  published,
  tracked,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const created = await createInspection(page.request, published, tracked);
  const [photo, marked] = await uploadPhotos(page, ['Cabinet', 'Cabinet marked']);
  const [first, ...rest] = published.sections.flatMap((section) => section.items);
  const results: Record<string, RowResult> = Object.fromEntries(
    rest.map(({ id }) => [id, { status: 'OK' }]),
  );
  results[first!.id] = {
    status: 'NOK',
    comment: 'Cable not fixed to the rail',
    photos: [
      {
        imageId: photo!,
        caption: 'Terminal row X2',
        annotations: [{ kind: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.3, color: '#E02424' }],
        renderedImageId: marked,
      },
    ],
  };
  const etag = await save(page.request, created, results);
  const finalised = await page.request.post(`/api/inspections/${created.inspection.id}/finalise`, {
    headers: { 'If-Match': etag },
  });
  expect(finalised.status()).toBe(200);
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await page.goto(`/inspections/${created.inspection.id}`);
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  const card = page.locator('article[data-deviation="D-01"]');
  await expect(card.getByRole('button', { name: /^Add photo/ })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /^Remove photo/ })).toHaveCount(0);
  await card.getByRole('button', { name: 'View photo 1: Terminal row X2' }).click();

  // The marked-up copy, large, with its caption.
  const viewer = page.locator('dialog[data-photo-viewer]');
  await expect(viewer.getByRole('heading', { name: 'Photo 1' })).toBeVisible();
  const image = viewer.getByRole('img', { name: 'Terminal row X2' });
  await expect(image).toHaveAttribute('src', new RegExp(`/images/${marked}\\.jpg\\?`));
  await expect
    .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBe(1200);
  await viewer.getByRole('button', { name: 'Close' }).click();
  await expect(viewer).toBeHidden();
  expect(requested.filter((url) => EDITOR_CODE.test(url))).toEqual([]);
});

test('leaving with unsaved marks asks first; a transparent PNG is flattened on white', async ({
  page,
  context,
  published,
  tracked,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const created = await createInspection(page.request, published, tracked);
  const { id, number } = created.inspection;
  const itemId = published.sections[0]!.items[1]!.id;
  await save(page.request, created, { [itemId]: { status: 'NOK' } });

  // Opened from the list, so Back stays in the app.
  await page.goto('/inspections');
  await page.getByRole('searchbox', { name: 'Search inspections' }).fill(number);
  await page.getByRole('link', { name: number }).click();
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  const card = page.locator('article[data-deviation="D-01"]');
  await card.locator('[data-photo-input]').setInputFiles({
    name: 'cut-out.png',
    mimeType: 'image/png',
    buffer: await transparentPng(page),
  });
  await expect(canvas(page)).toBeVisible({ timeout: 20_000 });
  await drag(page, [0.2, 0.2], [0.45, 0.45]);
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 1 mark');

  // Back: the marks are in no document yet, so nothing could save them. Cancel keeps them.
  await nextFrames(page);
  await page.goBack();
  const leave = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(leave).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/inspections/${id}$`));
  await leave.getByRole('button', { name: 'Cancel' }).click();
  await expect(leave).toBeHidden();
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 1 mark');

  // Saved: where the PNG is transparent, the flattened copy is white, like the stored photo.
  await editor(page).getByRole('button', { name: 'Save' }).click();
  await expect(editor(page)).toBeHidden({ timeout: 30_000 });
  await expect
    .poll(
      async () =>
        (await stored(page.request, id)).results[itemId]?.photos?.[0]?.renderedImageId ?? null,
      { timeout: 15_000 },
    )
    .not.toBeNull();
  const [photo] = (await stored(page.request, id)).results[itemId]!.photos!;
  for (const imageId of [photo!.imageId, photo!.renderedImageId!]) {
    const corner = await pixel(page, await readUrl(page, imageId), [0.05, 0.9]);
    for (const value of corner) expect(value).toBeGreaterThan(240);
  }

  // A second mark, then Back and Leave: back on the list, the mark not saved.
  await card.getByRole('button', { name: 'Edit photo 1' }).click();
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 1 mark', {
    timeout: 20_000,
  });
  await drag(page, [0.6, 0.6], [0.85, 0.85]);
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 2 marks');
  await nextFrames(page);
  await page.goBack();
  await leave.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/inspections\?q=/);
  expect((await stored(page.request, id)).results[itemId]!.photos![0]!.annotations).toHaveLength(1);
});

test('if the editor can’t load, a message says so and the page keeps its unsaved work', async ({
  page,
  context,
  browser,
  published,
  tracked,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const { inspection } = await createInspection(page.request, published, tracked);
  // Offline, or a new version deployed meanwhile: the editor's code never comes.
  await page.route(EDITOR_CODE, (route) => route.abort());

  await page.goto(`/inspections/${inspection.id}`);
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  await page.getByRole('button', { name: 'Add extra deviation' }).click();
  const description = page.getByRole('textbox', { name: 'Description, D-01' });
  await description.fill('Paint damage on the right-hand door');
  const add = page.locator('article[data-deviation="D-01"]').getByRole('button', {
    name: /^Add photo/,
  });
  const chooser = page.waitForEvent('filechooser');
  await add.click();
  await (
    await chooser
  ).setFiles({
    name: 'door.jpg',
    mimeType: 'image/jpeg',
    buffer: await testPhoto(browser, { width: 1200, height: 900, label: 'Door' }),
  });

  const failed = page.getByRole('dialog', { name: 'Couldn’t open the editor' });
  await expect(failed).toBeVisible();
  await expect(failed.getByRole('button', { name: 'Reload page' })).toBeVisible();
  await failed.getByRole('button', { name: 'Close' }).click();
  await expect(failed).toBeHidden();
  // Back on the button that opened it; the page and what was typed are as they were.
  await expect(add).toBeFocused();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(description).toHaveValue('Paint damage on the right-hand door');
});

test('the photo editor keeps the keyboard, gives a label the colour picked, and a hanging save can be stopped', async ({
  page,
  context,
  published,
  tracked,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const created = await createInspection(page.request, published, tracked);
  const { id } = created.inspection;
  const itemId = published.sections[0]!.items[1]!.id;
  const [imageId] = await uploadPhotos(page, ['Cabinet']);
  await save(page.request, created, {
    [itemId]: { status: 'NOK', photos: [{ imageId: imageId!, annotations: [] }] },
  });

  await page.goto(`/inspections/${id}`);
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  const thumbnail = page
    .locator('article[data-deviation="D-01"]')
    .getByRole('button', { name: 'Edit photo 1' });

  // The first opening on the page (its code still loading) gives the focus back on closing too.
  await thumbnail.click();
  await expect(canvas(page)).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeHidden();
  await expect(thumbnail).toBeFocused();

  // The bin turns itself off but keeps the focus in the editor: Ctrl+Z brings the mark back.
  await thumbnail.click();
  await expect(canvas(page)).toBeVisible({ timeout: 20_000 });
  await drag(page, [0.3, 0.3], [0.55, 0.55]);
  await pick(page, 'Tool', 'Select and move');
  await page.mouse.click(...(await onPhoto(page, [0.425, 0.425])));
  const bin = editor(page).getByRole('button', { name: 'Delete mark' });
  await expect(bin).not.toHaveAttribute('aria-disabled');
  await bin.click();
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 0 marks');
  await expect(bin).toBeFocused();
  await expect(bin).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Control+Z');
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 1 mark');

  // A colour picked while a label is typed is the label's.
  await pick(page, 'Tool', 'Text');
  await page.mouse.click(...(await onPhoto(page, [0.6, 0.2])));
  await page.keyboard.type('Loose');
  await pick(page, 'Colour', 'Yellow');
  await expect(editor(page).getByRole('textbox', { name: 'Label text' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 2 marks');

  // The upload hangs (poor Wi-Fi): Cancel stops the save, the marks stay, and Save tries again.
  const held: Route[] = [];
  const hold = (route: Route) =>
    route.request().method() === 'PUT' ? void held.push(route) : route.continue();
  await page.route(STORAGE_IMAGES, hold);
  await editor(page).getByRole('button', { name: 'Save' }).click();
  await expect(editor(page).getByRole('button', { name: 'Saving…' })).toBeVisible();
  await expect.poll(() => held.length).toBe(1);
  await editor(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(editor(page).getByRole('alert')).toHaveText(/^Saving was stopped/);
  await expect(canvas(page)).toHaveAttribute('aria-label', 'Photo with 2 marks');
  await page.unroute(STORAGE_IMAGES, hold);
  await Promise.all(held.map((route) => route.abort().catch(() => undefined)));
  await editor(page).getByRole('button', { name: 'Save' }).click();
  await expect(editor(page)).toBeHidden({ timeout: 30_000 });

  await expect
    .poll(
      async () =>
        (await stored(page.request, id)).results[itemId]?.photos?.[0]?.renderedImageId ?? null,
      { timeout: 15_000 },
    )
    .not.toBeNull();
  const [arrow, label] = (await stored(page.request, id)).results[itemId]!.photos![0]!.annotations;
  expect(arrow).toMatchObject({ kind: 'arrow', color: ANNOTATION_COLORS.red });
  expect(label).toMatchObject({ kind: 'text', text: 'Loose', color: ANNOTATION_COLORS.yellow });
});
