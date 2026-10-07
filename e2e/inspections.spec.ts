import {
  CONFLICT_MESSAGE,
  InspectionSchema,
  newId,
  TemplateDetailSchema,
  type Inspection,
  type InspectionDraftInput,
  type RowResult,
  type Template,
} from '@modig/shared';
import {
  expect,
  test as base,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { signIn } from './support/auth';
import { createTemplate, deleteInspection, deleteTemplate, deviationRows } from './support/storage';

const INSPECTOR = 'sam.andersson@modig.se';
const ADMIN = 'anna.andersson@modig.se';
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

type Loaded = { inspection: Inspection; etag: string };

type Inspections = {
  /** Creates an inspection through the API with the request's sign-in; deleted after the test. */
  create: (request: APIRequestContext, template: Template, machineName: string) => Promise<Loaded>;
  /** Deletes an inspection the test created through the UI, after the test. */
  track: (id: string) => void;
};

/**
 * Each test gets its own throwaway template, published as revision 1 (two sections of three
 * rows, model E2E, written straight into the local Azurite), and its inspections are deleted
 * afterwards with their deviation rows. Tests run in parallel and never depend on the seeded
 * RigiMill MG.
 */
const test = base.extend<{ published: Template; inspections: Inspections }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  published: async ({}, use, testInfo) => {
    const template = await createTemplate(`E2E inspections – ${testInfo.title}`, true);
    await use(template);
    await deleteTemplate(template.id);
  },
  // eslint-disable-next-line no-empty-pattern -- as above
  inspections: async ({}, use) => {
    const ids: string[] = [];
    await use({
      create: async (request, template, machineName) => {
        const response = await request.post('/api/inspections', {
          data: {
            templateId: template.id,
            front: {
              machineName,
              serialNumber: 'SN-4711',
              participants: ['Erik Lund'],
              location: 'Kalmar, Sweden',
              date: '2026-10-07',
            },
          },
        });
        expect(response.status()).toBe(201);
        const loaded = loadedFrom(await response.json(), response.headers());
        ids.push(loaded.inspection.id);
        return loaded;
      },
      track: (id) => ids.push(id),
    });
    await Promise.all(ids.map(deleteInspection));
  },
});

function loadedFrom(body: unknown, headers: Record<string, string>): Loaded {
  const etag = headers['etag'];
  expect(etag).toBeTruthy();
  return { inspection: InspectionSchema.parse(body), etag: etag! };
}

/** The inspection as the API has stored it, through the SWA CLI with the request's sign-in. */
async function stored(request: APIRequestContext, id: string): Promise<Loaded> {
  const response = await request.get(`/api/inspections/${id}`);
  expect(response.status()).toBe(200);
  return loadedFrom(await response.json(), response.headers());
}

/** PUT of the client-owned fields, as the page's autosave sends them. */
function save(
  request: APIRequestContext,
  { inspection, etag }: Loaded,
  results: InspectionDraftInput['results'],
) {
  const { modelCode: _model, ...front } = inspection.front;
  return request.put(`/api/inspections/${inspection.id}`, {
    headers: { 'If-Match': etag },
    data: { front, results, extraDeviations: inspection.extraDeviations },
  });
}

/** Row ids by section: [[1.a, 1.b, 1.c], [2.a, 2.b, 2.c]]. */
const rowIds = (template: Template) =>
  template.sections.map((section) => section.items.map((item) => item.id));
const row = (page: Page, itemId: string) => page.locator(`#row-${itemId}`);
/** The pressed status segment of a row ("OK", "NOK", "N/A"); none while it has no status. */
const pressed = (page: Page, itemId: string) => row(page, itemId).locator('[aria-pressed="true"]');
const segment = (page: Page, itemId: string, label: 'OK' | 'NOK' | 'N/A') =>
  row(page, itemId).getByRole('button', { name: label, exact: true });
const comment = (page: Page, itemId: string) => page.locator(`[data-comment="${itemId}"]`);
const resp = (page: Page, itemId: string) => page.locator(`[data-resp="${itemId}"]`);
const severity = (page: Page, itemId: string) => row(page, itemId).locator('select');
/** "Saved", "Unsaved changes", "Saving…", "Not saved — Reload" or "Couldn’t save — Retry". */
const saveStatus = (page: Page) => page.locator('main header [role="status"]');
/** "4 / 6 rows filled · 2 NOK" in the sticky header. */
const progress = (page: Page) => page.locator('main header').getByText(/rows filled/);
const deviationsTab = (page: Page) => page.getByRole('tab', { name: /^Deviations/ });
const summaryRows = (page: Page) =>
  page.getByRole('region', { name: 'Deviation Summary' }).locator('tbody tr');

async function openInspection(page: Page, { inspection }: Loaded): Promise<void> {
  await page.goto(`/inspections/${inspection.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `${inspection.number} · ${inspection.front.machineName}`,
  );
}

/** "7 Oct 2026", as the list shows a front-page date. */
const calendarDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

test.describe('an inspector', () => {
  test.beforeEach(({ context }) => signIn(context, INSPECTOR, ['inspector']));

  test('creates an inspection from the front page form and finds it in the list', async ({
    page,
    published,
    inspections,
  }) => {
    const machine = `Line 3 – ${published.id}`;
    const settings = (await (await page.request.get('/api/settings')).json()) as {
      defaultLocation: string;
    };
    await page.goto('/inspections/new');
    await page.getByRole('radio', { name: published.name }).check();
    await expect(page.getByText('Rev: 1', { exact: true })).toBeVisible();

    // Nothing typed yet: Create says what is missing and goes there.
    await page.getByRole('button', { name: 'Create inspection' }).click();
    const machineName = page.getByLabel('Machine name', { exact: true });
    await expect(machineName).toBeFocused();
    await expect(machineName).toHaveAccessibleDescription('Machine name is required');

    await machineName.fill(machine);
    await page.getByLabel('Serial number', { exact: true }).fill('RMMG-1042');
    const participants = page.getByLabel('Participants', { exact: true });
    await participants.fill('Erik Lund');
    await participants.press('Enter');
    // A comma ends a name too; leaving the field adds the one still typed.
    await participants.pressSequentially('Anna Berg, Lars Ek');
    await expect(page.getByLabel('Location', { exact: true })).toHaveValue(
      settings.defaultLocation,
    );
    await page.getByRole('button', { name: 'Create inspection' }).click();

    await page.waitForURL(/\/inspections\/[A-Za-z0-9]{16}$/);
    const id = new URL(page.url()).pathname.split('/').pop()!;
    inspections.track(id);
    const { inspection } = await stored(page.request, id);
    expect(inspection).toMatchObject({
      templateId: published.id,
      templateRevision: 1,
      state: 'in_progress',
      front: {
        machineName: machine,
        serialNumber: 'RMMG-1042',
        modelCode: 'E2E',
        participants: ['Erik Lund', 'Anna Berg', 'Lars Ek'],
        location: settings.defaultLocation,
      },
      results: {},
      extraDeviations: [],
    });
    expect(inspection.number).toMatch(/^FI-\d{4}-\d{4,}$/);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `${inspection.number} · ${machine}`,
    );
    const header = page.locator('main header');
    await expect(header).toContainText('In progress');
    await expect(header).toContainText('S/N RMMG-1042');
    await expect(header).toContainText(`${published.name} · Rev 1`);
    await expect(progress(page)).toHaveText('0 / 6 rows filled · 0 NOK');
    await expect(
      page.getByRole('list', { name: 'Added participants' }).getByRole('listitem'),
    ).toHaveText(['Erik Lund', 'Anna Berg', 'Lars Ek']);

    await page.getByRole('main').getByRole('link', { name: 'Inspections' }).click();
    await page.getByRole('searchbox', { name: 'Search inspections' }).fill(published.id);
    const listed = page.getByRole('row').filter({ hasText: machine });
    await expect(listed.getByRole('cell')).toHaveText([
      inspection.number,
      machine,
      'RMMG-1042',
      'E2E',
      calendarDate(inspection.front.date),
      /^In progress\s*0 \/ 6 rows$/,
      '0',
    ]);
    await listed.getByRole('link', { name: inspection.number }).click();
    await expect(page).toHaveURL(new RegExp(`/inspections/${id}$`));
  });

  test('transcribes the checklist from the keyboard alone; it is autosaved', async ({
    page,
    published,
    inspections,
  }) => {
    const [[a1, b1, c1], [a2, b2, c2]] = rowIds(published) as [string[], string[]];
    const loaded = await inspections.create(page.request, published, `Keyboard – ${published.id}`);
    await openInspection(page, loaded);
    await expect(page.getByRole('list', { name: 'Keyboard shortcuts' })).toBeVisible();

    // "Continue at 1.a" starts at the first row without a status.
    await page.getByRole('button', { name: 'Continue at 1.a' }).focus();
    await page.keyboard.press('Enter');
    await expect(row(page, a1!)).toBeFocused();

    // 1 = OK, and on to the next row.
    await page.keyboard.press('1');
    await expect(pressed(page, a1!)).toHaveText('OK');
    await expect(row(page, b1!)).toBeFocused();

    // 2 = NOK stays on the row, which asks for a severity. Tab: comment, resp, severity, next row.
    await page.keyboard.press('2');
    await expect(pressed(page, b1!)).toHaveText('NOK');
    await expect(row(page, b1!)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(comment(page, b1!)).toBeFocused();
    // Letters typed in a field are text, not shortcuts (o, n, a, k, j, c are all keys on a row).
    await page.keyboard.type('Oil leak at the pump, check again');
    await page.keyboard.press('Tab');
    await expect(resp(page, b1!)).toBeFocused();
    await page.keyboard.type('Mekanik');
    await page.keyboard.press('Tab');
    await expect(severity(page, b1!)).toBeFocused();
    await expect(severity(page, b1!)).toHaveValue('minor');
    await page.keyboard.press('ArrowDown');
    await expect(severity(page, b1!)).toHaveValue('major');
    await page.keyboard.press('Tab');
    await expect(row(page, c1!)).toBeFocused();

    // K and J move up and down; A = N/A, which moves on into the next section.
    await page.keyboard.press('k');
    await expect(row(page, b1!)).toBeFocused();
    await page.keyboard.press('j');
    await expect(row(page, c1!)).toBeFocused();
    await page.keyboard.press('a');
    await expect(pressed(page, c1!)).toHaveText('N/A');
    await expect(row(page, a2!)).toBeFocused();

    // O = OK; ↑ goes back and 0 clears the mistake.
    await page.keyboard.press('o');
    await expect(row(page, b2!)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(row(page, a2!)).toBeFocused();
    await page.keyboard.press('0');
    await expect(pressed(page, a2!)).toHaveCount(0);
    await expect(row(page, a2!)).toBeFocused();

    // N = NOK; C goes to the comment, Escape back to the row.
    await page.keyboard.press('n');
    await page.keyboard.press('c');
    await expect(comment(page, a2!)).toBeFocused();
    await page.keyboard.type('Guard door scratched');
    await page.keyboard.press('Escape');
    await expect(row(page, a2!)).toBeFocused();
    // Enter in a field finishes the row: on to the next one.
    await page.keyboard.press('c');
    await page.keyboard.press('Enter');
    await expect(row(page, b2!)).toBeFocused();

    // 3 = N/A on 2.b, then ↑ and Backspace clear it again.
    await page.keyboard.press('3');
    await expect(row(page, c2!)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Backspace');
    await expect(pressed(page, b2!)).toHaveCount(0);
    await expect(progress(page)).toHaveText('4 / 6 rows filled · 2 NOK');
    await expect(deviationsTab(page)).toHaveText(/^Deviations\s*2$/);

    // Only the rows without a status: 2.a stays NOK.
    const sectionOne = page.getByRole('button', { name: /^Set remaining to OK in section 1/ });
    await expect(sectionOne).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Set remaining to OK in section 2 (2 rows)' }).click();
    await expect(pressed(page, a2!)).toHaveText('NOK');
    await expect(pressed(page, b2!)).toHaveText('OK');
    await expect(pressed(page, c2!)).toHaveText('OK');
    await expect(progress(page)).toHaveText('6 / 6 rows filled · 2 NOK');

    const expected: Record<string, RowResult> = {
      [a1!]: { status: 'OK' },
      [b1!]: {
        status: 'NOK',
        comment: 'Oil leak at the pump, check again',
        resp: 'Mekanik',
        severity: 'major',
      },
      [c1!]: { status: 'NA' },
      // Minor is the default; it is stored only once picked.
      [a2!]: { status: 'NOK', comment: 'Guard door scratched' },
      [b2!]: { status: 'OK' },
      [c2!]: { status: 'OK' },
    };
    await expect
      .poll(async () => (await stored(page.request, loaded.inspection.id)).inspection.results)
      .toEqual(expected);
    await expect(saveStatus(page)).toHaveText('Saved');

    await page.reload();
    await expect(progress(page)).toHaveText('6 / 6 rows filled · 2 NOK');
    await expect(pressed(page, b1!)).toHaveText('NOK');
    await expect(comment(page, b1!)).toHaveValue('Oil leak at the pump, check again');
    await expect(resp(page, b1!)).toHaveValue('Mekanik');
    await expect(severity(page, b1!)).toHaveValue('major');
    await expect(pressed(page, c1!)).toHaveText('N/A');

    // The list's summary follows the saves.
    await page.getByRole('main').getByRole('link', { name: 'Inspections' }).click();
    await page
      .getByRole('searchbox', { name: 'Search inspections' })
      .fill(loaded.inspection.number);
    const listed = page.getByRole('row').filter({ hasText: loaded.inspection.number });
    await expect(listed.getByRole('cell').nth(5)).toHaveText(/^In progress\s*6 \/ 6 rows$/);
    await expect(listed.getByRole('cell').nth(6)).toHaveText('2');
  });

  test('the Deviation Summary follows the NOK rows and takes extra deviations; the deviation table keeps up', async ({
    page,
    published,
    inspections,
  }) => {
    const [[, , c1], [, b2]] = rowIds(published) as [string[], string[]];
    const [one, two] = published.sections;
    const loaded = await inspections.create(
      page.request,
      published,
      `Deviations – ${published.id}`,
    );
    const { inspection } = loaded;
    await openInspection(page, loaded);
    await expect(deviationsTab(page)).toHaveText(/^Deviations\s*0$/);

    // Marked out of order: the summary still lists them in checklist order.
    await segment(page, b2!, 'NOK').click();
    await comment(page, b2!).fill('Coolant nozzle bent');
    await resp(page, b2!).fill('Mekanik');
    await segment(page, c1!, 'NOK').click();
    await comment(page, c1!).fill('Gap of 12 mm under the fence');
    await resp(page, c1!).fill('El-avdelningen');
    await expect(deviationsTab(page)).toHaveText(/^Deviations\s*2$/);

    await deviationsTab(page).click();
    await expect(summaryRows(page)).toHaveCount(2);
    await expect(summaryRows(page).nth(0).getByRole('cell')).toHaveText([
      'D-01',
      '1.c',
      one!.items[2]!.text,
      'Gap of 12 mm under the fence',
      'Minor',
      'El-avdelningen',
      '',
    ]);
    await expect(summaryRows(page).nth(1).getByRole('cell')).toHaveText([
      'D-02',
      '2.b',
      two!.items[1]!.text,
      'Coolant nozzle bent',
      'Minor',
      'Mekanik',
      '',
    ]);

    // An extra deviation, not tied to a row, filled in from the keyboard.
    await page.getByRole('button', { name: 'Add extra deviation' }).click();
    await expect(page.getByRole('textbox', { name: 'Description, D-03' })).toBeFocused();
    await page.keyboard.type('Operator manual missing');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Ordered from documentation');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Dokumentation');
    await expect(page.getByRole('combobox', { name: 'Severity, D-03' })).toHaveValue('major');
    await expect(deviationsTab(page)).toHaveText(/^Deviations\s*3$/);

    // Saved, and mirrored row by row in the deviations table (brief §4), KPI columns included.
    let extraId = '';
    await expect
      .poll(async () => {
        const saved = (await stored(page.request, inspection.id)).inspection;
        extraId = saved.extraDeviations[0]?.id ?? '';
        return saved.extraDeviations[0]?.resp;
      })
      .toBe('Dokumentation');
    const common = {
      partitionKey: 'E2E',
      inspectionId: inspection.id,
      inspectionNumber: inspection.number,
      serialNumber: 'SN-4711',
      machineName: inspection.front.machineName,
      modelCode: 'E2E',
      templateId: published.id,
      templateRevision: 1,
      inspectionDate: '2026-10-07',
      finalised: false,
      createdAt: expect.stringMatching(ISO_DATE_TIME),
    };
    const expectedRows = [
      {
        ...common,
        rowKey: `${inspection.id}_${c1}`,
        itemId: c1,
        sectionTitle: one!.title,
        displayRef: '1.c',
        checkpointText: one!.items[2]!.text,
        comment: 'Gap of 12 mm under the fence',
        resp: 'El-avdelningen',
        severity: 'minor',
      },
      {
        ...common,
        rowKey: `${inspection.id}_${b2}`,
        itemId: b2,
        sectionTitle: two!.title,
        displayRef: '2.b',
        checkpointText: two!.items[1]!.text,
        comment: 'Coolant nozzle bent',
        resp: 'Mekanik',
        severity: 'minor',
      },
      {
        ...common,
        rowKey: `${inspection.id}_${extraId}`,
        itemId: '',
        sectionTitle: '',
        displayRef: '—',
        checkpointText: 'Operator manual missing',
        comment: 'Ordered from documentation',
        resp: 'Dokumentation',
        severity: 'major',
      },
    ].sort((a, b) => a.rowKey.localeCompare(b.rowKey));
    await expect.poll(() => deviationRows(inspection.id)).toEqual(expectedRows);
    const firstRecorded = await deviationRows(inspection.id);

    // A row deviation's ref goes to its row in the checklist.
    await page.getByRole('button', { name: 'Row 2.b, go to it in the checklist' }).click();
    await expect(page.getByRole('tab', { name: 'Checklist' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(row(page, b2!)).toBeFocused();

    // An edit updates its row and keeps the time it was first recorded; NOK → OK removes it.
    await comment(page, b2!).fill('Coolant nozzle bent, replaced');
    await segment(page, c1!, 'OK').click();
    await expect(deviationsTab(page)).toHaveText(/^Deviations\s*2$/);
    await expect
      .poll(async () =>
        (await deviationRows(inspection.id)).map((stored) => [stored.rowKey, stored.comment]),
      )
      .toEqual(
        [
          [`${inspection.id}_${b2}`, 'Coolant nozzle bent, replaced'],
          [`${inspection.id}_${extraId}`, 'Ordered from documentation'],
        ].sort(([a], [b]) => a!.localeCompare(b!)),
      );
    const createdAt = (rows: { rowKey: string; createdAt?: unknown }[]) =>
      rows.find((stored) => stored.rowKey === `${inspection.id}_${b2}`)?.createdAt;
    expect(createdAt(await deviationRows(inspection.id))).toBe(createdAt(firstRecorded));

    await deviationsTab(page).click();
    await expect(summaryRows(page).nth(0).getByRole('cell').nth(1)).toHaveText('2.b');
    await expect(summaryRows(page).nth(0).getByRole('cell').nth(0)).toHaveText('D-01');
  });

  test('two inspectors on one inspection: the outdated save is refused with a reload', async ({
    page,
    browser,
    baseURL,
    published,
    inspections,
  }) => {
    const [[a1, b1]] = rowIds(published) as [string[]];
    const loaded = await inspections.create(page.request, published, `Conflict – ${published.id}`);
    const bob = await browser.newContext({ baseURL });
    try {
      await signIn(bob, 'bob.berg@modig.se', ['inspector']);
      const bobPage = await bob.newPage();
      await Promise.all([openInspection(page, loaded), openInspection(bobPage, loaded)]);

      await row(page, a1!).focus();
      await page.keyboard.press('1');
      await expect
        .poll(async () => (await stored(page.request, loaded.inspection.id)).inspection.results)
        .toEqual({ [a1!]: { status: 'OK' } });

      // Bob still works on the inspection as he loaded it.
      await row(bobPage, b1!).focus();
      await bobPage.keyboard.press('2');
      const banner = bobPage.getByRole('alert').filter({ hasText: CONFLICT_MESSAGE });
      await expect(banner).toBeVisible();
      await expect(saveStatus(bobPage)).toHaveText(/^Not saved —\s*Reload$/);
      await expect(bobPage.getByRole('button', { name: 'Finalise', exact: true })).toBeDisabled();
      expect((await stored(page.request, loaded.inspection.id)).inspection.results).toEqual({
        [a1!]: { status: 'OK' },
      });

      await banner.getByRole('button', { name: 'Reload' }).click();
      await bobPage
        .getByRole('dialog', { name: 'Discard your changes?' })
        .getByRole('button', { name: 'Discard and reload' })
        .click();
      await expect(banner).toBeHidden();
      await expect(pressed(bobPage, a1!)).toHaveText('OK');
      await expect(pressed(bobPage, b1!)).toHaveCount(0);
      await expect(saveStatus(bobPage)).toHaveText('Saved');
    } finally {
      await bob.close();
    }
  });
});

test('Finalise lists what is missing, then locks the inspection until an admin reopens it', async ({
  page,
  context,
  browser,
  baseURL,
  published,
  inspections,
}) => {
  const [[a1, b1, c1], [a2, b2, c2]] = rowIds(published) as [string[], string[]];
  await signIn(context, INSPECTOR, ['inspector']);
  const created = await inspections.create(page.request, published, `Finalise – ${published.id}`);
  const { id, number } = created.inspection;
  // Filled in except 2.c.
  const saved = await save(page.request, created, {
    [a1!]: { status: 'OK' },
    [b1!]: { status: 'NOK', comment: 'Screw missing', resp: 'Mekanik', severity: 'major' },
    [c1!]: { status: 'OK' },
    [a2!]: { status: 'NA' },
    [b2!]: { status: 'OK' },
  });
  expect(saved.status()).toBe(200);
  const admin: BrowserContext = await browser.newContext({ baseURL });
  try {
    await signIn(admin, ADMIN, ['admin']);
    const adminPage = await admin.newPage();
    // The admin's list loads meanwhile: a cold page load is the slowest step of a test.
    await Promise.all([openInspection(page, created), adminPage.goto('/inspections')]);

    // From the Deviations tab: the jump link goes back to the checklist and the row.
    await deviationsTab(page).click();
    await page.getByRole('button', { name: 'Finalise', exact: true }).click();
    const problems = page.getByRole('dialog', { name: 'Fix one problem before finalising' });
    await problems.getByRole('button', { name: /Row 2\.c has no status\./ }).click();
    await expect(problems).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Checklist' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(row(page, c2!)).toBeFocused();
    await expect(row(page, c2!)).toContainText('Row 2.c has no status.');
    const callout = page.getByText('One problem to fix before finalising.');
    await expect(callout).toBeVisible();

    await page.keyboard.press('1');
    await expect(callout).toBeHidden();
    await page.getByRole('button', { name: 'Finalise', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: `Finalise ${number}?` });
    await expect(confirm).toContainText('6 rows checked, 1 deviation.');
    await confirm.getByRole('button', { name: 'Finalise', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Finalised.' })).toBeVisible();

    // Locked: nothing to type in, no Finalise, and an inspector has no Reopen either.
    const header = page.locator('main header');
    await expect(header).toContainText('Finalised');
    await expect(header).toContainText(`by ${INSPECTOR}`);
    await expect(page.getByRole('main').locator('input, textarea, select')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Finalise|Reopen)$/ })).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Keyboard shortcuts' })).toHaveCount(0);
    await expect(row(page, b1!)).toContainText('Severity: Major');
    await expect
      .poll(async () => (await deviationRows(id)).map((stored) => stored.finalised))
      .toEqual([true]);

    // The API agrees, through the SWA CLI with the inspector's own sign-in.
    const finalised = await stored(page.request, id);
    expect(finalised.inspection).toMatchObject({
      state: 'finalised',
      finalisedBy: INSPECTOR,
      results: { [c2!]: { status: 'OK' } },
    });
    const refusedSave = await save(page.request, finalised, {});
    expect(refusedSave.status()).toBe(409);
    expect((await refusedSave.json()).message).toBe(
      'This inspection is finalised – an admin must reopen it.',
    );
    const refusedReopen = await page.request.post(`/api/inspections/${id}/reopen`, {
      headers: { 'If-Match': finalised.etag },
    });
    expect(refusedReopen.status()).toBe(403);

    // The admin opens it from the list (the page reads it afresh) and reopens it.
    await adminPage.getByRole('searchbox', { name: 'Search inspections' }).fill(number);
    await adminPage.getByRole('link', { name: number }).click();
    await adminPage.getByRole('button', { name: 'Reopen', exact: true }).click();
    await adminPage
      .getByRole('dialog', { name: `Reopen ${number}?` })
      .getByRole('button', { name: 'Reopen', exact: true })
      .click();
    await expect(adminPage.getByRole('status').filter({ hasText: 'Reopened.' })).toBeVisible();
    await expect(adminPage.locator('main header')).toContainText('In progress');
    await expect(adminPage.getByRole('button', { name: 'Finalise', exact: true })).toBeEnabled();
    await expect
      .poll(async () => (await deviationRows(id)).map((stored) => stored.finalised))
      .toEqual([false]);

    // Editable again, and autosaved from the reopened version.
    await comment(adminPage, b1!).fill('Screw missing, ordered');
    await expect
      .poll(async () => (await stored(adminPage.request, id)).inspection.results[b1!]?.comment)
      .toBe('Screw missing, ordered');
  } finally {
    await admin.close();
  }
});

test('an inspection keeps its checklist when the template gets a new revision', async ({
  page,
  context,
  published,
  inspections,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const before = await inspections.create(page.request, published, `Snapshot – ${published.id}`);
  const [one, two] = published.sections;

  // An admin rewords 1.a, drops 2.c, adds a row and publishes revision 2.
  const detail = await page.request.get(`/api/templates/${published.id}`);
  const { draft } = TemplateDetailSchema.parse(await detail.json());
  const reworded = `${one!.items[0]!.text} (reworded)`;
  const sections = [
    { ...one!, items: [{ ...one!.items[0]!, text: reworded }, ...one!.items.slice(1)] },
    {
      ...two!,
      items: [...two!.items.slice(0, 2), { id: newId(), text: 'Chip conveyor - Runs' }],
    },
  ];
  const savedDraft = await page.request.put(`/api/templates/${published.id}`, {
    headers: { 'If-Match': detail.headers()['etag']! },
    data: {
      name: draft.name,
      modelCode: draft.modelCode,
      printSettings: draft.printSettings,
      sections,
    },
  });
  expect(savedDraft.status()).toBe(200);
  const publish = await page.request.post(`/api/templates/${published.id}/publish`, {
    headers: { 'If-Match': savedDraft.headers()['etag']! },
    data: { changeNote: 'Reworded 1.a' },
  });
  expect(publish.status()).toBe(200);

  // The existing inspection is exactly as it was created.
  const after = await stored(page.request, before.inspection.id);
  expect(after.inspection.templateRevision).toBe(1);
  expect(after.inspection.templateSnapshot).toEqual(before.inspection.templateSnapshot);
  await openInspection(page, before);
  await expect(page.locator('main header')).toContainText(`${published.name} · Rev 1`);
  await expect(page.locator('[id^="row-"]')).toHaveCount(6);
  await expect(row(page, one!.items[0]!.id)).toContainText(one!.items[0]!.text);
  await expect(row(page, one!.items[0]!.id)).not.toContainText('(reworded)');
  await expect(row(page, two!.items[2]!.id)).toBeVisible();

  // A new one starts from revision 2.
  const next = await inspections.create(page.request, published, `Snapshot 2 – ${published.id}`);
  expect(next.inspection.templateRevision).toBe(2);
  expect(next.inspection.templateSnapshot.sections).toEqual(sections);
});
