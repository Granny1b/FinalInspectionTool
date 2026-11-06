/**
 * Machines: a machine made with the checks ticked for it, its page, a quality check started on it
 * with its front page filled in from the machine; its own checklist edited by an admin without
 * touching the template; a newer template revision brought in with the machine's own changes and
 * results kept; the final inspection's warning; an older inspection linked by hand; and who may do
 * what. Each test has machine models of its own, and deletes its machines, templates and
 * inspections afterwards.
 */
import {
  InspectionSchema,
  MachineDetailSchema,
  TemplateSchema,
  type Inspection,
  type MachineDetail,
  type Template,
} from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import {
  createQualityCheck,
  createTemplate,
  deleteInspectionsOf,
  deleteMachinesOf,
  deleteQualityChecks,
  deleteTemplate,
  publishRevision,
  uniqueMachineId,
} from './support/storage';

const ADMIN = 'anna.andersson@modig.se';
const INSPECTOR = 'sam.andersson@modig.se';

type Model = {
  code: string;
  final: Template;
  preStart: Template;
  frame: Template;
};

/**
 * A throwaway machine model (not in the settings, so its name is its code): its published final
 * inspection template and two published quality checks, "Pre start up" and "Frame". Every machine
 * of it and everything done with them goes afterwards.
 */
const test = base.extend<{ model: Model }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  model: async ({}, use, testInfo) => {
    const letters = Array.from({ length: 6 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    );
    const code = `MCH${letters.join('')}`;
    const final = await createTemplate(`E2E machines – ${testInfo.title}`, true, undefined, code);
    const preStart = await createQualityCheck(final, true);
    const frame = await renamed(await createQualityCheck(final, true), 'Frame');
    await use({ code, final, preStart, frame });
    await deleteInspectionsOf([final.id, preStart.id, frame.id]);
    await deleteMachinesOf([code]);
    await deleteQualityChecks(final.id);
    await deleteTemplate(final.id);
  },
});

/** A quality check under another name, as its revision 1 (and draft). */
async function renamed(check: Template, name: string): Promise<Template> {
  return publishRevision(
    { ...check, name: `Quality check – ${name}`, quality: { name, department: 'Quality' } },
    1,
    check.sections,
  );
}

/** A machine of `model` with copies of `templates`, made through the API. */
async function makeMachine(
  request: APIRequestContext,
  model: Model,
  templates: Template[],
): Promise<MachineDetail> {
  const response = await request.post('/api/machines', {
    data: {
      machineName: uniqueMachineId('E2E-Magellan'),
      modelCode: model.code,
      serialNumber: 'RM-E2E-016',
      templateIds: templates.map((template) => template.id),
    },
  });
  expect(response.status()).toBe(201);
  return MachineDetailSchema.parse(await response.json());
}

/** Starts a machine's check through the API, and marks its first row NOK. */
async function startedWithNok(request: APIRequestContext, id: string): Promise<Inspection> {
  const started = await request.post(`/api/inspections/${id}/start`, { data: {} });
  expect(started.status()).toBe(200);
  const inspection = InspectionSchema.parse(await started.json());
  const first = inspection.templateSnapshot.sections[0]!.items[0]!;
  const { modelCode: _model, ...front } = inspection.front;
  const saved = await request.put(`/api/inspections/${id}`, {
    headers: { 'If-Match': started.headers()['etag']! },
    data: {
      front,
      results: { [first.id]: { status: 'NOK', comment: 'Decal turned inward' } },
      extraDeviations: [],
    },
  });
  expect(saved.status()).toBe(200);
  return InspectionSchema.parse(await saved.json());
}

const checkCard = (page: Page, title: string) =>
  page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 3, name: title }) });

test('an inspector makes a machine with the checks ticked and starts one, filled in', async ({
  page,
  context,
  model,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  await page.goto('/');
  await expect(page).toHaveURL(/\/machines$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Machines' })).toBeVisible();
  await page.getByRole('link', { name: 'New machine' }).first().click();

  await expect(page.getByRole('heading', { level: 1, name: 'New machine' })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(`^${model.code}`) }).check();
  // Every published check of the model, ticked: its quality checks in their order, then the final
  // inspection.
  const checks = page.getByRole('region', { name: 'Checks' }).getByRole('checkbox');
  await expect(checks).toHaveCount(3);
  for (const box of await checks.all()) await expect(box).toBeChecked();
  await expect(page.getByRole('region', { name: 'Checks' })).toContainText(
    /Quality check – Frame.*Quality check – Pre start up.*Final inspection/s,
  );
  await page.getByRole('button', { name: 'Select none' }).click();
  for (const box of await checks.all()) await expect(box).not.toBeChecked();
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.getByRole('checkbox', { name: /Quality check – Frame/ }).uncheck();

  // The Machine ID and serial number are needed.
  await page.getByRole('button', { name: 'Create machine' }).click();
  await expect(page.getByText('Machine ID is required')).toBeVisible();
  const machineId = uniqueMachineId('E2E-Magellan');
  await page.getByLabel('Machine ID', { exact: true }).fill(machineId);
  await page.getByLabel('Serial number').fill('RM-E2E-016');
  await page.getByRole('button', { name: 'Create machine' }).click();

  // Its page: the checks ticked, not started.
  await page.waitForURL(/\/machines\/[A-Za-z0-9]{16}$/);
  await expect(page.getByRole('heading', { level: 1, name: machineId })).toBeVisible();
  await expect(page.getByText('In build · QC 0/1')).toBeVisible();
  const preStart = checkCard(page, 'Pre start up');
  await expect(preStart).toContainText('Not started');
  await expect(preStart).toContainText('Based on Pre start up rev 1');
  await expect(checkCard(page, 'Final inspection')).toContainText('Not started');
  await expect(page.getByRole('heading', { level: 3, name: 'Frame' })).toHaveCount(0);
  // An inspector has no admin menus, and can't change the Machine ID or serial number.
  await expect(page.getByRole('button', { name: 'Machine actions' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pre start up actions' })).toHaveCount(0);

  // The final inspection warns while a quality check is not finalised.
  await checkCard(page, 'Final inspection')
    .getByRole('button', { name: 'Start Final inspection' })
    .click();
  const warning = page.getByRole('dialog', { name: 'Start the final inspection?' });
  await expect(warning).toContainText('1 of 1 quality checks');
  await expect(warning).toContainText('is not finalised: Pre start up');
  await warning.getByRole('button', { name: 'Cancel' }).click();

  // Start: numbered, filled in from the machine, with the inspector as Checked by.
  await preStart.getByRole('button', { name: 'Start Pre start up' }).click();
  await page.waitForURL(/\/quality-checks\/[A-Za-z0-9]{16}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    new RegExp(`^QC-\\d{4}-\\d{4,} · ${machineId}$`),
  );
  const front = page.getByRole('region', { name: 'Front page' });
  await expect(front.getByText(machineId, { exact: true })).toBeVisible();
  await expect(front.getByText('RM-E2E-016', { exact: true })).toBeVisible();
  // The machine's: no fields for them here.
  await expect(front.getByLabel('Machine ID', { exact: true })).toHaveCount(0);
  await expect(front.getByLabel('Serial number')).toHaveCount(0);
  await expect(front).toContainText('From the machine; an admin can change it there.');
  await expect(front.getByText('Sam Andersson', { exact: true })).toBeVisible();
  // It leads back to its machine, where it is in progress.
  await page.getByRole('link', { name: machineId }).first().click();
  await expect(checkCard(page, 'Pre start up')).toContainText('In progress');
  await expect(checkCard(page, 'Pre start up')).toContainText(/QC-\d{4}-\d{4,}/);

  // It is listed under Quality checks now; the final inspection, not started, nowhere yet.
  await page.goto('/quality-checks');
  await expect(page.getByRole('row').filter({ hasText: machineId })).toHaveCount(1);
  await page.goto('/inspections');
  await expect(page.getByRole('row').filter({ hasText: machineId })).toHaveCount(0);

  // The start pages go through the machine.
  await page.goto('/inspections/new');
  await page.getByLabel('Search machines').fill(machineId);
  await page.getByRole('radio', { name: new RegExp(machineId) }).check();
  await expect(
    checkCard(page, 'Final inspection').getByRole('button', { name: 'Start Final inspection' }),
  ).toBeVisible();
});

test('an admin edits a machine’s checklist and updates it to a newer revision, keeping its own', async ({
  page,
  context,
  model,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const machine = await makeMachine(page.request, model, [model.preStart]);
  const checkId = machine.checks[0]!.id;
  const started = await startedWithNok(page.request, checkId);
  const [decals, signs] = started.templateSnapshot.sections[0]!.items;

  await page.goto(`/machines/${machine.machine.id}`);
  const card = checkCard(page, 'Pre start up');
  await card.getByRole('button', { name: 'Pre start up actions' }).click();
  await page.getByRole('menuitem', { name: 'Edit checklist' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Edit checklist' })).toBeVisible();
  await expect(page.getByText('The template and other machines are not changed.')).toBeVisible();

  // A row of its own; the second row deleted (it has no result), the first only after asking.
  await page.getByRole('button', { name: 'Add row to section 1' }).click();
  await expect(page.getByLabel('Row 1.c what to check')).toBeFocused();
  await page.keyboard.type('Check the extra coolant tank of this machine.');
  await page.getByRole('button', { name: 'Row 1.b actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByLabel('Row 1.b what to check')).toHaveValue(
    'Check the extra coolant tank of this machine.',
  );
  await page.getByRole('button', { name: 'Row 1.a actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const ask = page.getByRole('dialog', { name: 'Delete row 1.a?' });
  await expect(ask).toContainText('It has a result in this check');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Row 1.a what to check')).toHaveValue(decals!.text);
  await expect(page.locator('main header [role="status"]')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Done' }).click();

  // The check has it; the template doesn't.
  await page.waitForURL(new RegExp(`/quality-checks/${checkId}$`));
  await expect(page.getByText('Check the extra coolant tank of this machine.')).toBeVisible();
  const stored = InspectionSchema.parse(
    await (await page.request.get(`/api/inspections/${checkId}`)).json(),
  );
  const own = stored.templateSnapshot.sections[0]!.items[1]!;
  expect(stored.templateSnapshot.sections[0]!.items.map((item) => item.id)).toEqual([
    decals!.id,
    own.id,
  ]);
  const revision1 = TemplateSchema.parse(
    await (await page.request.get(`/api/templates/${model.preStart.id}/revisions/1`)).json(),
  );
  expect(revision1.sections[0]!.items.map((item) => item.id)).toEqual([decals!.id, signs!.id]);

  // The template's revision 2 rewords the first row and adds one at the end.
  await publishRevision(model.preStart, 2, [
    {
      ...model.preStart.sections[0]!,
      items: [
        { ...decals!, text: 'Check the safety decals on both balancing tubes.' },
        signs!,
        { id: 'E2Enewrow' + model.code, text: 'Covers fitted and tight.' },
      ],
    },
  ]);
  await page.goto(`/machines/${machine.machine.id}`);
  await expect(card).toContainText('Based on Pre start up rev 1 · 1 row added, 1 removed');
  await expect(card).toContainText('Rev 2 available · this machine has rev 1');
  await card.getByRole('button', { name: 'Update… Pre start up' }).click();

  const preview = page.getByRole('dialog', { name: 'Update Pre start up to rev 2?' });
  await expect(preview).toContainText('From the template: 1 row added, 1 reworded.');
  await expect(preview.getByRole('region', { name: 'Sections' })).toContainText('Safety features');
  await preview.getByRole('button', { name: 'Update to rev 2' }).click();
  await expect(preview).toBeHidden();
  await expect(page.getByText('Pre start up was updated to rev 2.')).toBeVisible();
  await expect(card).toContainText('Based on Pre start up rev 2 · 1 row added, 1 removed');
  await expect(card).not.toContainText('available');

  // The machine's row stays, the removed one stays removed, the result stays on its row.
  const updated = InspectionSchema.parse(
    await (await page.request.get(`/api/inspections/${checkId}`)).json(),
  );
  expect(updated.templateRevision).toBe(2);
  expect(updated.templateSnapshot.sections[0]!.items.map((item) => item.text)).toEqual([
    'Check the safety decals on both balancing tubes.',
    'Check the extra coolant tank of this machine.',
    'Covers fitted and tight.',
  ]);
  expect(updated.results[decals!.id]).toMatchObject({
    status: 'NOK',
    comment: 'Decal turned inward',
  });
});

test('an admin links an older inspection to a machine by hand', async ({
  page,
  context,
  model,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const machine = await makeMachine(page.request, model, []);
  // A final inspection started before machines existed, with a Machine ID typed by hand.
  const created = await page.request.post('/api/inspections', {
    data: {
      templateId: model.final.id,
      front: {
        machineName: 'Typed by hand',
        serialNumber: 'OLD-1',
        participants: [],
        location: 'Kalmar, Sweden',
        date: '2026-10-07',
      },
    },
  });
  expect(created.status()).toBe(201);
  const inspection = InspectionSchema.parse(await created.json());

  // Machines offers to make machines of the inspections without one (not run here: it would
  // link every test's inspections).
  await page.goto('/machines');
  await page.getByRole('button', { name: 'Create machines from existing inspections' }).click();
  const offer = page.getByRole('dialog', { name: 'Create machines from existing inspections?' });
  await expect(offer).toContainText('One machine is made for each Machine ID and model');
  await offer.getByRole('button', { name: 'Cancel' }).click();

  await page.goto(`/inspections/${inspection.id}`);
  await page.getByRole('button', { name: 'Inspection actions' }).click();
  await page.getByRole('menuitem', { name: 'Link to a machine…' }).click();
  const pick = page.getByRole('dialog', { name: 'Link to a machine' });
  await pick.getByRole('radio', { name: new RegExp(machine.machine.machineName) }).check();
  await pick.getByRole('button', { name: 'Link to machine' }).click();
  await expect(pick).toBeHidden();
  // In progress, so it takes the machine's Machine ID and serial number, and leads back to it.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `${inspection.number} · ${machine.machine.machineName}`,
  );
  await page.getByRole('link', { name: machine.machine.machineName }).first().click();
  await expect(checkCard(page, 'Final inspection')).toContainText(inspection.number);
  await expect(page.getByText('Ready for final inspection')).toHaveCount(0);
  await expect(page.getByText('Final inspection in progress')).toBeVisible();
});

test('an admin orders a model’s quality checks; machines get them in that order', async ({
  page,
  context,
  model,
}) => {
  await signIn(context, ADMIN, ['admin']);
  await page.goto(`/templates/${model.final.id}/quality-checks`);
  const titles = page.getByRole('heading', { level: 2, name: /^Quality check – / });
  // By title until an order is set.
  await expect(titles).toHaveText(['Quality check – Frame', 'Quality check – Pre start up']);
  // Pre start up first, moved with the keyboard on its handle (beside Frame in the grid).
  // Each step once the last is announced: the drag measures the cards first.
  const announced = page.locator('[id^="DndLiveRegion"]');
  await page.getByRole('button', { name: 'Move Quality check – Pre start up' }).focus();
  await page.keyboard.press('Space');
  await expect(announced).toHaveText('Quality check – Pre start up is over number 2.');
  await page.keyboard.press('ArrowLeft');
  await expect(announced).toHaveText('Quality check – Pre start up is over number 1.');
  await page.keyboard.press('Space');
  await expect(announced).toHaveText('Quality check – Pre start up is now number 1.');
  await expect(titles).toHaveText(['Quality check – Pre start up', 'Quality check – Frame']);
  await expect
    .poll(
      async () =>
        (await (
          await page.request.get(`/api/templates/${model.final.id}/quality-check-order`)
        ).json()) as unknown,
    )
    .toEqual({ order: [model.preStart.id, model.frame.id] });
  // Kept: a reload, and the order a new machine offers them in.
  await page.reload();
  await expect(titles).toHaveText(['Quality check – Pre start up', 'Quality check – Frame']);
  await page.goto(`/machines/new?model=${model.code}`);
  await expect(page.getByRole('region', { name: 'Checks' })).toContainText(
    /Quality check – Pre start up.*Quality check – Frame.*Final inspection/s,
  );
});

test('only admins edit checklists, update, link, rename and delete machines', async ({
  page,
  context,
  model,
  playwright,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const machine = await makeMachine(page.request, model, [model.preStart]);
  const check = await page.request.get(`/api/inspections/${machine.checks[0]!.id}`);
  const etag = check.headers()['etag']!;

  const inspector = await playwright.request.newContext({
    baseURL: 'http://localhost:4280',
    extraHTTPHeaders: {},
    storageState: {
      cookies: [
        {
          name: 'StaticWebAppsAuthCookie',
          value: Buffer.from(
            JSON.stringify({
              identityProvider: 'aad',
              userId: `e2e-${INSPECTOR}`,
              userDetails: INSPECTOR,
              userRoles: ['anonymous', 'authenticated', 'inspector'],
              claims: [],
            }),
          ).toString('base64'),
          domain: 'localhost',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
  });
  const id = machine.checks[0]!.id;
  const refused = [
    await inspector.put(`/api/inspections/${id}/checklist`, {
      headers: { 'If-Match': etag },
      data: { sections: [] },
    }),
    await inspector.post(`/api/inspections/${id}/template-update`, {
      headers: { 'If-Match': etag },
      data: { revision: 2 },
    }),
    await inspector.put(`/api/inspections/${id}/machine`, {
      headers: { 'If-Match': etag },
      data: { machineRef: null },
    }),
    await inspector.delete(`/api/machines/${machine.machine.id}`, {
      headers: { 'If-Match': '"x"' },
    }),
    await inspector.post('/api/machines/from-inspections'),
    await inspector.put(`/api/machines/${machine.machine.id}`, {
      headers: { 'If-Match': '"x"' },
      data: { machineName: 'Renamed', serialNumber: 'S/N' },
    }),
  ];
  expect(refused.map((response) => response.status())).toEqual([403, 403, 403, 403, 403, 403]);
  await inspector.dispose();

  // An admin deletes a machine nobody has started a check on, with its checks.
  await page.goto(`/machines/${machine.machine.id}`);
  await page.getByRole('button', { name: 'Machine actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete machine' }).click();
  await page
    .getByRole('dialog', { name: `Delete ${machine.machine.machineName}?` })
    .getByRole('button', { name: 'Delete machine' })
    .click();
  await expect(page).toHaveURL(/\/machines$/);
  expect((await page.request.get(`/api/machines/${machine.machine.id}`)).status()).toBe(404);
  expect((await page.request.get(`/api/inspections/${id}`)).status()).toBe(404);
});

test('the lists’ search boxes offer every machine; picking one shows only its checks and deviations', async ({
  page,
  context,
  model,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const first = await makeMachine(page.request, model, [model.preStart]);
  const second = await makeMachine(page.request, model, [model.preStart]);
  await startedWithNok(page.request, first.checks[0]!.id);
  await startedWithNok(page.request, second.checks[0]!.id);
  const [one, two] = [first.machine, second.machine];

  // Quality checks: the box lists the machines matching what is typed; a click picks one.
  await page.goto(`/quality-checks?model=${model.code}`);
  const search = page.getByRole('combobox', { name: 'Search quality checks' });
  await search.fill(one.machineName.slice(0, -2));
  const options = page.getByRole('listbox', { name: 'Machines' });
  await expect(options.getByRole('option', { name: new RegExp(one.machineName) })).toBeVisible();
  await options.getByRole('option', { name: new RegExp(one.machineName) }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]machine=${one.id}`));
  await expect(search).toHaveValue(one.machineName);
  await expect(options).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: one.machineName })).toHaveCount(1);
  await expect(page.getByRole('row').filter({ hasText: two.machineName })).toHaveCount(0);

  // Quality check deviations: the keyboard picks one too (the list shows them all once picked).
  const group = (name: string) => page.getByRole('region', { name: new RegExp(`^${name} S/N`) });
  await page.goto(`/deviations/quality?model=${model.code}`);
  await expect(group(one.machineName)).toBeVisible();
  await expect(group(two.machineName)).toBeVisible();
  const logSearch = page.getByRole('combobox', { name: 'Search deviations' });
  await logSearch.fill(two.machineName);
  await logSearch.press('Enter');
  await expect(logSearch).toHaveValue(two.machineName);
  await expect(group(two.machineName)).toBeVisible();
  await expect(group(one.machineName)).toHaveCount(0);
  // The CSV is named after the machine.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toContain(`, ${two.machineName}.csv`);

  // × goes back to every machine.
  await page.getByRole('button', { name: 'Show every machine' }).click();
  await expect(logSearch).toHaveValue('');
  await expect(group(one.machineName)).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]machine=/);
});
