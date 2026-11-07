/**
 * The deviation log: Deviations under Final inspection and under Quality check in the sidebar,
 * each kind's deviations in its own log, grouped by machine; closing one with what was done (from
 * the log or from the inspection's Deviations tab), seeing it closed in both, reopening it, and
 * the log as a CSV file.
 */
import { readFile } from 'node:fs/promises';
import {
  FollowUpsSchema,
  InspectionSchema,
  type Inspection,
  type InspectionDraftInput,
  type Template,
} from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { pageText, readPdf } from './support/pdf';
import { testPhoto, uploadPhoto } from './support/photos';
import {
  createQualityCheck,
  createTemplate,
  deleteInspectionsOf,
  deleteQualityChecks,
  deleteTemplate,
  storedFollowUps,
} from './support/storage';

const INSPECTOR = 'sam.andersson@modig.se';
const CHECK = 'Quality check – Pre start up';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A throwaway machine of a model code of its own: a published final inspection template and its
 * published "Quality check – Pre start up", and a Machine ID no other test uses, which the log is
 * searched by. Everything done with them goes with them afterwards (follow-ups included).
 */
const test = base.extend<{
  machine: { model: string; id: string; template: Template; check: Template };
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  machine: async ({}, use, testInfo) => {
    const letters = Array.from({ length: 6 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    );
    const model = `LOG${letters.join('')}`;
    const template = await createTemplate(`E2E log – ${testInfo.title}`, true, undefined, model);
    const check = await createQualityCheck(template, true);
    await use({ model, id: `Magellan#${letters.join('')}`, template, check });
    await deleteInspectionsOf([template.id, check.id]);
    await deleteQualityChecks(template.id);
    await deleteTemplate(template.id);
  },
});

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const navGroup = (page: Page, label: string) => mainNav(page).getByRole('list', { name: label });
/** A machine's card in the log, by its Machine ID. */
const machineCard = (page: Page, machineId: string) =>
  page.getByRole('region', { name: new RegExp(`^${machineId} S/N`) });
/** A summary tile's number. */
const tile = (page: Page, label: string) =>
  page
    .locator('dl > div')
    .filter({ has: page.getByRole('term').getByText(label, { exact: true }) })
    .getByRole('definition')
    .first();

/**
 * Starts an inspection of `template` (a final inspection, or a quality check of one) through the
 * API and saves its first row NOK with a comment, the rest OK; finalised when asked.
 */
async function withDeviation(
  request: APIRequestContext,
  template: Template,
  machineName: string,
  { finalise = false }: { finalise?: boolean } = {},
): Promise<{ inspection: Inspection; etag: string }> {
  const front =
    template.kind === 'quality'
      ? { machineName, serialNumber: 'RM-LOG-016', participants: [], date: '2026-10-07' }
      : {
          machineName,
          serialNumber: 'SN-LOG-1',
          participants: [],
          location: 'Kalmar, Sweden',
          date: '2026-10-07',
        };
  const created = await request.post('/api/inspections', {
    data: { templateId: template.id, front },
  });
  expect(created.status()).toBe(201);
  const inspection = InspectionSchema.parse(await created.json());
  const ids = inspection.templateSnapshot.sections.flatMap((section) =>
    section.items.map((item) => item.id),
  );
  const { modelCode: _model, ...draftFront } = inspection.front;
  const draft: InspectionDraftInput = {
    front: draftFront,
    results: Object.fromEntries(
      ids.map((id, index) => [
        id,
        index === 0
          ? { status: 'NOK', comment: 'Decal turned inward', resp: 'Mechanical' }
          : { status: 'OK' },
      ]),
    ),
    extraDeviations: [],
  };
  const saved = await request.put(`/api/inspections/${inspection.id}`, {
    headers: { 'If-Match': created.headers()['etag']! },
    data: draft,
  });
  expect(saved.status()).toBe(200);
  let response = saved;
  if (finalise) {
    response = await request.post(`/api/inspections/${inspection.id}/finalise`, {
      headers: { 'If-Match': saved.headers()['etag']! },
    });
    expect(response.status()).toBe(200);
  }
  return {
    inspection: InspectionSchema.parse(await response.json()),
    etag: response.headers()['etag']!,
  };
}

test('the sidebar has Deviations under Final inspection and Quality check, for everyone', async ({
  page,
  context,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  await page.goto('/deviations');
  await expect(page).toHaveURL(/\/deviations\/final$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Final inspection deviations' }),
  ).toBeVisible();
  const finalLink = navGroup(page, 'Final inspection').getByRole('link', { name: 'Deviations' });
  const qualityLink = navGroup(page, 'Quality check').getByRole('link', { name: 'Deviations' });
  await expect(navGroup(page, 'Final inspection').getByRole('link')).toHaveText([
    'Inspections',
    'Deviations',
  ]);
  await expect(navGroup(page, 'Quality check').getByRole('link')).toHaveText([
    'Quality checks',
    'Deviations',
  ]);
  await expect(finalLink).toHaveAttribute('aria-current', 'page');
  await expect(qualityLink).not.toHaveAttribute('aria-current');

  await qualityLink.click();
  await expect(page).toHaveURL(/\/deviations\/quality$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Quality check deviations' }),
  ).toBeVisible();
  await expect(qualityLink).toHaveAttribute('aria-current', 'page');
  await expect(finalLink).not.toHaveAttribute('aria-current');
});

test('an inspector closes a quality check’s deviation from its log, sees it on the Deviations tab and reopens it', async ({
  page,
  context,
  machine,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  // A quality check and a final inspection of the same machine, each with a deviation.
  const { inspection: check, etag } = await withDeviation(page.request, machine.check, machine.id);
  const { inspection: final } = await withDeviation(page.request, machine.template, machine.id);
  const id = `${check.number} · D-01`;
  const search = `?q=${encodeURIComponent(machine.id)}`;

  // Each in its own log only.
  await page.goto(`/deviations/final${search}`);
  await expect(machineCard(page, machine.id)).toContainText(`${final.number} · D-01`);
  await expect(page.getByText(check.number)).toHaveCount(0);

  await page.goto(`/deviations/quality${search}`);
  const card = machineCard(page, machine.id);
  await expect(card).toContainText(id);
  await expect(page.getByText(final.number)).toHaveCount(0);
  // The machine: its Machine ID and serial number, the quality check, the model, the check's
  // number and that it is in progress; one open, none closed.
  await expect(card.getByRole('heading', { level: 2 })).toHaveText(`${machine.id} S/N RM-LOG-016`);
  await expect(card).toContainText(CHECK);
  await expect(card).toContainText(machine.model);
  await expect(card.getByRole('link', { name: check.number, exact: true })).toHaveAttribute(
    'href',
    `/quality-checks/${check.id}?tab=deviations`,
  );
  await expect(card).toContainText('In progress');
  await expect(card).toContainText('1 open · 0 closed');
  await expect(card).toContainText('1.a Check and verify safety decals on balancing tubes.');
  await expect(card).toContainText('Decal turned inward');
  await expect(card).toContainText('Mechanical');
  await expect(tile(page, 'Open')).toHaveText('1');
  await expect(tile(page, 'Closed')).toHaveText('0');
  await expect(
    page.getByRole('list', { name: 'Open by responsible' }).getByRole('button'),
  ).toHaveText(['Mechanical1']);

  // Close it with what was done: today and the inspector to start with.
  await card.getByRole('button', { name: `Close… ${id}` }).click();
  const dialog = page.getByRole('dialog', { name: `Close ${id}` });
  await expect(dialog).toContainText('1.a Check and verify safety decals on balancing tubes.');
  await expect(dialog.getByLabel('Closed on')).toHaveValue(DATE);
  await expect(dialog.getByLabel('Closed by')).toHaveValue('Sam Andersson');
  await dialog.getByLabel('Action taken').fill('Decal turned outward and glued');
  await dialog.getByRole('button', { name: 'Close deviation' }).click();
  await expect(dialog).toBeHidden();

  // It leaves the open ones, and says where it went.
  await expect(page.getByRole('status').filter({ hasText: `${id} is closed.` })).toContainText(
    'It is listed under Closed.',
  );
  await expect(page.getByRole('heading', { name: 'Nothing open' })).toBeVisible();
  await expect(tile(page, 'Open')).toHaveText('0');
  await expect(tile(page, 'Closed')).toHaveText('1');
  // Stored with the follow-up, never in the inspection: its version is the same.
  expect((await page.request.get(`/api/inspections/${check.id}`)).headers()['etag']).toBe(etag);

  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Closed' }).click();
  await expect(page).toHaveURL(/status=closed/);
  await expect(card).toContainText('0 open · 1 closed');
  await expect(card).toContainText('Closed');
  await expect(card).toContainText('Action: Decal turned outward and glued');
  await expect(card).toContainText('Sam Andersson');

  // Its ID leads to it on the quality check's Deviations tab, closed there too.
  await card.getByRole('link', { name: id }).click();
  await expect(page).toHaveURL(
    new RegExp(`/quality-checks/${check.id}\\?tab=deviations&deviation=[A-Za-z0-9]+$`),
  );
  await expect(page.getByRole('tab', { name: /^Deviations/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const deviation = page.locator('article[data-deviation="D-01"]');
  await expect(deviation).toBeFocused();
  await expect(deviation).toContainText('Closed');
  await expect(deviation).toContainText(/Closed \d{4}-\d{2}-\d{2} by Sam Andersson/);
  await expect(deviation).toContainText('Action: Decal turned outward and glued');

  // Reopened there (it asks first): open in the log again, what was done kept.
  await deviation.getByRole('button', { name: `Reopen… ${id}` }).click();
  const confirm = page.getByRole('dialog', { name: `Reopen ${id}?` });
  await confirm.getByRole('button', { name: 'Reopen' }).click();
  await expect(deviation.getByRole('button', { name: `Close… ${id}` })).toBeVisible();
  await expect(deviation).toContainText('Open');
  await expect
    .poll(async () => {
      const stored = FollowUpsSchema.parse(await storedFollowUps(check.id));
      return Object.values(stored.followUps).map(({ status, action, closedOn }) => ({
        status,
        action,
        closedOn,
      }));
    })
    .toEqual([{ status: 'open', action: 'Decal turned outward and glued', closedOn: '' }]);

  await page.goto(`/deviations/quality${search}`);
  await expect(card).toContainText('1 open · 0 closed');
  await expect(card.getByRole('button', { name: `Close… ${id}` })).toBeVisible();
});

test('a deviation just marked is closed from the inspection’s Deviations tab, and the log exports as CSV', async ({
  page,
  context,
  machine,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const { inspection } = await withDeviation(page.request, machine.template, machine.id);
  await page.goto(`/inspections/${inspection.id}`);

  // 1.b marked NOK and closed straight away: the page saves it first.
  const second = inspection.templateSnapshot.sections[0]!.items[1]!;
  await page.locator(`#row-${second.id}`).getByRole('button', { name: 'NOK', exact: true }).click();
  await page.getByRole('tab', { name: /^Deviations/ }).click();
  const id = `${inspection.number} · D-02`;
  const card = page.locator('article[data-deviation="D-02"]');
  await card.getByRole('button', { name: `Close… ${id}` }).click();
  const dialog = page.getByRole('dialog', { name: `Close ${id}` });
  await dialog.getByLabel('Closed by').fill('Anna Andersson');
  await dialog.getByRole('button', { name: 'Close deviation' }).click();
  await expect(card).toContainText(/Closed \d{4}-\d{2}-\d{2} by Anna Andersson/);
  await expect(card.getByRole('button', { name: `Reopen… ${id}` })).toBeVisible();
  await expect(page.locator('main header [role="status"]')).toHaveText('Saved');

  // A finalised inspection's deviations are followed up too; one that isn't one is refused.
  const done = await withDeviation(page.request, machine.template, `${machine.id}-2`, {
    finalise: true,
  });
  const key = done.inspection.templateSnapshot.sections[0]!.items[0]!.id;
  const okRow = done.inspection.templateSnapshot.sections[0]!.items[1]!.id;
  const url = (item: string) => `/api/inspections/${done.inspection.id}/follow-ups/${item}`;
  expect((await page.request.put(url(key), { data: { status: 'closed' } })).status()).toBe(200);
  expect((await page.request.put(url(okRow), { data: { status: 'closed' } })).status()).toBe(404);

  // The log of what is closed, searched, as a CSV file named after its filters.
  await page.goto(`/deviations/final?status=closed&q=${encodeURIComponent(machine.id)}`);
  await expect(page.getByRole('status').filter({ hasText: /deviations on/ })).toHaveText(
    '2 deviations on 2 machines',
  );
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^Final inspection deviations \d{4}-\d{2}-\d{2}, closed, searched\.csv$/,
  );
  const csv = await readFile((await download.path())!, 'utf8');
  const lines = csv
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');
  expect(lines[0]).toBe(
    'Machine ID;Serial number;Model;Inspection;Date;Deviation ID;Description;Comment;Action;Category;Severity;Responsible;Status;Found;Closed;Closed by',
  );
  expect(lines).toHaveLength(3);
  expect(lines.find((line) => line.includes(id))).toMatch(
    new RegExp(
      `^${machine.id};SN-LOG-1;${machine.model};${inspection.number};2026-10-07;${id};1\\.b Pallet changer - Smooth movement, no noise;;;;Minor;;Closed;\\d{4}-\\d{2}-\\d{2};\\d{4}-\\d{2}-\\d{2};Anna Andersson$`,
    ),
  );
});

test('the log prints what its filters show, as a checklist or with pictures, after a preview', async ({
  page,
  context,
  machine,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  // The print tab's window.print() is counted, not shown.
  await context.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printed = String(
        Number(document.documentElement.dataset.printed ?? 0) + 1,
      );
    };
  });
  // A quality check's deviation with a photo.
  const { inspection: check, etag } = await withDeviation(page.request, machine.check, machine.id);
  const jpeg = await testPhoto(page.context().browser()!, {
    width: 800,
    height: 600,
    label: 'Decal',
  });
  const photoId = await uploadPhoto(page.request, jpeg);
  const first = check.templateSnapshot.sections[0]!.items[0]!.id;
  const { modelCode: _model, ...front } = check.front;
  const saved = await page.request.put(`/api/inspections/${check.id}`, {
    headers: { 'If-Match': etag },
    data: {
      front,
      results: {
        ...check.results,
        [first]: {
          ...check.results[first],
          photos: [{ imageId: photoId, annotations: [], caption: 'Left tube' }],
        },
      },
      extraDeviations: [],
    },
  });
  expect(saved.status()).toBe(200);
  const id = `${check.number} · D-01`;
  await page.goto(`/deviations/quality?q=${encodeURIComponent(machine.id)}`);
  await expect(machineCard(page, machine.id)).toContainText(id);

  // Preview: the checklist of what the filters show, then the cards with the photo.
  await page.getByRole('button', { name: 'Preview' }).click();
  const dialog = page.getByRole('dialog', { name: 'Preview' });
  const previewed = dialog.locator('[data-print-root]');
  await expect(previewed).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(previewed).toHaveAttribute('data-print-mode', 'list');
  await expect(previewed.locator('[data-log-row]')).toHaveCount(1);
  for (const text of [
    'Quality check deviations',
    `“${machine.id}”`,
    machine.id,
    id,
    'Decal turned inward',
    'Mechanical',
    'Action taken · Sign · Date',
    'All deviations above closed',
  ]) {
    await expect(previewed).toContainText(text);
  }
  await expect(dialog.getByRole('button', { name: '2 per page' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'With pictures' }).click();
  await expect(previewed).toHaveAttribute('data-print-mode', 'cards');
  await expect(previewed).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(previewed.locator('[data-deviation-card]')).toHaveCount(1);
  await expect(previewed.locator('[data-deviation-card]')).toContainText(
    `${machine.id} · S/N RM-LOG-016 · Pre start up`,
  );
  await expect(previewed.locator('[data-deviation-card] img')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: '2 per page' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Print / Save PDF → Checklist: the print page under the same filters, printed once.
  await page.getByRole('button', { name: 'Print / Save PDF' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Checklist', 'With pictures']);
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('menuitem', { name: 'Checklist' }).click(),
  ]);
  await expect(tab).toHaveURL(/\/deviations\/quality\/print\?q=Magellan%23[A-Z]{6}&layout=list/);
  const printed = tab.locator('[data-print-root]');
  await expect(printed).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(tab.locator('html')).toHaveAttribute('data-printed', '1');
  await expect(tab).not.toHaveURL(/autoprint/);
  await expect(tab.getByRole('link', { name: 'Back to the deviations' })).toHaveAttribute(
    'href',
    `/deviations/quality?q=${encodeURIComponent(machine.id)}`,
  );
  const pages = await readPdf(await tab.pdf({ format: 'A4', preferCSSPageSize: true }));
  expect(pages.length).toBeGreaterThanOrEqual(1);
  const text = pages.map(pageText).join('');
  for (const words of ['Quality check deviations', id, 'Decal turned inward', machine.id]) {
    expect(text).toContain(words.replace(/\s+/g, ''));
  }
  expect(pages[0]!.texts.map((part) => part.text)).toContain(`Page 1 of ${pages.length}`);

  // With pictures, on the same page: the cards, two or four to a page.
  await tab
    .getByRole('group', { name: 'What to print' })
    .getByRole('button', { name: 'With pictures' })
    .click();
  await expect(tab).toHaveURL(/layout=cards/);
  await expect(printed).toHaveAttribute('data-print-mode', 'cards');
  await expect(printed).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  await expect(printed.locator('[data-deviation-card] img')).toHaveCount(1);
  await expect(tab.getByRole('button', { name: '4 per page' })).toBeVisible();
});
