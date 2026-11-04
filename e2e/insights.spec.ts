import { readFile } from 'node:fs/promises';
import {
  InspectionSchema,
  type Inspection,
  type InspectionDraftInput,
  type Template,
} from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { createTemplate, deleteInspection, deleteTemplate } from './support/storage';

const ADMIN = 'anna.andersson@modig.se';
const INSPECTOR = 'sam.andersson@modig.se';

type Results = InspectionDraftInput['results'];

/**
 * Each test gets a published template of a model code of its own (two sections of three rows),
 * so the numbers on the dashboard, filtered to that model, are only this test's inspections. They
 * are deleted afterwards with their deviation rows.
 */
const test = base.extend<{
  model: string;
  published: Template;
  inspect: (request: APIRequestContext, results: Results, finalise: boolean) => Promise<Inspection>;
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  model: async ({}, use) => {
    const letters = Array.from({ length: 8 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    );
    await use(`E2E${letters.join('')}`);
  },
  published: async ({ model }, use, testInfo) => {
    const template = await createTemplate(
      `E2E insights – ${testInfo.title}`,
      true,
      undefined,
      model,
    );
    await use(template);
    await deleteTemplate(template.id);
  },
  inspect: async ({ published }, use) => {
    const ids: string[] = [];
    await use(async (request, results, finalise) => {
      const created = await request.post('/api/inspections', {
        data: {
          templateId: published.id,
          front: {
            machineName: 'RigiMill MG',
            serialNumber: `SN-${ids.length + 1}`,
            participants: [],
            location: 'Kalmar, Sweden',
            date: '2026-10-07',
          },
        },
      });
      expect(created.status()).toBe(201);
      const inspection = InspectionSchema.parse(await created.json());
      ids.push(inspection.id);
      const { modelCode: _model, ...front } = inspection.front;
      const saved = await request.put(`/api/inspections/${inspection.id}`, {
        headers: { 'If-Match': created.headers()['etag']! },
        data: { front, results, extraDeviations: [] },
      });
      expect(saved.status()).toBe(200);
      if (!finalise) return InspectionSchema.parse(await saved.json());
      const finalised = await request.post(`/api/inspections/${inspection.id}/finalise`, {
        headers: { 'If-Match': saved.headers()['etag']! },
      });
      expect(finalised.status()).toBe(200);
      return InspectionSchema.parse(await finalised.json());
    });
    await Promise.all(ids.map(deleteInspection));
  },
});

/** Row ids in checklist order: 1.a, 1.b, 1.c, 2.a, 2.b, 2.c. */
const rowIds = (template: Template) =>
  template.sections.flatMap((section) => section.items.map((item) => item.id));

/** Every row OK, except the ones given. */
function allOk(template: Template, except: Results = {}): Results {
  return { ...Object.fromEntries(rowIds(template).map((id) => [id, { status: 'OK' }])), ...except };
}

const tile = (page: Page, label: string) =>
  page
    .locator('dl > div')
    .filter({ has: page.getByRole('term').getByText(label, { exact: true }) });
const panel = (page: Page, title: string) => page.getByRole('region', { name: title });

test('an admin reads the KPIs of finalised inspections and exports their deviations', async ({
  page,
  context,
  model,
  published,
  inspect,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const [a1, , , b1, b2] = rowIds(published) as [string, string, string, string, string];
  const first = await inspect(
    page.request,
    allOk(published, {
      [a1]: {
        status: 'NOK',
        severity: 'major',
        resp: 'Mechanics',
        category: 'Markings & labels',
        comment: 'Blue mark missing',
      },
      [b2]: { status: 'NA' },
    }),
    true,
  );
  const second = await inspect(
    page.request,
    allOk(published, { [a1]: { status: 'NOK' }, [b1]: { status: 'NOK', severity: 'critical' } }),
    true,
  );
  await inspect(page.request, { [b2]: { status: 'NOK', resp: 'Electrical' } }, false);

  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/insights?period=all&model=${model}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Period' })).toHaveValue('all');
  await expect(page.getByRole('combobox', { name: 'Machine model' })).toHaveValue(model);

  // Two finalised inspections; the one in progress is left out.
  await expect(tile(page, 'Inspections finalised')).toContainText('2');
  await expect(tile(page, 'Deviations')).toContainText('3');
  await expect(tile(page, 'Deviations per machine')).toContainText('1.5');
  // 8 OK of 11 checked rows; the N/A row is not checked.
  await expect(tile(page, 'First-pass rate')).toContainText('72.7%');
  await expect(tile(page, 'First-pass rate')).toContainText('8 of 11 checked rows OK');

  const top = panel(page, 'Top 10 recurring checkpoints').getByRole('row');
  await expect(top).toHaveCount(3); // header and two checkpoints
  // Rank, checkpoint (ref and text, then its section), failed, share of the inspections. As shown
  // (inner text): the checkpoint cell also holds the numbers' line a phone shows instead.
  await expect(top.nth(1).getByRole('cell')).toHaveText(
    [
      '1',
      /^1\.a Lifting columns - Marked screws, blue\/red\/yellow\s*Loading area$/,
      '2',
      /^100%\s*of 2$/,
    ],
    { useInnerText: true },
  );
  await expect(top.nth(2).getByRole('cell')).toHaveText(
    ['2', /^2\.a Tool magazine - All pockets clean\s*Tool arena$/, '1', /^50%\s*of 2$/],
    { useInnerText: true },
  );

  // One month of data: no line to draw, but a single column with its count on the cap.
  const perMonth = panel(page, 'Deviations per month');
  await expect(perMonth.locator('.recharts-bar-rectangle')).toHaveCount(1);
  await expect(perMonth.locator('.recharts-line-dot')).toHaveCount(0);
  await expect(perMonth.locator('.recharts-label-list .recharts-label')).toHaveText(['3']);
  await expect(perMonth.getByRole('table')).toContainText('October 202632');
  const severity = panel(page, 'By severity');
  await expect(severity.getByRole('img')).toHaveAccessibleName(
    'Deviations by severity: Minor 1, Major 1, Critical 1',
  );
  await expect(panel(page, 'Per section').getByRole('listitem')).toHaveText([
    /^Loading area\s*2$/,
    /^Tool arena\s*1$/,
  ]);
  await expect(panel(page, 'By responsible').getByRole('listitem')).toHaveText([
    /^Mechanics\s*1$/,
    /^Not assigned\s*2$/,
  ]);
  await expect(panel(page, 'By category').getByRole('listitem')).toHaveText([
    /^Markings & labels\s*1$/,
    /^No category\s*2$/,
  ]);

  // In-progress inspections join in, and the choice is in the URL.
  await page.getByRole('checkbox', { name: 'Include inspections in progress' }).check();
  await expect(page).toHaveURL(/includeInProgress=true/);
  await expect(tile(page, 'Inspections')).toContainText('3');
  await expect(tile(page, 'Inspections')).toContainText('2 finalised · 1 in progress');
  await expect(tile(page, 'Deviations')).toContainText('4');

  // The CSV holds the same four rows, named after the filters.
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^Deviations start to \\d{4}-\\d{2}-\\d{2}, ${model}, incl\\. in progress\\.csv$`),
  );
  const csv = await readFile((await download.path())!, 'utf8');
  const lines = csv
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');
  expect(lines[0]).toMatch(/^inspectionId;inspectionNumber;serialNumber;machineName;modelCode;/);
  expect(lines).toHaveLength(5);
  expect(lines.filter((line) => line.includes(first.number))).toHaveLength(1);
  expect(lines.filter((line) => line.includes(second.number))).toHaveLength(2);
  expect(csv).toContain(';Blue mark missing;Mechanics;major;Markings & labels;2026-10-07;true;');

  // Recharts runs under the app's Content-Security-Policy without complaint.
  expect(errors).toEqual([]);
});

test('Insights is for admins only', async ({ page, context }) => {
  await signIn(context, INSPECTOR, ['inspector']);
  expect((await page.request.get('/api/insights')).status()).toBe(403);
  expect((await page.request.get('/api/insights/export.csv')).status()).toBe(403);
  await page.goto('/insights');
  await expect(page.getByRole('heading', { level: 1, name: 'Admins only' })).toBeVisible();
});

test('a custom range that ends before it starts says so instead of loading', async ({
  page,
  context,
  model,
  published,
  inspect,
}) => {
  await signIn(context, ADMIN, ['admin']);
  await inspect(page.request, allOk(published), true);
  await page.goto(`/insights?period=custom&from=2026-10-01&to=2026-12-31&model=${model}`);
  await expect(tile(page, 'Inspections finalised')).toContainText('1');
  await expect(tile(page, 'First-pass rate')).toContainText('100.0%');
  await expect(panel(page, 'Top 10 recurring checkpoints')).toContainText(
    'No checkpoint failed in this selection.',
  );

  const from = page.getByLabel('From', { exact: true });
  const to = page.getByLabel('To', { exact: true });
  await to.fill('2026-09-30');
  await expect(page.getByText('The start date is after the end date.')).toBeVisible();
  await expect(from).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/to=2026-09-30/);
  // Nothing is asked for meanwhile: the numbers are gone until the range makes sense again.
  await expect(tile(page, 'Inspections finalised')).toHaveCount(0);
  await from.fill('2026-09-01');
  await expect(
    page.getByRole('heading', { name: 'No inspections in this selection' }),
  ).toBeVisible();
  await expect(from).not.toHaveAttribute('aria-invalid');
});
