import {
  InspectionSchema,
  type Inspection,
  type InspectionDraftInput,
  type Template,
} from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { compact, footerTexts, MM, pageText, readPdf } from './support/pdf';
import { createTemplate, deleteInspection, deleteTemplate } from './support/storage';

/**
 * The Insights report (brief §5.5, printed): Preview report and Print report on the Insights
 * page, the print route with its deviation list, the PDF it prints, and the report of an empty
 * selection. As in insights.spec.ts, each test publishes a template of a model code of its own
 * (two sections of three rows) and filters by it, so only its own inspections count; they are
 * deleted afterwards with their deviation rows. That model is in no settings, so the report names
 * it by its code.
 */

const ADMIN = 'anna.andersson@modig.se';
const INSPECTOR = 'sam.andersson@modig.se';

type Results = InspectionDraftInput['results'];

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
      `E2E insights report – ${testInfo.title}`,
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
            machineName: 'Volvo Cars Skövde, line 2',
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

/**
 * Two finalised inspections (three deviations: 1.a twice, 2.a once) and one in progress (2.b),
 * as in insights.spec.ts. Returns the finalised two, oldest number first.
 */
async function inspectThree(
  request: APIRequestContext,
  published: Template,
  inspect: (request: APIRequestContext, results: Results, finalise: boolean) => Promise<Inspection>,
): Promise<[Inspection, Inspection]> {
  const [a1, , , b1, b2] = rowIds(published) as [string, string, string, string, string];
  const first = await inspect(
    request,
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
    request,
    allOk(published, { [a1]: { status: 'NOK' }, [b1]: { status: 'NOK', severity: 'critical' } }),
    true,
  );
  await inspect(request, { [b2]: { status: 'NOK', resp: 'Electrical' } }, false);
  return [first, second];
}

/** The print dialog is counted, not shown. */
async function countPrints(page: Page): Promise<void> {
  await page.context().addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = String(
        Number(document.documentElement.dataset.printed ?? 0) + 1,
      );
    };
  });
}

const section = (scope: Page | ReturnType<Page['locator']>, title: string) =>
  scope.getByRole('region', { name: title, exact: true });

test('an admin previews the report from Insights, adds the deviation list and prints it', async ({
  page,
  context,
  model,
  published,
  inspect,
}) => {
  await signIn(context, ADMIN, ['admin']);
  await countPrints(page);
  const [first, second] = await inspectThree(page.request, published, inspect);
  // The app in the dark theme: the report is light paper all the same.
  await page.emulateMedia({ colorScheme: 'dark' });

  await page.goto(`/insights?period=all&model=${model}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Insights' })).toBeVisible();
  const preview = page.getByRole('button', { name: 'Preview report' });
  await preview.click();
  const dialog = page.getByRole('dialog', { name: 'Preview' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(dialog).toContainText(`Deviation report · All time · ${model}`);
  const root = dialog.locator('[data-print-root]');
  await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(root.locator('.paper-sheet').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expect(root).toHaveCSS('color', 'rgb(0, 0, 0)');

  // What it covers, then the numbers the Insights page shows for the same filters.
  await expect(root.getByRole('heading', { level: 2, name: 'Deviation report' })).toBeVisible();
  await expect(root.locator('.report-facts dt')).toHaveText([
    'Period',
    'Model',
    'Inspections',
    'Generated',
  ]);
  await expect(root.locator('.report-facts dd')).toHaveText([
    'All time',
    model,
    'Finalised only',
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} by .+$/,
  ]);
  await expect(root.locator('.report-kpis dt')).toHaveText([
    'Inspections finalised',
    'Deviations',
    'Deviations per machine',
    'First-pass rate',
  ]);
  await expect(root.locator('.report-kpi-value')).toHaveText(['2', '3', '1.5', '72.7%']);
  await expect(root.locator('.report-kpi-detail').nth(3)).toHaveText(
    '8 of 11 checked rows OK (N/A not counted)',
  );
  const top = section(root, 'Top 10 recurring checkpoints').getByRole('row');
  await expect(top).toHaveCount(3); // the column labels and two checkpoints
  await expect(top.nth(1)).toHaveText(
    /^1\s*1\.a\s*Lifting columns - Marked screws, blue\/red\/yellow\s*Loading area\s*2\s*100% of 2$/,
  );
  await expect(top.nth(2)).toHaveText(
    /^2\s*2\.a\s*Tool magazine - All pockets clean\s*Tool arena\s*1\s*50% of 2$/,
  );
  // One month of data: a single column, its numbers in the table under it.
  const perMonth = section(root, 'Deviations per month');
  await expect(perMonth.locator('.report-chart-column')).toHaveCount(1);
  await expect(perMonth.locator('.report-months')).toContainText('2026-10');
  await expect(section(root, 'By severity').getByRole('row')).toHaveText([
    /^Severity/,
    /^Minor\s*1\s*33%$/,
    /^Major\s*1\s*33%$/,
    /^Critical\s*1\s*33%$/,
  ]);
  await expect(section(root, 'By responsible').getByRole('row')).toHaveText([
    /^Responsible/,
    /^Mechanics\s*1\s*33%$/,
    /^Not assigned\s*2\s*67%$/,
  ]);
  await expect(section(root, 'By category').getByRole('row')).toHaveText([
    /^Category/,
    /^Markings & labels\s*1\s*33%$/,
    /^No category\s*2\s*67%$/,
  ]);
  await expect(root.locator('[data-report-list]')).toHaveCount(0);

  // The deviation list joins it: each inspection's rows under its number.
  await dialog.getByRole('checkbox', { name: 'Include deviation list' }).check();
  const list = root.locator('[data-report-list]');
  await expect(list.getByRole('heading', { name: 'Deviation list' })).toBeVisible();
  await expect(root).toHaveAttribute('data-print-ready', 'true');
  await expect(list).toContainText('3 deviations in 2 inspections');
  // A table to an inspection, its line in the head (repeated on a page its rows carry on to); the
  // column labels head the first one only.
  const groups = list.locator('table[data-inspection]');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toHaveAttribute('data-inspection', first.number);
  await expect(groups.nth(1)).toHaveAttribute('data-inspection', second.number);
  await expect(groups.nth(0).getByRole('row')).toHaveText([
    /^Ref\s*Checkpoint and comment\s*Severity\s*Category\s*Responsible$/,
    new RegExp(`^${first.number} · 2026-10-07 · ${model}\\s*Volvo Cars Skövde, line 2 · S/N SN-1$`),
    /^1\.a\s*Lifting columns - Marked screws, blue\/red\/yellow\s*Blue mark missing\s*Major\s*Markings & labels\s*Mechanics$/,
  ]);
  await expect(groups.nth(1).getByRole('row')).toHaveText([
    new RegExp(`^${second.number} `),
    /^1\.a\s*Lifting columns.*Minor\s*—\s*—$/,
    /^2\.a\s*Tool magazine - All pockets clean\s*Critical\s*—\s*—$/,
  ]);

  // Escape closes it and hands the focus back.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(preview).toBeFocused();

  // Its Print / Save PDF prints the report as shown (list included) in a new tab.
  await preview.click();
  await dialog.getByRole('checkbox', { name: 'Include deviation list' }).check();
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    dialog.getByRole('button', { name: 'Print / Save PDF' }).click(),
  ]);
  await expect(dialog).toBeHidden();
  const printed = tab.locator('[data-print-root]');
  await expect(printed).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(printed.locator('[data-report-list]')).toBeVisible();
  await expect(tab.locator('html')).toHaveAttribute('data-printed', '1');
  // Printed once: the flag is dropped from the address, so a reload doesn't print again.
  await expect(tab).toHaveURL(
    new RegExp(`/insights/report\\?period=all&model=${model}&deviations=1$`),
  );
  await expect(tab).toHaveTitle(
    new RegExp(`^Deviation report start to \\d{4}-\\d{2}-\\d{2}, ${model}$`),
  );
  await expect(tab.getByRole('link', { name: 'Back to Insights' })).toHaveAttribute(
    'href',
    `/insights?period=all&model=${model}`,
  );

  // Print report prints it straight away, without the list unless it is asked for.
  const [direct] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: 'Print report' }).click(),
  ]);
  await expect(direct.locator('[data-print-root]')).toHaveAttribute('data-print-ready', 'true', {
    timeout: 30_000,
  });
  await expect(direct.locator('html')).toHaveAttribute('data-printed', '1');
  await expect(direct).toHaveURL(new RegExp(`/insights/report\\?period=all&model=${model}$`));
  await expect(direct.locator('[data-report-list]')).toHaveCount(0);
});

test('the report prints as A4 pages with its footer, the list on pages of its own', async ({
  page,
  context,
  model,
  published,
  inspect,
}) => {
  await signIn(context, ADMIN, ['admin']);
  const [first, second] = await inspectThree(page.request, published, inspect);
  await page.goto(`/insights/report?period=all&model=${model}&includeInProgress=true&deviations=1`);
  const root = page.locator('[data-print-root]');
  await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(page.getByRole('checkbox', { name: 'Include deviation list' })).toBeChecked();
  await expect(root.locator('.report-facts dd').nth(2)).toHaveText('Finalised and in progress');
  // The inspection in progress is in the list, and says so.
  const groups = root.locator('[data-report-list] table[data-inspection]');
  await expect(groups).toHaveCount(3);
  await expect(groups.nth(2)).toContainText('In progress');

  const pdf = await page.pdf({
    path: test.info().outputPath('insights-report.pdf'),
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
  });
  const pages = await readPdf(pdf);
  expect(pages.length).toBeGreaterThanOrEqual(3);
  expect(pages.length).toBeLessThanOrEqual(6);

  const footer = `Deviation report · All time · ${model} · incl. in progress`;
  for (const sheet of pages) {
    const where = `page ${sheet.number} of ${pages.length}`;
    expect([Math.round(sheet.width), Math.round(sheet.height)], where).toEqual([595, 842]);
    expect(
      footerTexts(sheet)
        .map((text) => text.text)
        .sort(),
      where,
    ).toEqual([footer, `Page ${sheet.number} of ${pages.length}`].sort());
    // Nothing runs past the right margin (12 mm).
    const rightEdge = sheet.width - 12 * MM;
    expect(
      sheet.texts
        .filter((text) => text.right > rightEdge)
        .map((text) => `${text.text} ends at ${(text.right / MM).toFixed(2)} mm`),
      where,
    ).toEqual([]);
  }

  // Page 1: the title, what it covers and the headline numbers.
  expect(pages[0]!.texts.find((text) => text.text === 'Deviation report')?.size).toBeCloseTo(22);
  expect(pageText(pages[0]!)).toContain(compact('Finalised and in progress'));
  expect(pageText(pages[0]!)).toContain(compact('Headline numbers'));
  // Every part once, in order, its heading on the same page as what follows it.
  const report = pages.slice(0, -1).map(pageText).join('');
  const headings = [
    'Headline numbers',
    'Deviations per month',
    'By severity',
    'Top 10 recurring checkpoints',
    'Per section',
    'Per model',
    'By responsible',
    'By category',
  ].map(compact);
  const at = headings.map((heading) => report.indexOf(heading));
  expect(at.every((index) => index >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  for (const sheet of pages) {
    const last = sheet.texts.filter((text) => text.y < sheet.height - 16 * MM).at(-1);
    expect(headings, `page ${sheet.number} ends on a heading`).not.toContain(
      compact(last?.text ?? ''),
    );
  }

  // The list starts a page of its own, after everything else, and names each inspection.
  const listPage = pages.findIndex((sheet) =>
    sheet.texts.some((text) => text.text === 'Deviation list' && text.size > 12),
  );
  expect(listPage).toBe(pages.length - 1);
  // Its heading first (the footer's margin boxes are painted before the page).
  const body = pages[listPage]!.texts.filter((text) => text.y < pages[listPage]!.height - 16 * MM);
  expect(body[0]?.text).toBe('Deviation list');
  const list = pageText(pages[listPage]!);
  expect(list).not.toContain(compact('By category'));
  expect(list).toContain(compact('4 deviations in 3 inspections'));
  expect(list).toContain(compact(first.number));
  expect(list).toContain(compact(second.number));
  expect(list).toContain(compact('Blue mark missing'));
  // In capitals on paper (CSS), which the PDF's text may keep.
  expect(list.toLowerCase()).toContain('inprogress');
});

test('a single month is stated as the month; an empty selection says so', async ({
  page,
  context,
  model,
  published,
  inspect,
}) => {
  await signIn(context, ADMIN, ['admin']);
  await inspectThree(page.request, published, inspect);

  await page.goto(`/insights/report?period=custom&from=2026-10-01&to=2026-10-31&model=${model}`);
  const root = page.locator('[data-print-root]');
  await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(root.locator('.report-facts dd').first()).toHaveText('2026-10');
  await expect(page).toHaveTitle(`Deviation report 2026-10, ${model}`);
  await expect(root.locator('.report-kpi-value').first()).toHaveText('2');

  // September: no inspection matches, so no tables and nothing to list.
  await page.goto(`/insights/report?period=custom&from=2026-09-01&to=2026-09-30&model=${model}`);
  await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(
    root.getByRole('heading', { name: 'No inspections match these filters' }),
  ).toBeVisible();
  await expect(root.locator('.report-facts dd').first()).toHaveText('2026-09');
  await expect(root.locator('.report-kpis')).toHaveCount(0);
  await expect(root.locator('table')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Include deviation list' })).toBeDisabled();
  await expect(page.getByText('No deviations in this selection')).toBeVisible();

  // Filters that can't be used say why instead of printing.
  await page.goto(`/insights/report?period=custom&from=2026-10-31&to=2026-10-01&model=${model}`);
  await expect(page.getByRole('heading', { name: 'These filters can’t be printed' })).toBeVisible();
  await expect(page.getByText('The start date is after the end date.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to Insights' })).toHaveAttribute(
    'href',
    `/insights?period=custom&from=2026-10-31&to=2026-10-01&model=${model}`,
  );
});

test('the report is for admins only', async ({ page, context }) => {
  await signIn(context, INSPECTOR, ['inspector']);
  expect((await page.request.get('/api/insights/deviations')).status()).toBe(403);
  await page.goto('/insights/report?period=all');
  await expect(page.getByRole('heading', { level: 1, name: 'Admins only' })).toBeVisible();
  await expect(page.locator('[data-print-root]')).toHaveCount(0);
});
