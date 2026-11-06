import {
  CONFLICT_MESSAGE,
  InspectionSchema,
  newId,
  SettingsSchema,
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
  type Locator,
  type Page,
} from '@playwright/test';
import { signIn } from './support/auth';
import {
  createTemplate,
  deleteInspection,
  deleteMachinesOf,
  deleteTemplate,
  deviationRows,
} from './support/storage';

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

/**
 * The settings' Responsible and category lists, which the selects offer. Tests pick from their
 * first two entries: another test may add entries at the end meanwhile, never before them.
 */
async function pickLists(
  request: APIRequestContext,
): Promise<{ responsibles: string[]; categories: string[] }> {
  const response = await request.get('/api/settings');
  expect(response.status()).toBe(200);
  const { responsibles, deviationCategories } = SettingsSchema.parse(await response.json());
  expect(responsibles.length).toBeGreaterThanOrEqual(2);
  expect(deviationCategories.length).toBeGreaterThanOrEqual(2);
  return { responsibles, categories: deviationCategories };
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
/** The row's Responsible select. */
const resp = (page: Page, itemId: string) => page.locator(`[data-resp="${itemId}"]`);
/** A NOK row's Category select. */
const category = (page: Page, itemId: string) => page.locator(`[data-category="${itemId}"]`);
const severity = (page: Page, itemId: string) =>
  row(page, itemId).getByRole('combobox', { name: /^Severity, row / });
/** "Saved", "Unsaved changes", "Saving…", "Not saved — Reload" or "Couldn’t save — Retry". */
const saveStatus = (page: Page) => page.locator('main header [role="status"]');
/** "4 / 6 rows filled · 2 NOK" in the sticky header. */
const progress = (page: Page) => page.locator('main header').getByText(/rows filled/);
const deviationsTab = (page: Page) => page.getByRole('tab', { name: /^Deviations/ });
const summaryCards = (page: Page) =>
  page.getByRole('region', { name: 'Deviation Summary' }).locator('article[data-deviation]');

/**
 * A row deviation's card: number, ref (a link to the row), checkpoint, severity, and its details:
 * comment, responsible and category.
 */
async function expectRowCard(
  card: Locator,
  expected: { number: string; ref: string; text: string; severity: string; details: string[] },
): Promise<void> {
  await expect(card.getByRole('heading', { level: 3 })).toHaveText(expected.number);
  await expect(
    card.getByRole('button', { name: `Row ${expected.ref}, go to it in the checklist` }),
  ).toBeVisible();
  await expect(card).toContainText(expected.text);
  await expect(card).toContainText(`Severity: ${expected.severity}`);
  await expect(card.getByRole('definition')).toHaveText(expected.details);
}

async function openInspection(page: Page, { inspection }: Loaded): Promise<void> {
  await page.goto(`/inspections/${inspection.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `${inspection.number} · ${inspection.front.machineName}`,
  );
}

/** "2026-10-07", as the list shows a front-page date: as stored, ISO. */
const calendarDate = (date: string) => date;

test.describe('an inspector', () => {
  test.beforeEach(({ context }) => signIn(context, INSPECTOR, ['inspector']));

  test('starts a final inspection on a new machine, filled in from it, and finds it in the list', async ({
    page,
    published,
    inspections,
  }) => {
    // A model of its own: other tests' templates have model E2E too.
    const model = `FIN${published.id
      .slice(0, 8)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, 'X')}`;
    const own = await createTemplate(
      `E2E inspections – own model ${published.id}`,
      true,
      undefined,
      model,
    );
    const machine = `Line 3 – ${own.id}`;
    try {
      const settings = (await (await page.request.get('/api/settings')).json()) as {
        defaultLocation: string;
      };
      // New final inspection: pick the machine, or make it.
      await page.goto('/inspections');
      await page.getByRole('link', { name: 'New final inspection' }).first().click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'New final inspection' }),
      ).toBeVisible();
      await page.getByRole('link', { name: 'New machine' }).click();
      await page.getByRole('radio', { name: new RegExp(`^${model}`) }).check();
      await expect(page.getByRole('checkbox', { name: /Final inspection/ })).toBeChecked();

      // Nothing typed yet: Create says what is missing and goes there.
      await page.getByRole('button', { name: 'Create machine' }).click();
      const machineName = page.getByLabel('Machine ID', { exact: true });
      await expect(machineName).toBeFocused();
      await expect(machineName).toHaveAccessibleDescription(
        'As in Monitor, e.g. Magellan#1 Machine ID is required',
      );
      await machineName.fill(machine);
      await page.getByLabel('Serial number', { exact: true }).fill('RMMG-1042');
      await page.getByRole('button', { name: 'Create machine' }).click();
      await page.waitForURL(/\/machines\/[A-Za-z0-9]{16}$/);
      await page.getByRole('button', { name: 'Start Final inspection' }).click();

      await page.waitForURL(/\/inspections\/[A-Za-z0-9]{16}$/);
      const id = new URL(page.url()).pathname.split('/').pop()!;
      inspections.track(id);
      // The keyboard starts at "Continue at 1.a": one Enter and transcribing begins.
      await expect(page.getByRole('button', { name: 'Continue at 1.a' })).toBeFocused();
      const { inspection } = await stored(page.request, id);
      expect(inspection).toMatchObject({
        templateId: own.id,
        templateRevision: 1,
        state: 'in_progress',
        front: {
          machineName: machine,
          serialNumber: 'RMMG-1042',
          modelCode: model,
          participants: ['Sam Andersson'],
          location: settings.defaultLocation,
        },
        results: {},
        extraDeviations: [],
      });
      expect(inspection.number).toMatch(/^FI-\d{4}-\d{4,}$/);
      expect(inspection.machineRef).toMatch(/^[A-Za-z0-9]{16}$/);

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        `${inspection.number} · ${machine}`,
      );
      const header = page.locator('main header');
      await expect(header).toContainText('In progress');
      await expect(header).toContainText('S/N RMMG-1042');
      await expect(header).toContainText(`${own.name} · Rev 1`);
      await expect(progress(page)).toHaveText('0 / 6 rows filled · 0 NOK');
      // More participants are added on its front page.
      const participants = page.getByLabel('Participants', { exact: true });
      await participants.fill('Erik Lund');
      await participants.press('Enter');
      await expect(
        page.getByRole('list', { name: 'Added participants' }).getByRole('listitem'),
      ).toHaveText(['Sam Andersson', 'Erik Lund']);

      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: 'Inspections' })
        .click();
      await page.getByRole('searchbox', { name: 'Search inspections' }).fill(own.id);
      await page.getByRole('combobox', { name: 'State' }).selectOption('in_progress');
      const listed = page.getByRole('row').filter({ hasText: machine });
      await expect(listed.getByRole('cell')).toHaveText([
        inspection.number,
        machine,
        'RMMG-1042',
        model,
        calendarDate(inspection.front.date),
        /^In progress\s*0 \/ 6 rows$/,
        '0',
      ]);
      await listed.getByRole('link', { name: inspection.number }).click();
      await expect(page).toHaveURL(new RegExp(`/inspections/${id}$`));
      await expect(page.getByRole('button', { name: 'Continue at 1.a' })).toBeFocused();
      // A machine's inspection leads back to its machine.
      await expect(
        page.getByRole('main').getByRole('link', { name: machine }).first(),
      ).toHaveAttribute('href', `/machines/${inspection.machineRef}`);
    } finally {
      await deleteMachinesOf([model]);
      await deleteTemplate(own.id);
    }
  });

  test('one without a machine leads back to the list as it was left', async ({
    page,
    published,
    inspections,
  }) => {
    const machine = `Line 4 – ${published.id}`;
    const { inspection } = await inspections.create(page.request, published, machine);
    await page.goto('/inspections');
    await page.getByRole('searchbox', { name: 'Search inspections' }).fill(published.id);
    await page.getByRole('combobox', { name: 'State' }).selectOption('in_progress');
    const listed = page.getByRole('row').filter({ hasText: machine });
    await listed.getByRole('link', { name: inspection.number }).click();
    await expect(page).toHaveURL(new RegExp(`/inspections/${inspection.id}$`));

    // The page's own link back returns to the list as it was left, search and filters included.
    await page.getByRole('main').getByRole('link', { name: 'Inspections' }).click();
    await expect(page).toHaveURL(new RegExp(`/inspections\\?q=${published.id}&state=in_progress$`));
    await expect(page.getByRole('searchbox', { name: 'Search inspections' })).toHaveValue(
      published.id,
    );
    await expect(page.getByRole('combobox', { name: 'State' })).toHaveValue('in_progress');
    await expect(listed).toBeVisible();
  });

  test('transcribes the checklist from the keyboard alone; it is autosaved', async ({
    page,
    published,
    inspections,
  }) => {
    const [[a1, b1, c1], [a2, b2, c2]] = rowIds(published) as [string[], string[]];
    const { responsibles } = await pickLists(page.request);
    const loaded = await inspections.create(page.request, published, `Keyboard – ${published.id}`);
    await openInspection(page, loaded);
    await expect(page.getByRole('list', { name: 'Keyboard shortcuts' })).toBeVisible();

    // The page opens on "Continue at 1.a", which goes to the first row without a status.
    await expect(page.getByRole('button', { name: 'Continue at 1.a' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(row(page, a1!)).toBeFocused();

    // 1 = OK, and on to the next row.
    await page.keyboard.press('1');
    await expect(pressed(page, a1!)).toHaveText('OK');
    await expect(row(page, b1!)).toBeFocused();

    // 2 = NOK stays on the row, which asks for a category and a severity. Tab: comment,
    // responsible, category, severity, next row.
    await page.keyboard.press('2');
    await expect(pressed(page, b1!)).toHaveText('NOK');
    await expect(row(page, b1!)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(comment(page, b1!)).toBeFocused();
    // Letters typed in a field are text, not shortcuts (o, n, a, k, j, c are all keys on a row).
    await page.keyboard.type('Oil leak at the pump, check again');
    await page.keyboard.press('Tab');
    await expect(resp(page, b1!)).toBeFocused();
    // Responsible is a select of the settings' list: ↓ picks the first, and is no shortcut.
    await page.keyboard.press('ArrowDown');
    await expect(resp(page, b1!)).toHaveValue(responsibles[0]!);
    await expect(row(page, b1!)).not.toBeFocused();
    await page.keyboard.press('Tab');
    await expect(category(page, b1!)).toBeFocused();
    await expect(category(page, b1!)).toHaveValue('');
    await page.keyboard.press('Tab');
    await expect(severity(page, b1!)).toBeFocused();
    await expect(severity(page, b1!)).toHaveValue('minor');
    await page.keyboard.press('ArrowDown');
    await expect(severity(page, b1!)).toHaveValue('major');
    await page.keyboard.press('Tab');
    await expect(row(page, c1!)).toBeFocused();

    // From the last field of a section's last row, Tab goes straight on to the next section.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(resp(page, c1!)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(row(page, a2!)).toBeFocused();
    await page.keyboard.press('k');
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

    // R on a row sets the rest of its section to OK, as the section's button does: only the rows
    // without a status, so 2.a stays NOK. The focus stays on the row.
    const sectionOne = page.getByRole('button', { name: /^Set remaining to OK in section 1/ });
    await expect(sectionOne).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByRole('button', { name: 'Set remaining to OK in section 2 (2 rows)' }),
    ).toBeVisible();
    await expect(row(page, b2!)).toBeFocused();
    await page.keyboard.press('r');
    await expect(row(page, b2!)).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Set remaining to OK in section 2 (0 rows)' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(pressed(page, a2!)).toHaveText('NOK');
    await expect(pressed(page, b2!)).toHaveText('OK');
    await expect(pressed(page, c2!)).toHaveText('OK');
    await expect(progress(page)).toHaveText('6 / 6 rows filled · 2 NOK');

    const expected: Record<string, RowResult> = {
      [a1!]: { status: 'OK' },
      [b1!]: {
        status: 'NOK',
        comment: 'Oil leak at the pump, check again',
        resp: responsibles[0],
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
    await expect(resp(page, b1!)).toHaveValue(responsibles[0]!);
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
    const { responsibles, categories } = await pickLists(page.request);
    const loaded = await inspections.create(
      page.request,
      published,
      `Deviations – ${published.id}`,
    );
    const { inspection } = loaded;
    await openInspection(page, loaded);
    await expect(deviationsTab(page)).toHaveText(/^Deviations\s*0$/);

    // Marked out of order: the summary still lists them in checklist order. A click on a status
    // leaves the row focused, with its ring, for the next key.
    await segment(page, b2!, 'NOK').click();
    await expect(row(page, b2!)).toBeFocused();
    await expect(row(page, b2!)).toHaveCSS('outline-style', 'solid');
    await comment(page, b2!).fill('Coolant nozzle bent');
    await resp(page, b2!).selectOption(responsibles[0]!);
    await segment(page, c1!, 'NOK').click();
    await comment(page, c1!).fill('Gap of 12 mm under the fence');
    await resp(page, c1!).selectOption(responsibles[1]!);
    await category(page, c1!).selectOption(categories[0]!);
    await expect(deviationsTab(page)).toHaveText(/^Deviations\s*2$/);

    await deviationsTab(page).click();
    await expect(summaryCards(page)).toHaveCount(2);
    await expectRowCard(summaryCards(page).nth(0), {
      number: 'D-01',
      ref: '1.c',
      text: one!.items[2]!.text,
      severity: 'Minor',
      details: ['Gap of 12 mm under the fence', responsibles[1]!, categories[0]!],
    });
    await expectRowCard(summaryCards(page).nth(1), {
      number: 'D-02',
      ref: '2.b',
      text: two!.items[1]!.text,
      severity: 'Minor',
      details: ['Coolant nozzle bent', responsibles[0]!, '—'],
    });

    // An extra deviation, not tied to a row, filled in from the keyboard.
    await page.getByRole('button', { name: 'Add extra deviation' }).click();
    await expect(page.getByRole('textbox', { name: 'Description, D-03' })).toBeFocused();
    await page.keyboard.type('Operator manual missing');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Ordered from documentation');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('combobox', { name: 'Severity, D-03' })).toHaveValue('major');
    await expect(page.getByRole('combobox', { name: 'Responsible, D-03' })).toHaveValue(
      responsibles[0]!,
    );
    await expect(page.getByRole('combobox', { name: 'Category, D-03' })).toHaveValue(
      categories[1]!,
    );
    await expect(deviationsTab(page)).toHaveText(/^Deviations\s*3$/);

    // Saved, and mirrored row by row in the deviations table (brief §4), KPI columns included.
    let extraId = '';
    await expect
      .poll(async () => {
        const saved = (await stored(page.request, inspection.id)).inspection;
        extraId = saved.extraDeviations[0]?.id ?? '';
        return saved.extraDeviations[0]?.category;
      })
      .toBe(categories[1]);
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
      // A final inspection's, with its checklist's name.
      kind: 'final',
      checkName: published.name,
      // Not followed up yet in the deviation log.
      status: 'open',
      action: '',
      closedOn: '',
      closedBy: '',
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
        resp: responsibles[1],
        severity: 'minor',
        category: categories[0],
        deviationNumber: 'D-01',
      },
      {
        ...common,
        rowKey: `${inspection.id}_${b2}`,
        itemId: b2,
        sectionTitle: two!.title,
        displayRef: '2.b',
        checkpointText: two!.items[1]!.text,
        comment: 'Coolant nozzle bent',
        resp: responsibles[0],
        severity: 'minor',
        category: '',
        deviationNumber: 'D-02',
      },
      {
        ...common,
        rowKey: `${inspection.id}_${extraId}`,
        itemId: '',
        sectionTitle: '',
        displayRef: '—',
        checkpointText: 'Operator manual missing',
        comment: 'Ordered from documentation',
        resp: responsibles[0],
        severity: 'major',
        category: categories[1],
        deviationNumber: 'D-03',
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
    await expect(summaryCards(page).nth(0).getByRole('heading', { level: 3 })).toHaveText('D-01');
    await expect(
      summaryCards(page).nth(0).getByRole('button', { name: 'Row 2.b, go to it in the checklist' }),
    ).toBeVisible();
  });

  test('Responsible offers the settings’ list and keeps a value that is not on it', async ({
    page,
    published,
    inspections,
  }) => {
    const [[a1, b1]] = rowIds(published) as [string[]];
    const { responsibles } = await pickLists(page.request);
    const created = await inspections.create(
      page.request,
      published,
      `Responsible – ${published.id}`,
    );
    // Typed before Responsible was a list (or removed from it since): kept as it is.
    const offList = `Svets ${published.id}`;
    expect((await save(page.request, created, { [a1!]: { resp: offList } })).status()).toBe(200);
    await openInspection(page, created);

    const options = (itemId: string) => resp(page, itemId).locator('option').allTextContents();
    // The first two only: another test may change the end of the list meanwhile.
    await expect.poll(() => options(b1!)).toEqual(expect.arrayContaining(responsibles.slice(0, 2)));
    expect((await options(b1!))[0]).toBe('Responsible');
    await expect(resp(page, a1!)).toHaveValue(offList);
    expect((await options(a1!)).slice(0, 3)).toEqual([
      'Responsible',
      `${offList} (not in the list)`,
      responsibles[0],
    ]);

    // Picking another can be undone while the page is open; none is a choice too.
    await resp(page, a1!).selectOption(responsibles[1]!);
    expect(await options(a1!)).toContain(`${offList} (not in the list)`);
    await resp(page, b1!).selectOption(responsibles[1]!);
    await expect
      .poll(async () => (await stored(page.request, created.inspection.id)).inspection.results)
      .toEqual({ [a1!]: { resp: responsibles[1] }, [b1!]: { resp: responsibles[1] } });
    await resp(page, a1!).selectOption(offList);
    await resp(page, b1!).selectOption('');
    await expect
      .poll(async () => (await stored(page.request, created.inspection.id)).inspection.results)
      .toEqual({ [a1!]: { resp: offList } });
  });

  test('a participant typed but not yet added counts as unsaved', async ({
    page,
    published,
    inspections,
  }) => {
    const loaded = await inspections.create(page.request, published, `People – ${published.id}`);
    const { id, number } = loaded.inspection;
    await page.goto('/inspections');
    await page.getByRole('searchbox', { name: 'Search inspections' }).fill(number);
    await page.getByRole('link', { name: number }).click();
    await expect(saveStatus(page)).toHaveText('Saved');

    const participants = page.getByLabel('Participants', { exact: true });
    await participants.pressSequentially('Anna Svensson');
    await expect(saveStatus(page)).toHaveText('Unsaved changes');
    // Back in the browser, without leaving the field: the name is added and saved first.
    await page.goBack();
    await expect(page).toHaveURL(/\/inspections\?q=/);
    expect((await stored(page.request, id)).inspection.front.participants).toEqual([
      'Erik Lund',
      'Anna Svensson',
    ]);

    // Closing the tab with a name typed gets the browser's warning.
    await page.goForward();
    await page.getByLabel('Participants', { exact: true }).pressSequentially('Lars Ek');
    await expect(saveStatus(page)).toHaveText('Unsaved changes');
    const warning = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const shown = await warning;
    expect(shown.type()).toBe('beforeunload');
    await shown.dismiss();
  });

  test('a finalise whose answer is lost is not mistaken for a conflict', async ({
    page,
    published,
    inspections,
  }) => {
    const loaded = await inspections.create(page.request, published, `Lost – ${published.id}`);
    const { id, number } = loaded.inspection;
    const allOk = Object.fromEntries(
      rowIds(published)
        .flat()
        .map((itemId) => [itemId, { status: 'OK' as const }]),
    );
    expect((await save(page.request, loaded, allOk)).status()).toBe(200);
    await openInspection(page, loaded);
    // The finalise reaches the server and is carried out, but its answer never arrives.
    let lost = false;
    await page.route(`**/api/inspections/${id}/finalise`, async (route) => {
      if (lost) return route.continue();
      lost = true;
      await route.fetch();
      await route.abort('connectionreset');
    });

    await page.getByRole('button', { name: 'Finalise', exact: true }).click();
    await page
      .getByRole('dialog', { name: `Finalise ${number}?` })
      .getByRole('button', { name: 'Finalise', exact: true })
      .click();
    await expect(page.getByRole('status').filter({ hasText: 'Finalised.' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await stored(page.request, id)).inspection.state).toBe('finalised');
  });

  test('a busy Finalise ignores Escape; a 503 offers Try again', async ({
    page,
    published,
    inspections,
  }) => {
    const loaded = await inspections.create(page.request, published, `Busy – ${published.id}`);
    const { id, number } = loaded.inspection;
    const allOk = Object.fromEntries(
      rowIds(published)
        .flat()
        .map((itemId) => [itemId, { status: 'OK' as const }]),
    );
    expect((await save(page.request, loaded, allOk)).status()).toBe(200);
    await openInspection(page, loaded);
    // The first finalise is slow, then answers that the deviation records couldn't be updated.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let refused = false;
    await page.route(`**/api/inspections/${id}/finalise`, async (route) => {
      if (refused) return route.continue();
      refused = true;
      await held;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'unavailable',
          message: 'The deviation records could not be updated, so nothing was changed. Try again.',
        }),
      });
    });

    await page.getByRole('button', { name: 'Finalise', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: `Finalise ${number}?` });
    await confirm.getByRole('button', { name: 'Finalise', exact: true }).click();
    await expect(confirm.getByRole('button', { name: 'Finalising…' })).toBeVisible();
    // Chrome closes a dialog on the second Escape even though the page refuses it, unless the
    // dialog ignores close requests while busy.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(confirm).toBeVisible();

    release();
    await expect(confirm).toContainText('Finalise didn’t complete – try again.');
    await confirm.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Finalised.' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await stored(page.request, id)).inspection.state).toBe('finalised');
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
