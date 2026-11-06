/**
 * Doing a quality check on a machine: started from /quality-checks (machine → quality check →
 * serial number), its rows as cards with their pictures, OK / NOK / N/A and the deviation fields,
 * finalised; listed with the quality checks, never with the final inspections, and counted in
 * Insights under Quality checks only. Also the sidebar's four groups.
 */
import { readFile } from 'node:fs/promises';
import {
  InsightsSchema,
  InspectionSchema,
  type Inspection,
  type InspectionDraftInput,
  type Template,
} from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { testPhoto } from './support/photos';
import {
  createQualityCheck,
  createTemplate,
  deleteInspectionsOf,
  deleteQualityChecks,
  deleteTemplate,
  deviationRows,
  storeImage,
} from './support/storage';

const ADMIN = 'anna.andersson@modig.se';
const INSPECTOR = 'sam.andersson@modig.se';
const CHECK = 'Quality check – Pre start up';

/**
 * A throwaway machine of a model code of its own (not in the settings, so its name is its code):
 * a published final inspection template and its published "Quality check – Pre start up", whose
 * first row has a picture marked "Should look like this" and more information. Everything done
 * with them in a test goes with them afterwards.
 */
const test = base.extend<{ machine: { model: string; template: Template; check: Template } }>({
  machine: async ({ browser }, use, testInfo) => {
    const letters = Array.from({ length: 6 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    );
    const model = `QCE${letters.join('')}`;
    const template = await createTemplate(
      `E2E QC done – ${testInfo.title}`,
      true,
      undefined,
      model,
    );
    const imageId = await storeImage(
      await testPhoto(browser, { width: 800, height: 600, label: 'Decal' }),
    );
    const check = await createQualityCheck(template, true, {
      description: 'Both tubes. Turn the clamp, never the decal.',
      images: [{ imageId, caption: 'Decal facing out', annotations: [], verdict: 'good' }],
    });
    await use({ model, template, check });
    await deleteInspectionsOf([template.id, check.id]);
    await deleteQualityChecks(template.id);
    await deleteTemplate(template.id);
  },
});

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
/** A row's card, by its ref ("1.a"). */
const card = (page: Page, ref: string) =>
  page.getByRole('group', { name: new RegExp(`^Row ${ref.replace('.', '\\.')} `) });
const status = (page: Page, ref: string, label: 'OK' | 'NOK' | 'N/A') =>
  card(page, ref)
    .getByRole('group', { name: `Status, row ${ref}` })
    .getByRole('button', { name: label, exact: true });
const saveStatus = (page: Page) => page.locator('main header [role="status"]');

/** A quality check of `check`, every row filled (the first NOK), finalised, through the API. */
async function doneCheck(
  request: APIRequestContext,
  check: Template,
  serialNumber: string,
): Promise<Inspection> {
  const created = await request.post('/api/inspections', {
    data: {
      templateId: check.id,
      front: {
        machineName: 'Magellan#7',
        serialNumber,
        participants: ['Sam Andersson'],
        date: '2026-10-07',
      },
    },
  });
  expect(created.status()).toBe(201);
  const inspection = InspectionSchema.parse(await created.json());
  const [first, second] = inspection.templateSnapshot.sections[0]!.items;
  const { modelCode: _model, ...front } = inspection.front;
  const draft: InspectionDraftInput = {
    front,
    results: {
      [first!.id]: { status: 'NOK', comment: 'Decal turned inward', severity: 'major' },
      [second!.id]: { status: 'OK' },
    },
    extraDeviations: [],
  };
  const saved = await request.put(`/api/inspections/${inspection.id}`, {
    headers: { 'If-Match': created.headers()['etag']! },
    data: draft,
  });
  expect(saved.status()).toBe(200);
  const finalised = await request.post(`/api/inspections/${inspection.id}/finalise`, {
    headers: { 'If-Match': saved.headers()['etag']! },
  });
  expect(finalised.status()).toBe(200);
  return InspectionSchema.parse(await finalised.json());
}

/** A final inspection of `template`, its first row NOK and the rest OK, finalised. */
async function doneInspection(request: APIRequestContext, template: Template) {
  const created = await request.post('/api/inspections', {
    data: {
      templateId: template.id,
      front: {
        machineName: 'RigiMill MG',
        serialNumber: 'SN-FINAL',
        participants: [],
        location: 'Kalmar, Sweden',
        date: '2026-10-07',
      },
    },
  });
  expect(created.status()).toBe(201);
  const inspection = InspectionSchema.parse(await created.json());
  const ids = inspection.templateSnapshot.sections.flatMap((section) =>
    section.items.map((item) => item.id),
  );
  const { modelCode: _model, ...front } = inspection.front;
  const saved = await request.put(`/api/inspections/${inspection.id}`, {
    headers: { 'If-Match': created.headers()['etag']! },
    data: {
      front,
      results: Object.fromEntries(
        ids.map((id, index) => [id, { status: index === 0 ? 'NOK' : 'OK' }]),
      ),
      extraDeviations: [],
    },
  });
  const finalised = await request.post(`/api/inspections/${inspection.id}/finalise`, {
    headers: { 'If-Match': saved.headers()['etag']! },
  });
  expect(finalised.status()).toBe(200);
  return InspectionSchema.parse(await finalised.json());
}

test('the sidebar has Final inspection, Quality check, Setup and, for admins, Admin', async ({
  page,
  context,
}) => {
  await signIn(context, ADMIN, ['admin']);
  await page.goto('/quality-checks');
  const nav = mainNav(page);
  const groups = [
    ['Final inspection', ['Inspections', 'Deviations']],
    ['Quality check', ['Quality checks', 'Deviations']],
    ['Setup', ['Templates']],
    ['Admin', ['Insights', 'Settings']],
  ] as const;
  for (const [label, links] of groups) {
    const list = nav.getByRole('list', { name: label });
    await expect(list.getByRole('link')).toHaveText([...links]);
  }
  // In this order.
  await expect(nav.getByRole('list')).toHaveCount(4);
  await expect(nav.locator('p')).toHaveText(groups.map(([label]) => label));
  await expect(nav.getByRole('link', { name: 'Quality checks' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    nav.getByRole('list', { name: 'Final inspection' }).getByRole('link', { name: 'Deviations' }),
  ).toHaveAttribute('href', '/deviations/final');
  await expect(
    nav.getByRole('list', { name: 'Quality check' }).getByRole('link', { name: 'Deviations' }),
  ).toHaveAttribute('href', '/deviations/quality');

  await context.clearCookies();
  await signIn(context, INSPECTOR, ['inspector']);
  await page.reload();
  await expect(mainNav(page).locator('p')).toHaveText([
    'Final inspection',
    'Quality check',
    'Setup',
  ]);
});

test('an inspector starts a quality check, marks its rows on the cards and finalises it', async ({
  page,
  context,
  machine,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  await page.goto('/quality-checks');
  await expect(page.getByRole('heading', { level: 1, name: 'Quality checks' })).toBeVisible();
  await page.getByRole('link', { name: 'Start a quality check' }).first().click();

  // Machine → quality check → Machine ID, serial number and date.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Start a quality check' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: machine.model }).check();
  await page.getByRole('radio', { name: CHECK }).check();
  const startButton = page.getByRole('button', { name: 'Start quality check' });
  await startButton.click();
  await expect(page.getByText('Machine ID is required')).toBeVisible();
  await expect(page.getByText('Serial number is required')).toBeVisible();
  const machineId = page.getByLabel('Machine ID', { exact: true });
  await expect(machineId).toBeFocused();
  await expect(machineId).toHaveAccessibleDescription(
    'As in Monitor, e.g. Magellan#1 Machine ID is required',
  );
  await machineId.fill('Magellan#16');
  await page.getByLabel('Serial number').fill('RM-E2E-016');
  await expect(page.getByLabel('Date')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  // Checked by starts with the inspector; the quality check's front page is shown read-only.
  const frontPage = page.getByRole('region', { name: 'Front page' });
  await expect(frontPage.getByText('Sam Andersson', { exact: true })).toBeVisible();
  await expect(frontPage.getByText('Quality check – Pre start up')).toBeVisible();
  await startButton.click();

  await page.waitForURL(/\/quality-checks\/[A-Za-z0-9]{16}$/);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveText(/^QC-\d{4}-\d{4,} · Magellan#16$/);
  const number = (await title.textContent())!.split(' · ')[0]!;
  await expect(page.locator('main header')).toContainText(`${CHECK} · Rev 1`);
  await expect(page.locator('main header')).toContainText('S/N RM-E2E-016');
  // It prints as a final inspection does (quality-check-print.spec.ts).
  await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();

  // The rows as cards: what, how and the references.
  await expect(card(page, '1.a')).toContainText(
    'Check and verify safety decals on balancing tubes.',
  );
  await expect(card(page, '1.a')).toContainText('Should be visible and not turned inward.');
  await expect(card(page, '1.a')).toContainText('ISO 12100 · ISO 7010');
  await expect(page.getByText('0 / 2 rows filled')).toBeVisible();

  // The pictures, read-only, in a quality check's words.
  await card(page, '1.a').getByRole('button', { name: 'Pictures and information' }).click();
  const pictures = page.getByRole('dialog', { name: /^Pictures · 1\.a/ });
  await expect(pictures).toBeVisible();
  await expect(pictures).toContainText('Should look like this');
  await expect(pictures).toContainText('Decal facing out');
  await expect(pictures).toContainText('Both tubes. Turn the clamp, never the decal.');
  await page.keyboard.press('Escape');
  await expect(pictures).toBeHidden();
  // The picture tile opens them too.
  await card(page, '1.a').locator('[data-row-pictures="1.a"]').click();
  await expect(pictures).toBeVisible();
  await pictures.getByRole('button', { name: 'Close' }).click();

  // Finalise is blocked while rows have no status.
  await page.getByRole('button', { name: 'Finalise' }).click();
  const blocked = page.getByRole('dialog', { name: 'Fix 2 problems before finalising' });
  await expect(blocked).toContainText('A finalised quality check can’t be changed');
  await expect(blocked).toContainText('Row 1.a has no status.');
  await blocked.getByRole('button', { name: 'Close' }).click();

  // 1.a NOK, with a comment and the deviation's fields; 1.b OK from the keyboard.
  await status(page, '1.a', 'NOK').click();
  await expect(status(page, '1.a', 'NOK')).toHaveAttribute('aria-pressed', 'true');
  await card(page, '1.a')
    .getByLabel('Comment, row 1.a')
    .fill('Decal on the left tube turned inward');
  await card(page, '1.a').getByLabel('Severity, row 1.a').selectOption('major');
  await card(page, '1.a').getByLabel('Responsible, row 1.a').selectOption({ index: 1 });
  await expect(card(page, '1.a').getByRole('button', { name: /Add photo/ })).toBeVisible();
  await card(page, '1.b').focus();
  await page.keyboard.press('1');
  await expect(status(page, '1.b', 'OK')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('2 / 2 rows filled · 1 NOK')).toBeVisible();
  await expect(saveStatus(page)).toHaveText('Saved');

  await page.getByRole('button', { name: 'Finalise' }).click();
  await page
    .getByRole('dialog', { name: `Finalise ${number}?` })
    .getByRole('button', { name: 'Finalise' })
    .click();
  await expect(page.getByText('The quality check is locked')).toBeVisible();

  // Stored as a quality check, with its frozen copy of the check.
  const stored = InspectionSchema.parse(
    await (await page.request.get(`/api/inspections/${id}`)).json(),
  );
  expect(stored).toMatchObject({
    kind: 'quality',
    number,
    state: 'finalised',
    templateId: machine.check.id,
    front: {
      serialNumber: 'RM-E2E-016',
      participants: ['Sam Andersson'],
      machineName: 'Magellan#16',
    },
  });
  expect(stored.templateSnapshot.quality).toEqual({ name: 'Pre start up', department: 'Quality' });
  const [first] = stored.templateSnapshot.sections[0]!.items;
  expect(stored.results[first!.id]).toMatchObject({
    status: 'NOK',
    comment: 'Decal on the left tube turned inward',
    severity: 'major',
  });
  // Its deviation is recorded as a quality check's.
  await expect
    .poll(async () => (await deviationRows(id)).map((row) => [row.kind, row.finalised]))
    .toEqual([['quality', true]]);

  // After a reload: read-only cards.
  await page.reload();
  await expect(card(page, '1.a')).toContainText('NOK');
  await expect(card(page, '1.a')).toContainText('Decal on the left tube turned inward');
  await expect(page.getByRole('button', { name: 'Finalise' })).toHaveCount(0);
  // Inspectors never reopen.
  await expect(page.getByRole('button', { name: 'Reopen' })).toHaveCount(0);

  // Listed with the quality checks, never with the final inspections.
  await page.getByRole('main').getByRole('link', { name: 'Quality checks' }).click();
  await page.getByRole('searchbox', { name: 'Search quality checks' }).fill(number);
  const row = page.getByRole('row').filter({ hasText: number });
  await expect(row).toContainText('Magellan#16');
  await expect(row).toContainText(machine.model);
  await expect(row).toContainText(CHECK);
  await expect(row).toContainText('RM-E2E-016');
  await expect(row).toContainText('Finalised');
  await page.goto(`/inspections?q=${number}`);
  await expect(page.getByText('No inspections match')).toBeVisible();

  // Its address as an inspection leads to it, and so does its print address: the report.
  await page.goto(`/inspections/${id}`);
  await expect(page).toHaveURL(new RegExp(`/quality-checks/${id}$`));
  await page.goto(`/inspections/${id}/print`);
  await expect(page).toHaveURL(new RegExp(`/quality-checks/${id}/print$`));
  await expect(page.locator('[data-print-root]')).toHaveAttribute('data-print-mode', 'report');
});

test('an admin sees a quality check only under Quality checks in Insights and its report', async ({
  page,
  context,
  machine,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const final = await doneInspection(page.request, machine.template);
  const check = await doneCheck(page.request, machine.check, 'RM-E2E-777');

  // The API counts each kind apart.
  const insights = async (query: string) =>
    InsightsSchema.parse(await (await page.request.get(`/api/insights?${query}`)).json());
  const finals = await insights(`model=${machine.model}`);
  expect(finals.inspections.finalised).toBe(1);
  expect(finals.deviations).toBe(1);
  const checks = await insights(`kind=quality&model=${machine.model}`);
  expect(checks.inspections.finalised).toBe(1);
  expect(checks.deviations).toBe(1);
  expect(checks.checkNames).toContain(CHECK);

  // The page: final inspections first, its numbers without the quality check.
  await page.goto(`/insights?period=all&model=${machine.model}`);
  const tile = (label: string) =>
    page
      .locator('dl > div')
      .filter({ has: page.getByRole('term').getByText(label, { exact: true }) });
  await expect(tile('Inspections finalised')).toContainText('1');
  await expect(tile('Deviations per machine')).toContainText('1.0');

  // Switched to quality checks: their own numbers and words, and which check.
  const switcher = page.getByRole('group', { name: 'Show insights of' });
  await switcher.getByRole('button', { name: 'Quality checks' }).click();
  await expect(page).toHaveURL(/kind=quality/);
  await expect(switcher.getByRole('button', { name: 'Quality checks' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(tile('Quality checks finalised')).toContainText('1');
  await expect(tile('Deviations per check')).toContainText('1.0');
  await page.getByRole('combobox', { name: 'Quality check' }).selectOption(CHECK);
  await expect(page).toHaveURL(/check=Quality\+check/);
  await expect(page.getByRole('region', { name: 'Top 10 recurring checkpoints' })).toContainText(
    'Check and verify safety decals on balancing tubes.',
  );

  // The CSV: the quality check's rows, named so.
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    new RegExp(
      `^Quality check deviations start to \\d{4}-\\d\\d-\\d\\d, ${machine.model}, Pre start up\\.csv$`,
    ),
  );
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain(';machineName;checkName;');
  expect(csv).toContain(';Magellan#7;Quality check – Pre start up;');
  expect(csv).toContain(check.number);
  expect(csv).not.toContain(final.number);

  // The report, with its deviation list: the quality check's, never the final inspection's.
  await page.getByRole('button', { name: 'Preview report' }).click();
  const preview = page.getByRole('dialog', { name: 'Preview' });
  await expect(
    preview.getByRole('heading', { name: 'Quality check deviation report' }),
  ).toBeVisible();
  await preview.getByLabel('Include deviation list').check();
  await expect(preview.locator(`[data-inspection="${check.number}"]`)).toBeVisible();
  await expect(preview.locator(`[data-inspection="${final.number}"]`)).toHaveCount(0);
  await preview.getByRole('button', { name: 'Close' }).click();

  // Back to final inspections: their report lists the final inspection only.
  await switcher.getByRole('button', { name: 'Final inspections' }).click();
  await expect(page).not.toHaveURL(/kind=quality/);
  await expect(tile('Inspections finalised')).toContainText('1');
  await page.getByRole('button', { name: 'Preview report' }).click();
  await expect(
    preview.getByRole('heading', { name: 'Deviation report', exact: true }),
  ).toBeVisible();
  await preview.getByLabel('Include deviation list').check();
  await expect(preview.locator(`[data-inspection="${final.number}"]`)).toBeVisible();
  await expect(preview.locator(`[data-inspection="${check.number}"]`)).toHaveCount(0);
});

test('an admin reopens and deletes a quality check; an inspector cannot', async ({
  page,
  context,
  machine,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const check = await doneCheck(page.request, machine.check, 'RM-E2E-888');
  await page.goto(`/quality-checks/${check.id}`);
  await page.getByRole('button', { name: 'Reopen' }).click();
  await page
    .getByRole('dialog', { name: `Reopen ${check.number}?` })
    .getByRole('button', { name: 'Reopen' })
    .click();
  await expect(page.getByRole('button', { name: 'Finalise' })).toBeVisible();

  await page.getByRole('button', { name: 'Quality check actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete quality check' }).click();
  const confirm = page.getByRole('dialog', { name: `Delete ${check.number}?` });
  await confirm.getByRole('button', { name: 'Delete quality check' }).click();
  await expect(page).toHaveURL(/\/quality-checks$/);
  await expect(
    page.getByRole('status').filter({ hasText: `${check.number} was deleted.` }),
  ).toBeVisible();
  expect((await page.request.get(`/api/inspections/${check.id}`)).status()).toBe(404);
  expect(await deviationRows(check.id)).toEqual([]);

  // An inspector has no delete, and the API refuses it.
  const other = await doneCheck(page.request, machine.check, 'RM-E2E-889');
  await context.clearCookies();
  await signIn(context, INSPECTOR, ['inspector']);
  await page.goto(`/quality-checks/${other.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(other.number);
  await expect(page.getByRole('button', { name: 'Quality check actions' })).toHaveCount(0);
  const etag = (await page.request.get(`/api/inspections/${other.id}`)).headers()['etag']!;
  const refused = await page.request.delete(`/api/inspections/${other.id}`, {
    headers: { 'If-Match': etag },
  });
  expect(refused.status()).toBe(403);
});
