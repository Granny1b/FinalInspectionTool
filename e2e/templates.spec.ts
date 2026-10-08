import {
  CONFLICT_MESSAGE,
  TemplateDetailSchema,
  TemplateListSchema,
  type Template,
} from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { createTemplate, deleteTemplate } from './support/storage';

const ADMIN = 'anna.andersson@modig.se';

/**
 * Each test gets its own throwaway templates (written straight into the local Azurite and deleted
 * afterwards), so the tests can run in parallel and never depend on the seeded RigiMill MG, which
 * a developer may have edited locally. `template` is a draft never published; `published` has
 * revision 1 with the same content.
 */
const test = base.extend<{ template: Template; published: Template }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  template: async ({}, use, testInfo) => {
    const template = await createTemplate(`E2E – ${testInfo.title}`);
    await use(template);
    await deleteTemplate(template.id);
  },
  // eslint-disable-next-line no-empty-pattern -- as above
  published: async ({}, use, testInfo) => {
    const template = await createTemplate(`E2E published – ${testInfo.title}`, true);
    await use(template);
    await deleteTemplate(template.id);
  },
});

/** The draft as the API has saved it, read with the page's sign-in through the SWA CLI. */
async function savedDraft(request: APIRequestContext, id: string): Promise<Template> {
  const response = await request.get(`/api/templates/${id}`);
  expect(response.status()).toBe(200);
  return TemplateDetailSchema.parse(await response.json()).draft;
}

const rowIds = (template: Template) =>
  template.sections.map((section) => section.items.map((item) => item.id));
const rowTexts = (template: Template) =>
  template.sections.map((section) => section.items.map((item) => item.text));
const sectionIds = (template: Template) => template.sections.map((section) => section.id);
const rowText = (page: Page, itemId: string) => page.locator(`[data-item-text="${itemId}"]`);
/** "Saved", "Unsaved changes", "Saving…", "Not saved — Reload" or "Couldn’t save — Retry". */
const saveStatus = (page: Page) => page.locator('main header [role="status"]');
/** The "← Templates" link above the editor. */
const backLink = (page: Page) => page.getByRole('main').getByRole('link', { name: 'Templates' });

async function openEditor(page: Page, template: Template): Promise<void> {
  await page.goto(`/templates/${template.id}`);
  await expect(page.getByRole('heading', { level: 1, name: template.name })).toBeVisible();
}

/** Types at the end of a row's text. */
async function appendToRow(page: Page, itemId: string, text: string): Promise<void> {
  await rowText(page, itemId).click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
}

/** A held key: keydowns at the auto-repeat rate, all but the first with `repeat` set. */
async function holdBackspace(page: Page, keydowns: number): Promise<void> {
  for (let i = 0; i < keydowns; i++) {
    await page.keyboard.down('Backspace');
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('Backspace');
}

/** A 2000 × 1500 PNG drawn in the page. */
async function photo(page: Page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2000;
    canvas.height = 1500;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#0b7db3';
    context.fillRect(0, 0, 2000, 1500);
    context.fillStyle = '#ffffff';
    context.fillRect(500, 500, 1000, 500);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  return { name: 'machine.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') };
}

test.describe('an admin', () => {
  test.beforeEach(({ context }) => signIn(context, ADMIN, ['admin']));

  test('sees the templates in the list and opens one in the editor', async ({
    page,
    published,
  }) => {
    await page.goto('/templates');
    const row = page.getByRole('row', { name: published.name });
    // E2E is not in the settings, so the model column shows the code itself.
    await expect(row.getByRole('cell')).toHaveText([published.name, 'E2E', 'Rev 1', '6', /./]);
    await expect(page.getByRole('button', { name: 'New template' })).toBeVisible();

    await row.getByRole('link', { name: published.name }).click();
    await expect(page.getByRole('heading', { level: 1, name: published.name })).toBeVisible();
    await expect(page.locator('[data-item-text]')).toHaveCount(6);
    await expect(page.getByText('Published Rev 1')).toBeVisible();
  });

  test('an edited row is autosaved and still there after a reload', async ({ page, template }) => {
    const row = template.sections[0]!.items[0]!;
    const edited = `${row.text} (checked twice)`;
    await openEditor(page, template);
    await expect(saveStatus(page)).toHaveText('Saved');

    await appendToRow(page, row.id, ' (checked twice)');
    await expect(saveStatus(page)).toHaveText('Unsaved changes');
    await expect(saveStatus(page)).toHaveText('Saved');
    expect((await savedDraft(page.request, template.id)).sections[0]!.items[0]!.text).toBe(edited);

    await page.reload();
    await expect(rowText(page, row.id)).toHaveValue(edited);
  });

  test('Enter adds a row below, Backspace on an empty row removes it', async ({
    page,
    template,
  }) => {
    const [a, b, c] = template.sections[0]!.items;
    await openEditor(page, template);

    await rowText(page, a!.id).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const added = page.getByRole('textbox', { name: 'Row 1.b text' });
    await expect(added).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Row 1.c text' })).toHaveValue(b!.text);
    await page.keyboard.type('Hydraulic hoses - No leaks');
    // The new row is saved between 1.a and the old 1.b, which keeps its id.
    await expect
      .poll(async () => (await savedDraft(page.request, template.id)).sections[0]!.items)
      .toEqual([a, { id: expect.any(String), text: 'Hydraulic hoses - No leaks' }, b, c]);

    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    // Empty now: the next Backspace removes the row and goes back to the end of 1.a.
    await page.keyboard.press('Backspace');
    await expect(page.getByRole('textbox', { name: 'Row 1.b text' })).toHaveValue(b!.text);
    await expect(rowText(page, a!.id)).toBeFocused();
    await expect
      .poll(async () => rowIds(await savedDraft(page.request, template.id)))
      .toEqual(rowIds(template));
    await expect(saveStatus(page)).toHaveText('Saved');
  });

  test('holding Backspace empties a row, but never deletes it or the rows above', async ({
    page,
    template,
  }) => {
    const [a, b, c] = template.sections[0]!.items;
    await openEditor(page, template);

    // Held past the point where 1.c is empty: it stays, empty and focused.
    await appendToRow(page, c!.id, '');
    await holdBackspace(page, c!.text.length + 6);
    await expect(rowText(page, c!.id)).toHaveValue('');
    await expect(rowText(page, c!.id)).toBeFocused();

    // A fresh press on the empty row deletes it; the repeats of that press leave 1.b alone.
    await holdBackspace(page, 8);
    await expect(rowText(page, c!.id)).toHaveCount(0);
    await expect(rowText(page, b!.id)).toBeFocused();
    await expect(rowText(page, b!.id)).toHaveValue(b!.text);
    await expect
      .poll(async () => rowTexts(await savedDraft(page.request, template.id))[0])
      .toEqual([a!.text, b!.text]);
  });

  test('a deleted row can be put back with Undo, keeping its id', async ({ page, template }) => {
    const [, b] = template.sections[0]!.items;
    await openEditor(page, template);

    await page.locator(`#row-${b!.id}`).hover();
    await page.getByRole('button', { name: 'Delete row 1.b' }).click();
    await expect(rowText(page, b!.id)).toHaveCount(0);
    const undo = page.getByRole('status').filter({ hasText: 'Row 1.b deleted.' });
    await expect(undo).toBeVisible();
    await expect
      .poll(async () => (await savedDraft(page.request, template.id)).sections[0]!.items.length)
      .toBe(2);

    await undo.getByRole('button', { name: 'Undo' }).click();
    await expect(rowText(page, b!.id)).toBeFocused();
    await expect(rowText(page, b!.id)).toHaveValue(b!.text);
    await expect(undo).toBeHidden();
    await expect
      .poll(async () => rowIds(await savedDraft(page.request, template.id)))
      .toEqual(rowIds(template));
  });

  test('a long unbroken word wraps inside its row instead of widening the page', async ({
    page,
    template,
  }) => {
    await page.setViewportSize({ width: 834, height: 1112 });
    await openEditor(page, template);
    const row = rowText(page, template.sections[0]!.items[0]!.id);
    await row.fill(`Spindle - Part ${'X'.repeat(150)}`);
    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scrollWidth).toBe(clientWidth);
    // It grew to several lines instead.
    expect(await row.evaluate((field) => field.scrollHeight)).toBeGreaterThan(60);
  });

  test('a row dragged into another section moves there with its id', async ({ page, template }) => {
    const [one, two] = template.sections;
    const [a1, b1, moved] = one!.items;
    const [a2, b2, c2] = two!.items;
    // Both sections in view, and the pointer far from the edges, where dnd-kit scrolls the page.
    await page.setViewportSize({ width: 1280, height: 1200 });
    await openEditor(page, template);
    await page.locator(`#section-${one!.id}`).evaluate((section) => section.scrollIntoView());

    // Grab 1.c by its handle (shown on hover) and let go below 2.c, over section 2's "Add row":
    // the row ends up last there. That spot stays put while the rows move: section 1 gives up a
    // row and section 2 takes one above it.
    await page.locator(`#row-${moved!.id}`).hover();
    const handle = await page.getByRole('button', { name: 'Move row 1.c' }).boundingBox();
    const end = await page.getByRole('button', { name: 'Add row to section 2' }).boundingBox();
    const x = handle!.x + handle!.width / 2;
    const y = handle!.y + handle!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 10, { steps: 2 });
    await page.mouse.move(x, end!.y + end!.height / 2, { steps: 20 });
    // The faded placeholder shows where the row will land.
    const placeholder = page.locator(`#section-${two!.id} #row-${moved!.id}`);
    const last = page.locator(`#row-${c2!.id}`);
    await expect
      .poll(async () => {
        const [shown, lastRow] = [await placeholder.boundingBox(), await last.boundingBox()];
        return shown !== null && lastRow !== null && shown.y > lastRow.y;
      })
      .toBe(true);
    await page.mouse.up();

    await expect(
      page.locator(`#section-${two!.id} [data-item-text="${moved!.id}"]`),
    ).toHaveAttribute('aria-label', 'Row 2.d text');
    await expect
      .poll(async () => rowIds(await savedDraft(page.request, template.id)))
      .toEqual([
        [a1!.id, b1!.id],
        [a2!.id, b2!.id, c2!.id, moved!.id],
      ]);
  });

  test('section menu: move, delete asks first when it has rows, an empty one goes at once', async ({
    page,
    template,
  }) => {
    const [one, two] = template.sections;
    await openEditor(page, template);

    await page.getByRole('button', { name: 'Section 1 actions' }).click();
    await page.getByRole('menuitem', { name: 'Move down' }).click();
    await expect(page.getByRole('textbox', { name: 'Section 1 title' })).toHaveValue(two!.title);
    await expect(page.locator(`[data-section-menu="${one!.id}"]`)).toBeFocused();
    await expect
      .poll(async () => sectionIds(await savedDraft(page.request, template.id)))
      .toEqual([two!.id, one!.id]);

    // A section with rows asks first; Cancel keeps it.
    await page.getByRole('button', { name: 'Section 1 actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete section 1?' });
    await expect(confirm).toContainText(`“${two!.title}” and its 3 rows`);
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();
    await expect(page.locator(`#section-${two!.id}`)).toBeVisible();
    await expect(page.locator(`[data-section-menu="${two!.id}"]`)).toBeFocused();

    await page.getByRole('button', { name: 'Section 1 actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await confirm.getByRole('button', { name: 'Delete section' }).click();
    await expect(page.locator(`#section-${two!.id}`)).toHaveCount(0);
    await expect
      .poll(async () => sectionIds(await savedDraft(page.request, template.id)))
      .toEqual([one!.id]);

    // An empty section goes without asking.
    await page.getByRole('button', { name: 'Add section' }).click();
    await page.getByRole('button', { name: 'Section 2 actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Section 2 title' })).toHaveCount(0);
    await expect(saveStatus(page)).toHaveText('Saved');
    expect(sectionIds(await savedDraft(page.request, template.id))).toEqual([one!.id]);
  });

  test('following a link saves first; closing the tab with unsaved changes warns', async ({
    page,
    template,
  }) => {
    const row = template.sections[0]!.items[0]!;
    await openEditor(page, template);
    await appendToRow(page, row.id, ' [left at once]');
    await expect(saveStatus(page)).toHaveText('Unsaved changes');
    // Before the 1 s debounce has run out.
    await backLink(page).click();
    await page.waitForURL(/\/templates$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await savedDraft(page.request, template.id)).sections[0]!.items[0]!.text).toBe(
      `${row.text} [left at once]`,
    );

    await openEditor(page, template);
    await appendToRow(page, row.id, '!');
    await expect(saveStatus(page)).toHaveText('Unsaved changes');
    const warning = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const shown = await warning;
    expect(shown.type()).toBe('beforeunload');
    await shown.dismiss();
  });

  test('publishing freezes the draft as a revision with a change note', async ({
    page,
    template,
  }) => {
    const row = template.sections[0]!.items[0]!;
    await openEditor(page, template);
    await expect(page.getByText('Not published', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Publish revision 1' });
    await dialog.getByLabel('Change note (optional)').fill('First release for the new line');
    await dialog.getByRole('button', { name: 'Publish revision 1' }).click();

    // Publish is disabled now (nothing new): the notice takes the keyboard focus.
    const notice = page.getByRole('status').filter({ hasText: 'Published revision 1.' });
    await expect(notice).toBeVisible();
    await expect(page.locator(':focus')).toContainText('Published revision 1.');
    const history = page.getByRole('region', { name: 'Revision history' });
    await expect(history.getByRole('listitem')).toHaveCount(1);
    await expect(history.getByRole('listitem')).toContainText([
      /Rev 1.*Latest.*anna\.andersson@modig\.se.*First release for the new line/,
    ]);
    await expect(page.getByText('Published Rev 1')).toBeVisible();
    await expect(page.getByText('Draft · Rev 2')).toBeVisible();
    await notice.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('heading', { level: 1, name: template.name })).toBeFocused();

    // Later edits go into the draft; the published revision stays as it was.
    await appendToRow(page, row.id, ' (changed)');
    await expect(page.getByText('Unpublished changes')).toBeVisible();
    await expect(saveStatus(page)).toHaveText('Saved');
    const revision = await page.request.get(`/api/templates/${template.id}/revisions/1`);
    expect((await revision.json()).sections[0].items[0].text).toBe(row.text);
  });

  test('two admins on one draft: the outdated save is refused with a reload', async ({
    page,
    browser,
    baseURL,
    template,
  }) => {
    const [a, b] = template.sections[0]!.items;
    const bob = await browser.newContext({ baseURL });
    try {
      await signIn(bob, 'bob.berg@modig.se', ['admin']);
      const bobPage = await bob.newPage();
      await openEditor(page, template);
      await openEditor(bobPage, template);

      await appendToRow(page, a!.id, ' [Anna]');
      await expect(saveStatus(page)).toHaveText('Saved');
      // Bob still edits the draft as he loaded it.
      await appendToRow(bobPage, b!.id, ' [Bob]');
      const banner = bobPage.getByRole('alert').filter({ hasText: CONFLICT_MESSAGE });
      await expect(banner).toBeVisible();
      await expect(banner.getByRole('button', { name: 'Reload' })).toBeVisible();
      // Reload is next to the status too, in case the banner is scrolled out of view.
      await expect(saveStatus(bobPage)).toHaveText(/^Not saved —\s*Reload$/);
      await expect(bobPage.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
      const saved = await savedDraft(page.request, template.id);
      expect(saved.sections[0]!.items.map((item) => item.text)).toEqual([
        `${a!.text} [Anna]`,
        b!.text,
        template.sections[0]!.items[2]!.text,
      ]);

      await saveStatus(bobPage).getByRole('button', { name: 'Reload' }).click();
      await bobPage
        .getByRole('dialog', { name: 'Discard your changes?' })
        .getByRole('button', { name: 'Discard and reload' })
        .click();
      await expect(rowText(bobPage, a!.id)).toHaveValue(`${a!.text} [Anna]`);
      await expect(rowText(bobPage, b!.id)).toHaveValue(b!.text);
      await expect(banner).toBeHidden();
      await expect(saveStatus(bobPage)).toHaveText('Saved');
    } finally {
      await bob.close();
    }
  });

  test('a save whose answer is lost is not mistaken for a conflict', async ({ page, template }) => {
    const row = template.sections[0]!.items[0]!;
    await openEditor(page, template);
    // The first save reaches the server and is stored, but its answer never arrives.
    let lost = false;
    await page.route(`**/api/templates/${template.id}`, async (route) => {
      if (route.request().method() !== 'PUT' || lost) return route.continue();
      lost = true;
      await route.fetch();
      await route.abort('connectionreset');
    });

    await appendToRow(page, row.id, ' EDIT-ONE');
    await expect(saveStatus(page)).toHaveText(/Couldn’t save/);
    await page.keyboard.type(' EDIT-TWO');
    // The retry (with the ETag from before) gets a 412, which turns out to be our own save.
    await expect(saveStatus(page)).toHaveText('Saved');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await savedDraft(page.request, template.id)).sections[0]!.items[0]!.text).toBe(
      `${row.text} EDIT-ONE EDIT-TWO`,
    );
  });

  test('a save after the session ended keeps the changes and saves once signed in again', async ({
    page,
    context,
    template,
  }) => {
    const row = template.sections[0]!.items[0]!;
    await openEditor(page, template);
    // Signed out in another tab, or the session ran out.
    await context.clearCookies();

    await appendToRow(page, row.id, ' [after sign-out]');
    const banner = page.getByRole('alert').filter({ hasText: 'You were signed out.' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('link', { name: /Sign in/ })).toHaveAttribute('target', '_blank');
    await expect(saveStatus(page)).toHaveText(/Couldn’t save/);
    await expect(page).toHaveURL(new RegExp(`/templates/${template.id}$`));

    await signIn(context, ADMIN, ['admin']);
    await saveStatus(page).getByRole('button', { name: 'Retry' }).click();
    await expect(saveStatus(page)).toHaveText('Saved');
    await expect(banner).toBeHidden();
    expect((await savedDraft(page.request, template.id)).sections[0]!.items[0]!.text).toBe(
      `${row.text} [after sign-out]`,
    );
  });

  test('a cover photo is resized, uploaded and shown', async ({ page, template }) => {
    await openEditor(page, template);
    // The browser scales the 2000 × 1500 photo to 1600 px on the long edge before uploading.
    await page.locator('input[type="file"]').setInputFiles(await photo(page));

    const cover = page.getByRole('img', { name: 'Cover photo' });
    await expect
      .poll(() => cover.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]))
      .toEqual([1600, 1200]);
    await expect(page.getByRole('button', { name: 'Replace' })).toBeVisible();
    await expect(saveStatus(page)).toHaveText('Saved');
    expect((await savedDraft(page.request, template.id)).coverImageId).toEqual(expect.any(String));
  });

  test('leaving while a cover photo uploads waits for it and saves it', async ({
    page,
    template,
  }) => {
    await openEditor(page, template);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/devstoreaccount1/images/**', async (route) => {
      if (route.request().method() === 'PUT') await held;
      await route.continue();
    });

    await page.locator('input[type="file"]').setInputFiles(await photo(page));
    await expect(page.getByText('Uploading…')).toBeVisible();
    await backLink(page).click();
    // Still in the editor while the photo is on its way.
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(new RegExp(`/templates/${template.id}$`));

    release();
    await page.waitForURL(/\/templates$/);
    expect((await savedDraft(page.request, template.id)).coverImageId).toEqual(expect.any(String));
  });

  test('a new template starts empty; an empty row blocks publishing and links to it', async ({
    page,
  }) => {
    await page.goto('/templates');
    await page.getByRole('button', { name: 'New template' }).click();
    const dialog = page.getByRole('dialog', { name: 'New template' });
    // One template per model: models that have one are not offered.
    const list = await page.request.get('/api/templates');
    for (const { modelCode } of TemplateListSchema.parse(await list.json())) {
      await expect(dialog.getByRole('option', { name: `(${modelCode})` })).toHaveCount(0);
    }
    // Delete what the test creates, even if a step after the click fails.
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/templates',
    );
    await dialog.getByRole('button', { name: 'Create template' }).click();
    let id: string | undefined;
    try {
      id = ((await (await created).json()) as { draft: { id: string } }).draft.id;
      await page.waitForURL(`**/templates/${id}`);
      await expect(page.getByRole('heading', { name: 'No sections yet' })).toBeVisible();
      await expect(page.getByText('Draft · Rev 1')).toBeVisible();

      await page.getByRole('button', { name: 'Add section' }).click();
      await page.keyboard.type('Doors and guards');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('textbox', { name: 'Row 1.a text' })).toBeFocused();
      await page.keyboard.type('Front door - Interlock stops the spindle');
      await page.keyboard.press('Enter');

      await page.getByRole('button', { name: 'Publish', exact: true }).click();
      const problems = page.getByRole('dialog', { name: 'Fix one problem before publishing' });
      await problems.getByRole('button', { name: /Row 1\.b is empty\./ }).click();
      await expect(problems).toBeHidden();
      const empty = page.getByRole('textbox', { name: 'Row 1.b text' });
      await expect(empty).toBeFocused();
      await expect(empty).toHaveAttribute('aria-invalid', 'true');

      await page.keyboard.type('Rear door - Interlock stops the spindle');
      await expect(empty).not.toHaveAttribute('aria-invalid');
      await expect(saveStatus(page)).toHaveText('Saved');
    } finally {
      if (id) await deleteTemplate(id);
    }
  });
});

test.describe('an inspector', () => {
  test.beforeEach(({ context }) => signIn(context, 'sam.andersson@modig.se', ['inspector']));

  test('sees the published checklist read-only and cannot change drafts', async ({
    page,
    published,
  }) => {
    await page.goto('/templates');
    await expect(page.getByRole('row', { name: published.name })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New template' })).toHaveCount(0);

    await page.getByRole('link', { name: published.name }).click();
    await expect(page.getByRole('heading', { level: 1, name: published.name })).toBeVisible();
    await expect(page.getByText('Rev 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Loading area' })).toBeVisible();
    await expect(page.locator('main').locator('input, textarea, select')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Publish|Add row|Add section|Move/ }),
    ).toHaveCount(0);

    // Through the SWA CLI with the inspector's own sign-in: the API refuses every draft call.
    const id = published.id;
    const ifMatch = { 'If-Match': '"0x0"' };
    const refused = [
      await page.request.get(`/api/templates/${id}`),
      await page.request.put(`/api/templates/${id}`, { headers: ifMatch, data: { name: 'x' } }),
      await page.request.post(`/api/templates/${id}/publish`, { headers: ifMatch, data: {} }),
    ];
    for (const response of refused) {
      expect(response.status()).toBe(403);
      expect((await response.json()).error).toBe('forbidden');
    }
  });
});
