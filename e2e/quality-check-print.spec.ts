/**
 * Printing a quality check done on a machine, for the copy kept at the machine and signed there:
 * Preview and Print / Save PDF on its page, the entire report or only the deviations (each card
 * with room to note the action taken and sign it off), the print address of its own, A4 pages
 * with the quality check's footer, and no Word export. Each test has a throwaway machine and
 * quality check (as in quality-check-inspections.spec.ts); everything done with them is deleted
 * afterwards.
 */
import {
  InspectionSchema,
  type ExtraDeviation,
  type Inspection,
  type InspectionDraftInput,
  type RowResult,
  type Template,
} from '@modig/shared';
import {
  expect,
  test as base,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { signIn } from './support/auth';
import { footerTexts, MM, pageText, readPdf, type PdfPage } from './support/pdf';
import { testPhoto, uploadPhoto } from './support/photos';
import {
  createQualityCheck,
  createTemplate,
  deleteInspectionsOf,
  deleteQualityChecks,
  deleteTemplate,
} from './support/storage';

const INSPECTOR = 'sam.andersson@modig.se';
const CHECK = 'Quality check – Pre start up';
/** The machine's ID in the ERP, kept where a final inspection keeps its machine. */
const MACHINE_ID = 'Magellan#2';

/**
 * A throwaway machine of a model code of its own (not in the settings, so its name is its code):
 * a published final inspection template and its published "Quality check – Pre start up" (one
 * section, rows 1.a and 1.b). Everything done with them in a test goes with them afterwards.
 */
const test = base.extend<{ machine: { model: string; template: Template; check: Template } }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  machine: async ({}, use, testInfo) => {
    const letters = Array.from({ length: 6 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    );
    const model = `QCP${letters.join('')}`;
    const template = await createTemplate(
      `E2E QC print – ${testInfo.title}`,
      true,
      undefined,
      model,
    );
    const check = await createQualityCheck(template, true);
    await use({ model, template, check });
    await deleteInspectionsOf([template.id, check.id]);
    await deleteQualityChecks(template.id);
    await deleteTemplate(template.id);
  },
});

/**
 * A quality check of `check` through the API, as an inspector does it: 1.a NOK with its comment,
 * severity, responsible and a photo (when given), 1.b OK, and `extras`; finalised.
 */
async function doneCheck(
  request: APIRequestContext,
  check: Template,
  {
    serialNumber,
    nok = true,
    photoId,
    extras = [],
  }: { serialNumber: string; nok?: boolean; photoId?: string; extras?: ExtraDeviation[] },
): Promise<Inspection> {
  const front = {
    machineName: MACHINE_ID,
    serialNumber,
    participants: ['Sam Andersson', 'Erik Lund'],
    date: '2026-11-06',
  };
  const created = await request.post('/api/inspections', {
    data: { templateId: check.id, front },
  });
  expect(created.status()).toBe(201);
  const inspection = InspectionSchema.parse(await created.json());
  const [first, second] = inspection.templateSnapshot.sections[0]!.items;
  const firstResult: RowResult = nok
    ? {
        status: 'NOK',
        comment: 'Decal on the left tube turned inward',
        severity: 'major',
        resp: 'Assembly',
        ...(photoId && {
          photos: [{ imageId: photoId, caption: 'Left tube', annotations: [] }],
        }),
      }
    : { status: 'OK' };
  const { modelCode: _model, ...stored } = inspection.front;
  const draft: InspectionDraftInput = {
    front: { ...stored, machineName: MACHINE_ID },
    results: { [first!.id]: firstResult, [second!.id]: { status: 'OK' } },
    extraDeviations: extras,
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

const EXTRA: ExtraDeviation = {
  id: 'E2eQcPrintExtra1',
  description: 'Scratch on the guard door window',
  comment: 'About 5 cm, at eye height.',
  severity: 'minor',
  resp: 'Purchasing',
};

/** A photo of the decal, uploaded as the app does. */
async function decalPhoto(page: Page): Promise<string> {
  const jpeg = await testPhoto(page.context().browser()!, {
    width: 800,
    height: 600,
    label: 'Decal',
  });
  return uploadPhoto(page.request, jpeg);
}

/** Waits until the printout says everything is in (data, images, fonts). */
async function expectReady(root: Locator): Promise<void> {
  // A cold load through the dev server, with photos: allow more than the default 10 s.
  await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
}

/** The footer bottom left of every page of a quality check's printout. */
const footerOf = (inspection: Inspection, model: string) =>
  `${inspection.number} · ${CHECK} · ${MACHINE_ID} · ${model} · S/N ${inspection.front.serialNumber}`;

/** Prints the page as Chrome's "Save as PDF" would, kept in the test's output folder. */
async function printPdf(page: Page, name: string): Promise<PdfPage[]> {
  await expectReady(page.locator('[data-print-root]'));
  const pdf = await page.pdf({
    path: test.info().outputPath(`${name}.pdf`),
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
  });
  return readPdf(pdf);
}

/** Every page A4, with the quality check's footer and "Page X of Y" in the bottom margin. */
function expectPages(pages: PdfPage[], footer: string): void {
  for (const page of pages) {
    const where = `page ${page.number} of ${pages.length}`;
    expect([Math.round(page.width), Math.round(page.height)], where).toEqual([595, 842]);
    expect(
      footerTexts(page)
        .map((text) => text.text)
        .sort(),
      where,
    ).toEqual([footer, `Page ${page.number} of ${pages.length}`].sort());
    const past = page.texts.filter((text) => text.right > page.width - 12 * MM);
    expect(
      past.map((text) => text.text),
      where,
    ).toEqual([]);
  }
}

const compact = (text: string) => text.replace(/\s+/g, '');

test.beforeEach(({ context }) => signIn(context, INSPECTOR, ['inspector']));

test('Preview shows the entire report, and Only deviations the cards with their sign-off', async ({
  page,
  machine,
}) => {
  const photoId = await decalPhoto(page);
  const check = await doneCheck(page.request, machine.check, {
    serialNumber: 'RM-E2E-P01',
    photoId,
    extras: [EXTRA],
  });
  await page.goto(`/quality-checks/${check.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(check.number);

  // Preview and Print / Save PDF, as on a final inspection.
  const previewButton = page.getByRole('button', { name: 'Preview', exact: true });
  await expect(page.getByRole('button', { name: 'Print / Save PDF' })).toBeVisible();
  await previewButton.click();
  const dialog = page.getByRole('dialog', { name: 'Preview' });
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  const root = dialog.locator('[data-print-root]');
  await expectReady(root);

  // The entire report first: the front page, the checklist and the cards.
  await expect(root).toHaveAttribute('data-print-mode', 'report');
  await expect(dialog.getByRole('button', { name: 'Entire report' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const front = root.locator('.paper-qc-front');
  await expect(front.getByRole('heading', { name: CHECK })).toBeVisible();
  await expect(front).toContainText(check.number);
  await expect(front).toContainText('Finalised');
  const fields = front.locator('.paper-fields');
  for (const [label, value] of [
    ['Machine ID', MACHINE_ID],
    ['Machine model', machine.model],
    ['Serial number', 'RM-E2E-P01'],
    ['Date', '2026-11-06'],
    ['Checked by', 'Sam Andersson, Erik Lund'],
    ['Department', 'Quality'],
  ]) {
    await expect(fields.locator('div').filter({ hasText: label })).toContainText(value!);
  }
  // Document control is the app's: the revision, never a typed document number.
  await expect(front).toContainText('Rev: 1');
  await expect(front).not.toContainText('Document no.');
  // The result in numbers, and lines to sign the check and its close-out.
  await expect(front.locator('[data-count="NOK"]')).toContainText('1');
  await expect(front.locator('[data-count="Deviations"]')).toContainText('2');
  await expect(front).toContainText('Deviations closed / approved by');

  // The checklist: what, how, references and the result; a NOK row points to its card.
  const row = root.locator('[data-row-ref="1.a"]');
  await expect(row).toContainText('Check and verify safety decals on balancing tubes.');
  await expect(row).toContainText('Should be visible and not turned inward.');
  await expect(row).toContainText('ISO 12100 · ISO 7010');
  await expect(row).toContainText('NOK');
  await expect(row).toContainText('D-01 · Major');
  await expect(root.locator('[data-row-ref="1.b"]')).toContainText('OK');

  // A card per deviation, the extra one too, each to be signed off at the machine.
  const cards = root.locator('[data-deviation-card]');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Decal on the left tube turned inward');
  await expect(cards.nth(0).locator('img')).toHaveCount(1);
  await expect(cards.nth(1)).toContainText('Scratch on the guard door window');
  for (const card of await cards.all()) {
    await expect(card).toContainText('Action taken');
    await expect(card).toContainText('Closed on');
    await expect(card).toContainText('Signature');
  }
  // No Word export for a quality check.
  await expect(dialog.getByRole('button', { name: /Word/ })).toHaveCount(0);

  // Only deviations: the short header, the cards and one sign-off for all of them.
  await dialog.getByRole('button', { name: 'Only deviations' }).click();
  await expect(root).toHaveAttribute('data-print-mode', 'deviations');
  await expectReady(root);
  await expect(root.locator('.paper-qc-front')).toHaveCount(0);
  await expect(root.locator('[data-row-ref]')).toHaveCount(0);
  const header = root.locator('.paper-qc-lead');
  await expect(header).toContainText(CHECK);
  await expect(header).toContainText(check.number);
  await expect(header).toContainText(MACHINE_ID);
  await expect(header).toContainText('RM-E2E-P01');
  await expect(header.locator('div').filter({ hasText: 'Deviations' })).toContainText('2');
  await expect(cards).toHaveCount(2);
  await expect(root.locator('.paper-qc-closing')).toContainText('All deviations closed');

  // 4 per page: both cards on the first page, under the header.
  await dialog.getByRole('button', { name: '4 per page' }).click();
  await expect(root.locator('.paper-deviations')).toHaveAttribute('data-deviations-per-page', '4');
  await expectReady(root);
  await expect(root.locator('.paper-card-page')).toHaveCount(1);

  // Escape closes it and hands the focus back to Preview.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(previewButton).toBeFocused();
});

test('the print page prints the entire report and only the deviations, without Word', async ({
  page,
  machine,
}) => {
  const photoId = await decalPhoto(page);
  const check = await doneCheck(page.request, machine.check, {
    serialNumber: 'RM-E2E-P02',
    photoId,
    extras: [EXTRA],
  });
  const footer = footerOf(check, machine.model);

  // Its address as an inspection's print leads to its own, with the same choices.
  await page.goto(`/inspections/${check.id}/print?mode=report`);
  await expect(page).toHaveURL(new RegExp(`/quality-checks/${check.id}/print\\?mode=report$`));
  const root = page.locator('[data-print-root]');
  await expectReady(root);
  await expect(page.getByRole('link', { name: 'Back to the quality check' })).toHaveAttribute(
    'href',
    `/quality-checks/${check.id}`,
  );
  await expect(page.locator('header').first()).toContainText('Rev 1');
  const what = page.getByRole('group', { name: 'What to print' });
  await expect(what.getByRole('button', { name: 'Entire report' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: /Word/ })).toHaveCount(0);
  await expect(page.getByLabel('Include reference images')).toHaveCount(0);

  // The entire report: front page, checklist, then the deviations on pages of their own.
  const report = await printPdf(page, 'quality-check-report');
  expectPages(report, footer);
  expect(report.length).toBeGreaterThanOrEqual(3);
  const first = pageText(report[0]!);
  for (const text of [CHECK, check.number, 'Machine ID', MACHINE_ID, 'Sign-off', 'Rev: 1']) {
    expect(first).toContain(compact(text));
  }
  expect(pageText(report[1]!)).toContain('Checklist');
  expect(pageText(report[1]!)).toContain(compact('D-01 · Major'));
  const deviationPages = report.filter((pdfPage) =>
    pdfPage.texts.some((text) => text.text === 'Deviations' && text.size > 12),
  );
  expect(deviationPages.length).toBeGreaterThan(0);
  const deviationsText = deviationPages.map(pageText).join('');
  for (const text of ['D-01', 'D-02', 'Action taken', 'Closed on', 'Signature']) {
    expect(deviationsText).toContain(compact(text));
  }
  // The photo is printed with its card.
  expect(deviationPages.reduce((sum, pdfPage) => sum + pdfPage.images, 0)).toBeGreaterThan(0);

  // Only the deviations: kept in the address; the header and cards from the first page on.
  await what.getByRole('button', { name: 'Only deviations' }).click();
  await expect(page).toHaveURL(/mode=deviations/);
  await expect(root).toHaveAttribute('data-print-mode', 'deviations');
  const deviations = await printPdf(page, 'quality-check-deviations');
  expectPages(deviations, footer);
  expect(deviations.length).toBeLessThan(report.length);
  const onFirst = pageText(deviations[0]!);
  expect(onFirst).toContain(compact(CHECK));
  expect(onFirst).toContain(compact(MACHINE_ID));
  expect(onFirst).toContain('D-01');
  expect(onFirst).not.toContain('Sign-off');
  expect(deviations.map(pageText).join('')).not.toContain('Checklist');
  expect(pageText(deviations.at(-1)!)).toContain(compact('All deviations closed'));

  // The layout too.
  await page.getByRole('button', { name: '4 per page' }).click();
  await expect(page).toHaveURL(/deviationsPerPage=4/);
  await expect(page).toHaveURL(/mode=deviations/);
});

test('Print / Save PDF saves and prints the entire report or only the deviations', async ({
  page,
  context,
  machine,
}) => {
  // The print tab's window.print() is counted, not shown.
  await context.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = String(
        Number(document.documentElement.dataset.printed ?? 0) + 1,
      );
    };
  });
  const check = await doneCheck(page.request, machine.check, { serialNumber: 'RM-E2E-P03' });
  await page.goto(`/quality-checks/${check.id}`);

  await page.getByRole('button', { name: 'Print / Save PDF' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Entire report', 'Only deviations']);
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('menuitem', { name: 'Only deviations' }).click(),
  ]);
  await expect(tab).toHaveURL(new RegExp(`/quality-checks/${check.id}/print\\?mode=deviations`));
  const printed = tab.locator('[data-print-root]');
  await expectReady(printed);
  await expect(printed).toHaveAttribute('data-print-mode', 'deviations');
  await expect(tab.locator('html')).toHaveAttribute('data-printed', '1');
  // Printed once: the flag is gone from the address, so a reload doesn't print again.
  await expect(tab).not.toHaveURL(/autoprint/);
});

test('a deviation closed in the deviation log prints how it was closed', async ({
  page,
  machine,
}) => {
  const check = await doneCheck(page.request, machine.check, {
    serialNumber: 'RM-E2E-P05',
    extras: [EXTRA],
  });
  const key = check.templateSnapshot.sections[0]!.items[0]!.id;
  const closed = await page.request.put(`/api/inspections/${check.id}/follow-ups/${key}`, {
    data: { status: 'closed', action: 'New decal, turned outward', closedOn: '2026-11-06' },
  });
  expect(closed.status()).toBe(200);

  await page.goto(`/quality-checks/${check.id}/print?mode=deviations`);
  const root = page.locator('[data-print-root]');
  await expectReady(root);
  // The header says what is left; the closed card has its closing instead of empty lines.
  await expect(root.locator('.paper-qc-lead')).toContainText('2 · 1 open');
  const d1 = root.locator('[data-deviation-card="D-01"]');
  await expect(d1.locator('.paper-card-status')).toHaveText('Closed');
  await expect(d1.locator('[data-closed]')).toContainText('New decal, turned outward');
  await expect(d1.locator('[data-closed]')).toContainText('2026-11-06');
  await expect(d1).not.toContainText('Signature');
  // The open one still has its lines to fill in at the machine.
  const d2 = root.locator('[data-deviation-card="D-02"]');
  await expect(d2.locator('.paper-card-status')).toHaveCount(0);
  await expect(d2).toContainText('Signature');
});

test('a quality check without deviations says so', async ({ page, machine }) => {
  const check = await doneCheck(page.request, machine.check, {
    serialNumber: 'RM-E2E-P04',
    nok: false,
  });
  await page.goto(`/quality-checks/${check.id}/print?mode=deviations`);
  const root = page.locator('[data-print-root]');
  await expectReady(root);
  await expect(root.locator('.paper-qc-lead')).toContainText(check.number);
  await expect(root).toContainText('No deviations recorded.');
  await expect(root.locator('[data-deviation-card]')).toHaveCount(0);
  // Nothing to close.
  await expect(root.locator('.paper-qc-closing')).toHaveCount(0);

  await page
    .getByRole('group', { name: 'What to print' })
    .getByRole('button', {
      name: 'Entire report',
    })
    .click();
  await expectReady(root);
  await expect(root.locator('[data-count="Deviations"]')).toContainText('0');
  await expect(root).toContainText('No deviations recorded.');
});
