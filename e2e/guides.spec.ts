import {
  ANNOTATION_COLORS,
  InspectionSchema,
  newId,
  TemplateDetailSchema,
  type Guide,
  type Section,
  type Template,
} from '@modig/shared';
import {
  expect,
  test as base,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';
import { signIn } from './support/auth';
import { testPhoto, uploadPhoto } from './support/photos';
import { createTemplate, deleteInspection, deleteTemplate } from './support/storage';

/**
 * Guides (brief §5.4): an admin writes a row's guide in the template editor (description,
 * reference images pasted and dropped, one marked up in the annotation editor, verdicts and
 * captions), and inspectors read it from the checklist, frozen as it was when the inspection was
 * created. Throwaway templates and inspections, deleted afterwards with their images.
 */

const ADMIN = 'anna.andersson@modig.se';

const test = base.extend<{
  /** Templates made by the test, deleted afterwards with their guide images. */
  templates: (template: Template) => Template;
  /** Inspections made by the test, deleted afterwards. */
  inspections: (id: string) => void;
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  templates: async ({}, use) => {
    const ids: string[] = [];
    await use((template) => {
      ids.push(template.id);
      return template;
    });
    await Promise.all(ids.map(deleteTemplate));
  },
  // eslint-disable-next-line no-empty-pattern -- as above
  inspections: async ({}, use) => {
    const ids: string[] = [];
    await use((id) => ids.push(id));
    await Promise.all(ids.map(deleteInspection));
  },
});

const guideEditor = (page: Page) => page.locator('dialog[data-guide-editor]');
const guideViewer = (page: Page) => page.locator('dialog[data-guide-viewer]');
const annotationEditor = (page: Page) => page.locator('dialog[data-annotation-editor]');
const largeView = (page: Page) => page.locator('dialog[data-photo-viewer]');
/** "Saved", "Unsaved changes", "Saving…", … in the template editor's header. */
const saveStatus = (page: Page) => page.locator('main header [role="status"]');

/** Two sections of three rows; row 1.b gets `guide` when given. */
function checklist(guide?: Guide): Section[] {
  const rows = [
    ['Lifting columns - Marked screws, blue/red/yellow', 'Pallet changer - Smooth movement'],
    ['Tool magazine - All pockets clean', 'Tool changer - Gripper aligned'],
  ];
  return rows.map((texts, section) => ({
    id: newId(),
    title: section === 0 ? 'Loading area' : 'Tool arena',
    items: [...texts, 'Safety fence - Undamaged and closed'].map((text, row) => ({
      id: newId(),
      text,
      ...(section === 0 && row === 1 && guide && { guide }),
    })),
  }));
}

/** A JPEG test photo as the file a drop or paste in the page starts from. */
async function photoFile(browser: Browser, label: string) {
  const jpeg = await testPhoto(browser, { width: 1200, height: 900, label });
  return { name: `${label.toLowerCase()}.jpg`, base64: jpeg.toString('base64') };
}

/** Puts an image on the clipboard (as PNG, the only image type it takes) and presses Ctrl+V. */
async function pasteImage(page: Page, file: { base64: string }, into: Locator): Promise<void> {
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  }, file.base64);
  await into.focus();
  await page.keyboard.press('Control+V');
}

/** Puts text with a picture of it on the clipboard, as Excel and Word copy, and presses Ctrl+V. */
async function pasteTextWithPicture(page: Page, text: string, into: Locator): Promise<void> {
  await page.evaluate(async (text) => {
    const canvas = new OffscreenCanvas(200, 60);
    canvas.getContext('2d')!.fillRect(0, 0, 200, 60);
    const png = await canvas.convertToBlob({ type: 'image/png' });
    const plain = new Blob([text], { type: 'text/plain' });
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': plain, 'image/png': png })]);
  }, text);
  await into.focus();
  await page.keyboard.press('Control+V');
}

/**
 * Two animation frames. The page's leave guard arms in an effect after a change, so a script
 * that goes Back in the same moment can slip past it (a person can't); this lets it arm.
 */
async function nextFrames(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

/** Drags an image file over an element and drops it there, as from the file manager. */
async function dropImage(
  page: Page,
  file: { name: string; base64: string },
  on: Locator,
): Promise<void> {
  const transfer = await page.evaluateHandle(({ name, base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], name, { type: 'image/jpeg' }));
    return data;
  }, file);
  for (const type of ['dragenter', 'dragover', 'drop']) {
    await on.dispatchEvent(type, { dataTransfer: transfer });
  }
}

/** Drags across the photo in the annotation editor, between fractions of its size. */
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = (await annotationEditor(page).locator('[data-annotation-canvas]').boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps: 10 });
  await page.mouse.up();
}

/** Picks Good, Bad or Info for an image (the radios themselves are visually hidden). */
async function pickVerdict(page: Page, image: number, verdict: string): Promise<void> {
  const group = guideEditor(page).getByRole('group', { name: `Verdict, image ${image}` });
  await group.getByText(verdict, { exact: true }).click();
  await expect(group.getByRole('radio', { name: verdict })).toBeChecked();
}

async function savedDraft(request: APIRequestContext, id: string): Promise<Template> {
  const response = await request.get(`/api/templates/${id}`);
  expect(response.status()).toBe(200);
  return TemplateDetailSchema.parse(await response.json()).draft;
}

test('an admin writes a guide with pasted and dropped images, marks one up and sets verdicts; it is autosaved', async ({
  page,
  context,
  browser,
  templates,
}) => {
  await signIn(context, ADMIN, ['admin']);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const template = templates(
    await createTemplate('E2E guides – editor', false, { sections: checklist() }),
  );
  const row = template.sections[0]!.items[1]!;
  const [pasted, dropped] = await Promise.all([
    photoFile(browser, 'Screws'),
    photoFile(browser, 'Column'),
  ]);

  await page.goto(`/templates/${template.id}`);
  await expect(page.getByRole('heading', { level: 1, name: template.name })).toBeVisible();
  await page.locator(`#row-${row.id}`).hover();
  await page.getByRole('button', { name: 'Add guide, row 1.b' }).click();
  const dialog = guideEditor(page);
  await expect(dialog.getByRole('heading', { name: `Guide · 1.b ${row.text}` })).toBeVisible();
  const description = dialog.getByLabel('Description');
  await expect(description).toBeFocused();
  await description.fill('Every screw has an unbroken paint mark from head to plate.');

  // Text copied from Excel or Word comes with a picture of itself: it is pasted as text.
  await pasteTextWithPicture(page, ' Checked after transport.', description);
  await expect(description).toHaveValue(
    'Every screw has an unbroken paint mark from head to plate. Checked after transport.',
  );
  await expect(annotationEditor(page)).toHaveCount(0);
  await description.fill('Every screw has an unbroken paint mark from head to plate.');

  // Pasted while typing the description: the image opens in the annotation editor at once. An
  // arrow and a box, in red.
  await pasteImage(page, pasted, description);
  await expect(annotationEditor(page).getByRole('heading', { name: 'New image' })).toBeVisible();
  const canvas = annotationEditor(page).locator('[data-annotation-canvas]');
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await drag(page, [0.2, 0.8], [0.45, 0.5]);
  await annotationEditor(page)
    .getByRole('group', { name: 'Tool' })
    .getByRole('button', { name: 'Rectangle' })
    .click();
  await drag(page, [0.5, 0.25], [0.8, 0.55]);
  await expect(canvas).toHaveAttribute('aria-label', 'Photo with 2 marks');
  await annotationEditor(page).getByRole('button', { name: 'Save' }).click();
  await expect(annotationEditor(page)).toBeHidden({ timeout: 30_000 });

  // Dropped anywhere on the dialog, here its heading: saved without marks.
  await dropImage(page, dropped, dialog.getByRole('heading', { name: /^Guide · 1\.b/ }));
  await expect(annotationEditor(page).getByRole('heading', { name: 'New image' })).toBeVisible();
  await expect(annotationEditor(page).locator('[data-annotation-canvas]')).toBeVisible({
    timeout: 20_000,
  });
  await annotationEditor(page).getByRole('button', { name: 'Save' }).click();
  await expect(annotationEditor(page)).toBeHidden({ timeout: 30_000 });

  // A new image says nothing until it is called Good or Bad.
  await expect(dialog.locator('li[data-photo]')).toHaveCount(2);
  await expect(dialog.getByText('2 / 6')).toBeVisible();
  for (const image of [1, 2]) {
    await expect(
      dialog.getByRole('group', { name: `Verdict, image ${image}` }).getByRole('radio', {
        name: 'Info',
      }),
    ).toBeChecked();
  }
  await pickVerdict(page, 1, 'Good');
  await pickVerdict(page, 2, 'Bad');
  await dialog.getByRole('textbox', { name: 'Caption, image 1' }).fill('All four screws marked');
  await dialog.getByRole('textbox', { name: 'Caption, image 2' }).fill('  Top screw unmarked  ');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();

  // Into the draft, autosaved: verdicts, trimmed captions, the marks as fractions and the
  // flattened copy of the marked image only.
  await expect(page.getByRole('button', { name: 'Guide for row 1.b (2 images)' })).toBeVisible();
  await expect(saveStatus(page)).toHaveText('Unsaved changes');
  await expect(saveStatus(page)).toHaveText('Saved');
  const guide = (await savedDraft(page.request, template.id)).sections[0]!.items[1]!.guide;
  expect(guide).toEqual({
    description: 'Every screw has an unbroken paint mark from head to plate.',
    images: [
      {
        imageId: expect.any(String),
        caption: 'All four screws marked',
        annotations: [
          expect.objectContaining({ kind: 'arrow', color: ANNOTATION_COLORS.red }),
          expect.objectContaining({ kind: 'rect', color: ANNOTATION_COLORS.red }),
        ],
        renderedImageId: expect.any(String),
        verdict: 'good',
      },
      {
        imageId: expect.any(String),
        caption: 'Top screw unmarked',
        annotations: [],
        verdict: 'bad',
      },
    ],
  });
  const [marked] = guide!.images;
  expect(marked!.renderedImageId).not.toBe(marked!.imageId);

  // After a reload the guide opens again as saved, the marked image as its flattened copy.
  await page.reload();
  await page.getByRole('button', { name: 'Guide for row 1.b (2 images)' }).click();
  await expect(description).toHaveValue(guide!.description!);
  await expect(
    dialog.getByRole('button', { name: 'Edit image 1: All four screws marked' }).locator('img'),
  ).toHaveAttribute('src', new RegExp(`/images/${marked!.renderedImageId}\\.jpg\\?`));
  await expect(
    dialog.getByRole('group', { name: 'Verdict, image 2' }).getByRole('radio', { name: 'Bad' }),
  ).toBeChecked();
  await expect(dialog.getByRole('textbox', { name: 'Caption, image 2' })).toHaveValue(
    'Top screw unmarked',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

test('an inspection shows the guide as it was when it was created, from the row’s icon and G', async ({
  page,
  context,
  browser,
  templates,
  inspections,
}) => {
  // An admin is an inspector too: one sign-in edits the template and fills in the inspection.
  await signIn(context, ADMIN, ['admin']);
  const upload = async (label: string) =>
    uploadPhoto(page.request, await testPhoto(browser, { width: 1200, height: 900, label }));
  const [good, goodMarked, bad] = await Promise.all(['Good', 'Good marked', 'Bad'].map(upload));
  const guide: Guide = {
    description: 'Every screw has an unbroken paint mark from head to plate.',
    images: [
      {
        imageId: good!,
        caption: 'All four screws marked',
        annotations: [{ kind: 'rect', x: 0.5, y: 0.25, w: 0.3, h: 0.3, color: '#E02424' }],
        renderedImageId: goodMarked,
        verdict: 'good',
      },
      { imageId: bad!, caption: 'Top screw unmarked', annotations: [], verdict: 'bad' },
    ],
  };
  const template = templates(
    await createTemplate('E2E guides – viewer', true, { sections: checklist(guide) }),
  );
  const row = template.sections[0]!.items[1]!;
  const create = async (machineName: string) => {
    const response = await page.request.post('/api/inspections', {
      data: {
        templateId: template.id,
        front: {
          machineName,
          serialNumber: 'RM-2026-051',
          participants: ['Anna Andersson'],
          location: 'Kalmar, Sweden',
          date: '2026-10-08',
        },
      },
    });
    expect(response.status()).toBe(201);
    const { id } = InspectionSchema.parse(await response.json());
    inspections(id);
    return id;
  };
  const before = await create('RigiMill MG – Volvo Cars Skövde');

  // The row's icon opens the guide read-only: description, images with verdicts and captions.
  await page.goto(`/inspections/${before}`);
  const rowElement = page.locator(`#row-${row.id}`);
  await rowElement.getByRole('button', { name: 'Guide for row 1.b (2 images)' }).click();
  const viewer = guideViewer(page);
  await expect(viewer.getByRole('heading', { name: `Guide · 1.b ${row.text}` })).toBeVisible();
  await expect(viewer).toContainText(guide.description!);
  await expect(viewer.getByRole('textbox')).toHaveCount(0);
  const tiles = viewer.locator('li[data-guide-image]');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.locator('[data-verdict]')).toHaveText(['Good', 'Bad']);
  await expect(tiles.nth(0).locator('img')).toHaveAttribute(
    'src',
    new RegExp(`/images/${goodMarked}\\.jpg\\?`),
  );
  await expect(tiles.nth(1)).toContainText('Top screw unmarked');

  // Arrow keys move between the images; Enter shows one large, where ← / → step through them.
  const first = viewer.getByRole('button', { name: 'View image 1, Good: All four screws marked' });
  const second = viewer.getByRole('button', { name: 'View image 2, Bad: Top screw unmarked' });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(largeView(page).getByRole('heading', { name: 'Image 1 of 2' })).toBeVisible();
  await expect(largeView(page).locator('[data-verdict]')).toHaveText('Good');
  await page.keyboard.press('ArrowRight');
  await expect(largeView(page).getByRole('heading', { name: 'Image 2 of 2' })).toBeVisible();
  await expect(largeView(page).locator('[data-verdict]')).toHaveText('Bad');
  await expect(largeView(page).getByRole('button', { name: 'Next' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  // Escape closes the large view (back on the image last shown), then the guide (back on the row).
  await page.keyboard.press('Escape');
  await expect(largeView(page)).toBeHidden();
  await expect(second).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(rowElement).toBeFocused();

  // G on the focused row opens it too; its keys never reach the row behind.
  await page.keyboard.press('g');
  await expect(viewer).toBeVisible();
  await page.keyboard.press('1');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(rowElement.locator('[aria-pressed="true"]')).toHaveCount(0);

  // An admin rewords the guide, keeps only the first image as Info and publishes revision 2.
  const detail = await page.request.get(`/api/templates/${template.id}`);
  const { draft } = TemplateDetailSchema.parse(await detail.json());
  const changed: Guide = {
    description: 'Changed after the inspection was created.',
    images: [{ ...guide.images[0]!, verdict: 'info' }],
  };
  const sections = draft.sections.map((section, index) =>
    index === 0
      ? {
          ...section,
          items: section.items.map((item) =>
            item.id === row.id ? { ...item, guide: changed } : item,
          ),
        }
      : section,
  );
  const saved = await page.request.put(`/api/templates/${template.id}`, {
    headers: { 'If-Match': detail.headers()['etag']! },
    data: {
      name: draft.name,
      modelCode: draft.modelCode,
      printSettings: draft.printSettings,
      sections,
    },
  });
  expect(saved.status()).toBe(200);
  const published = await page.request.post(`/api/templates/${template.id}/publish`, {
    headers: { 'If-Match': saved.headers()['etag']! },
    data: { changeNote: 'Guide of 1.b reworded' },
  });
  expect(published.status()).toBe(200);

  // The inspection keeps the guide it was created with; a new one gets the new guide.
  await page.reload();
  await rowElement.getByRole('button', { name: 'Guide for row 1.b (2 images)' }).click();
  await expect(viewer).toContainText(guide.description!);
  await expect(viewer.locator('li[data-guide-image] [data-verdict]')).toHaveText(['Good', 'Bad']);
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  const after = await create('RigiMill MG – Scania Södertälje');
  await page.goto(`/inspections/${after}`);
  await page
    .locator(`#row-${row.id}`)
    .getByRole('button', { name: 'Guide for row 1.b (1 image)' })
    .click();
  await expect(viewer).toContainText('Changed after the inspection was created.');
  await expect(viewer.locator('li[data-guide-image] [data-verdict]')).toHaveText(['Info']);
});

test('leaving the template editor while the guide editor has changes asks first', async ({
  page,
  context,
  templates,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const template = templates(
    await createTemplate('E2E guides – leave', false, { sections: checklist() }),
  );
  const row = template.sections[0]!.items[1]!;

  // Opened from the list, so Back stays in the app.
  await page.goto('/templates');
  await page.getByRole('link', { name: template.name, exact: true }).click();
  await page.locator(`#row-${row.id}`).hover();
  await page.getByRole('button', { name: 'Add guide, row 1.b' }).click();
  const description = guideEditor(page).getByLabel('Description');
  await description.fill('Rails clean, no chips.');

  // The guide is in no draft yet: Back asks, and Cancel keeps it.
  await nextFrames(page);
  await page.goBack();
  const leave = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(leave).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/templates/${template.id}$`));
  await leave.getByRole('button', { name: 'Cancel' }).click();
  await expect(leave).toBeHidden();
  await expect(description).toHaveValue('Rails clean, no chips.');

  // Leave: back on the list, without the guide.
  await nextFrames(page);
  await page.goBack();
  await leave.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/templates$/);
  expect(
    (await savedDraft(page.request, template.id)).sections[0]!.items[1]!.guide,
  ).toBeUndefined();
});
