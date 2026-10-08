import {
  DEFAULT_COMPANY_NAME,
  deviationNumber,
  InspectionSchema,
  rowLetter,
  type AnnotatedImage,
  type ExtraDeviation,
  type Inspection,
  type RowResult,
  type Section,
  type Template,
} from '@modig/shared';
import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { signIn } from './support/auth';
import { compact, footerTexts, MM, pageText, readPdf, type PdfPage } from './support/pdf';
import { testPhoto, uploadPhoto } from './support/photos';
import {
  createTemplate,
  deleteImages,
  deleteInspection,
  deleteTemplate,
  findSeededRevision,
} from './support/storage';

/**
 * Brief §6 and §10 phase 4: the print routes, printed to real PDFs with Chromium's own
 * `page.pdf` (A4, the page's @page rule, background graphics on as in the print dialog) and
 * measured with pdfjs. The tests print a copy of the seeded 90-row RigiMill MG checklist, made
 * into a throwaway template (model E2E), so local edits to the seeded one never change a page
 * count; the long-text test a six-row one. Templates, inspections and photos are deleted
 * afterwards.
 */

const INSPECTOR = 'erik.lund@modig.se';
const ADMIN = 'anna.andersson@modig.se';

type Cleanup = {
  template: (id: string) => void;
  inspection: (id: string) => void;
  images: (ids: string[]) => void;
};

const test = base.extend<{
  /** A published copy of the seeded checklist; `spareRows` per section (3 if omitted). */
  copyOfSeeded: (name: string, spareRows?: number) => Promise<Template>;
  cleanup: Cleanup;
}>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern first
  copyOfSeeded: async ({}, use) => {
    const ids: string[] = [];
    const seeded = await findSeededRevision();
    await use(async (name, spareRows) => {
      expect(seeded?.revision.sections.flatMap((section) => section.items)).toHaveLength(90);
      const template = await createTemplate(name, true, {
        sections: seeded!.revision.sections,
        spareRowsPerSection: spareRows,
      });
      ids.push(template.id);
      return template;
    });
    await Promise.all(ids.map(deleteTemplate));
  },
  // eslint-disable-next-line no-empty-pattern -- as above
  cleanup: async ({}, use) => {
    const templates: string[] = [];
    const inspections: string[] = [];
    const images: string[] = [];
    await use({
      template: (id) => templates.push(id),
      inspection: (id) => inspections.push(id),
      images: (ids) => images.push(...ids),
    });
    await Promise.all([...inspections.map(deleteInspection), ...templates.map(deleteTemplate)]);
    await deleteImages(images);
  },
});

// -------------------------------------------------------------------------------------------
// Printing
// -------------------------------------------------------------------------------------------

/** Waits until the print route says everything is in (data, images, fonts) and no image failed. */
async function expectReady(page: Page): Promise<void> {
  const root = page.locator('[data-print-root]');
  // A cold load through the dev server, with photos: allow more than the default 10 s.
  await expect(root).toHaveAttribute('data-print-ready', 'true', { timeout: 30_000 });
  const broken = await root
    .locator('img')
    .evaluateAll((images) =>
      (images as HTMLImageElement[])
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.alt),
    );
  expect(broken, 'images that did not load').toEqual([]);
}

/**
 * Prints the page as Chrome's "Save as PDF" would. The PDF is kept in the test's output folder
 * (test-results/, which CI uploads when a test fails), to look at.
 */
async function printPdf(page: Page, name: string): Promise<PdfPage[]> {
  await expectReady(page);
  const pdf = await page.pdf({
    path: test.info().outputPath(`${name}.pdf`),
    format: 'A4',
    preferCSSPageSize: true,
    printBackground: true,
  });
  return readPdf(pdf);
}

// -------------------------------------------------------------------------------------------
// What the PDF must show
// -------------------------------------------------------------------------------------------

/** A row ref ("3.c", "5.aa") in the No. column, which starts 12 mm from the left edge. */
const refsOn = (page: PdfPage) =>
  page.texts.filter((text) => /^\d+\.[a-z]+$/.test(text.text) && text.x < 18 * MM);

/** The deviation pages start with this heading (13 pt), the checklist with "Checklist". */
const isDeviationPage = (page: PdfPage) =>
  page.texts.some((text) => text.text === 'Deviation Summary' && text.size > 12);

/**
 * Every page: A4 portrait, the document's footer bottom left and "Page X of Y" bottom right with
 * the right total (and nothing else in the bottom margin), and no text past the right margin.
 */
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
    const rightEdge = page.width - 12 * MM;
    const past = page.texts.filter((text) => text.right > rightEdge);
    expect(
      past.map((text) => `${text.text} ends at ${(text.right / MM).toFixed(2)} mm`),
      where,
    ).toEqual([]);
  }
}

/** Page 1 is the front page: the title, and no checklist row. */
function expectFrontPage(page: PdfPage, texts: (string | RegExp)[]): void {
  expect(page.texts.find((text) => text.text === 'Final Inspection')?.size).toBeCloseTo(28);
  expect(page.texts.map((text) => text.text)).toEqual(
    expect.arrayContaining(
      texts.map((text) => (typeof text === 'string' ? text : expect.stringMatching(text))),
    ),
  );
  expect(refsOn(page)).toEqual([]);
}

/**
 * The checklist pages (after the front page, before the deviations): every row in order, each
 * whole on the one page that has its ref; spare rows (blank) continue the lettering; no section
 * title is left at the foot of a page without a row of its section after it.
 */
function expectChecklist(
  pages: PdfPage[],
  sections: Section[],
  spareRows: number,
): { checklistPages: PdfPage[] } {
  const firstDeviationPage = pages.findIndex(isDeviationPage);
  expect(firstDeviationPage).toBeGreaterThan(1);
  const checklistPages = pages.slice(1, firstDeviationPage);
  expect(checklistPages[0]!.texts.some((text) => text.text === 'Checklist')).toBe(true);

  const expected = sections.flatMap((section, index) => {
    const rows = [...section.items.map((item) => item.text), ...Array<string>(spareRows).fill('')];
    return rows.map((text, row) => ({ ref: `${index + 1}.${rowLetter(row)}`, text }));
  });
  const printed = checklistPages.flatMap((page) =>
    refsOn(page).map((ref) => ({ ref: ref.text, page })),
  );
  expect(printed.map(({ ref }) => ref)).toEqual(expected.map(({ ref }) => ref));
  expected.forEach(({ ref, text }, index) => {
    if (text) {
      expect(pageText(printed[index]!.page), `row ${ref} whole on its page`).toContain(
        compact(text),
      );
    }
  });

  const titled = new Set<number>();
  for (const page of checklistPages) {
    for (const title of page.texts.filter((text) => text.size > 9.5 && text.size < 10.5)) {
      const section = sections.findIndex((candidate) => candidate.title.trim() === title.text);
      if (section < 0) continue;
      titled.add(section);
      const rowsAfter = refsOn(page).filter(
        (ref) => ref.text.startsWith(`${section + 1}.`) && ref.y > title.y,
      );
      expect(rowsAfter.length, `section ${section + 1} on page ${page.number}`).toBeGreaterThan(0);
    }
  }
  // Every section's title was found (and checked) at least once.
  expect(titled.size).toBe(sections.length);
  return { checklistPages };
}

/** Distance between the refs of neighbouring rows of one section on one page: the row pitch. */
function smallestRowPitch(pages: PdfPage[]): number {
  let smallest = Infinity;
  for (const page of pages) {
    const refs = refsOn(page);
    for (let index = 1; index < refs.length; index += 1) {
      const [above, below] = [refs[index - 1]!, refs[index]!];
      if (above.text.split('.')[0] === below.text.split('.')[0]) {
        smallest = Math.min(smallest, below.y - above.y);
      }
    }
  }
  if (smallest === Infinity) throw new Error('No neighbouring rows to measure');
  return smallest;
}

/** The blank Deviation Summary: the last page, on its own, with lines D-01…D-15. */
function expectBlankDeviationTable(pages: PdfPage[]): void {
  const summary = pages.filter(isDeviationPage);
  expect(summary.map((page) => page.number)).toEqual([pages.length]);
  const lines = summary[0]!.texts.filter((text) => /^D-\d{2}$/.test(text.text));
  expect(lines.map((text) => text.text)).toEqual(
    Array.from({ length: 15 }, (_, index) => deviationNumber(index)),
  );
  expect(refsOn(summary[0]!)).toEqual([]);
}

type ExpectedCard = { number: string; text: string; comment: string; photos: number };

/** Card numbers in pages of `perPage`: the layout when every card fits its share. */
const pagesOf = (cards: ExpectedCard[], perPage: number) =>
  Array.from({ length: Math.ceil(cards.length / perPage) }, (_, index) =>
    cards.slice(index * perPage, (index + 1) * perPage).map((card) => card.number),
  );

/**
 * The report's deviation pages, after the checklist, hold the cards as `layout` says (card
 * numbers per page). Each page is headed with the inspection and its range of cards; each card is
 * whole on its page (number, text, comment and its Closed line) with its photos painted there.
 */
function expectCards(
  pages: PdfPage[],
  cards: ExpectedCard[],
  layout: string[][],
  inspectionNumber: string,
): void {
  const deviationPages = pages.slice(pages.findIndex(isDeviationPage));
  expect(deviationPages.every(isDeviationPage)).toBe(true);
  const heads = deviationPages.map((page) =>
    page.texts
      .filter((text) => text.size > 10.5 && /^D-\d{2,}( ·)?$/.test(text.text))
      .map((text) => text.text.replace(' ·', '')),
  );
  expect(heads).toEqual(layout);

  deviationPages.forEach((page, index) => {
    const onPage = cards.filter((card) => layout[index]!.includes(card.number));
    const where = `deviation page ${page.number}`;
    const range = [onPage[0]!.number, onPage.at(-1)!.number];
    expect(
      page.texts.map((text) => text.text),
      where,
    ).toContain(`${inspectionNumber} · ${range[0] === range[1] ? range[0] : range.join('–')}`);
    expect(
      page.texts.filter((text) => text.text === 'Closed'),
      where,
    ).toHaveLength(onPage.length);
    for (const card of onPage) {
      expect(pageText(page), `${card.number} whole on ${where}`).toContain(
        compact(card.text + card.comment),
      );
    }
    expect(page.images, `photos on ${where}`).toBe(
      onPage.reduce((sum, card) => sum + card.photos, 0),
    );
  });
}

// -------------------------------------------------------------------------------------------
// Test data
// -------------------------------------------------------------------------------------------

async function companyName(request: APIRequestContext): Promise<string> {
  const settings = (await (await request.get('/api/settings')).json()) as { companyName: string };
  return settings.companyName.trim() || DEFAULT_COMPANY_NAME;
}

const FRONT = {
  serialNumber: 'RM-2026-031',
  participants: ['Erik Lund', 'Anna Andersson', 'Johan Berg'],
  location: 'Kalmar, Sweden',
  date: '2026-10-07',
};

async function createInspection(
  request: APIRequestContext,
  template: Template,
  machineName: string,
  photoId?: string,
): Promise<{ inspection: Inspection; etag: string }> {
  const response = await request.post('/api/inspections', {
    data: { templateId: template.id, front: { ...FRONT, machineName, photoId } },
  });
  expect(response.status()).toBe(201);
  return {
    inspection: InspectionSchema.parse(await response.json()),
    etag: response.headers()['etag']!,
  };
}

/** The footer bottom left of every page of an inspection's printout. */
const inspectionFooter = (company: string, inspection: Inspection) =>
  `${company} · ${inspection.number} · ${inspection.front.machineName} · S/N ${FRONT.serialNumber} · Rev 1`;

/** Saves results and extra deviations as the page's autosave would; returns the new ETag. */
async function save(
  request: APIRequestContext,
  { inspection, etag }: { inspection: Inspection; etag: string },
  results: Record<string, RowResult>,
  extraDeviations: ExtraDeviation[],
): Promise<string> {
  const { modelCode: _model, ...front } = inspection.front;
  const saved = await request.put(`/api/inspections/${inspection.id}`, {
    headers: { 'If-Match': etag },
    data: { front, results, extraDeviations },
  });
  expect(saved.status()).toBe(200);
  return saved.headers()['etag']!;
}

/** What a deviation's card must print, D-01 first: NOK rows in checklist order, then extras. */
function expectedCards(
  noks: { text: string; result: RowResult }[],
  extras: ExtraDeviation[],
): ExpectedCard[] {
  return [
    ...noks.map(({ text, result }) => ({ text, ...result })),
    ...extras.map((extra) => ({ text: extra.description, ...extra })),
  ].map((card, index) => ({
    number: deviationNumber(index),
    text: card.text,
    comment: card.comment ?? '',
    photos: card.photos?.length ?? 0,
  }));
}

const LONG_COMMENTS = [
  'Two of the four M12 screws on the left lifting column have no torque mark. Torque checked ' +
    'to 85 Nm and marked blue; the other two were already marked. Check all four again after ' +
    'transport, because the column is lifted off for shipping and the screws are loosened. ' +
    'Photo of the screws is attached to the deviation; part no. 4711-0815-ABCDEFGHIJKLMNOPQRS ' +
    '(long unbroken identifier) is the screw kit to order if one is damaged.',
  'The chip conveyor runs noisy at full speed: a rattle from the drive end every few seconds, ' +
    'louder under load. The chain tension is within its limits, so the likely cause is a worn ' +
    'guide rail or a loose cover plate. Check both before delivery and run the conveyor for 30 ' +
    'minutes afterwards; replace guide rail kit 4711-2207 if it shows wear.',
];

/**
 * A finalised report of the 90-row checklist: five NOK rows (two long comments, every severity,
 * photos with and without a marked-up copy, some without photos), three N/A rows and two extra
 * deviations: seven deviation cards. Each four of them fit a page of four.
 */
async function createReport(
  request: APIRequestContext,
  template: Template,
  photos: { machine: string; plain: string[]; marked: string[] },
): Promise<{ inspection: Inspection; cards: ExpectedCard[] }> {
  const created = await createInspection(
    request,
    template,
    'RigiMill MG – Scania Södertälje',
    photos.machine,
  );
  const sections = created.inspection.templateSnapshot.sections;
  const item = (section: number, row: number) => sections[section - 1]!.items[row]!;
  const photo = (index: number, caption?: string, marked = true): AnnotatedImage => ({
    imageId: photos.plain[index]!,
    caption,
    annotations: marked ? [{ kind: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.3, color: '#E02424' }] : [],
    renderedImageId: marked ? photos.marked[index] : undefined,
  });

  const noks: { id: string; text: string; result: RowResult }[] = [
    {
      ...item(1, 3),
      result: {
        comment: LONG_COMMENTS[0],
        resp: 'Montage',
        severity: 'major',
        photos: [photo(0, 'Left lifting column, upper screws'), photo(1, 'The same screws', false)],
      },
    },
    {
      ...item(2, 6),
      result: {
        comment: 'Tool door lock does not engage on the first try; adjust the striker plate.',
        resp: 'Mekanik',
        severity: 'critical',
        photos: [photo(2, 'Tool door, lock side')],
      },
    },
    { ...item(3, 4), result: { comment: 'Two cables on terminal row X2 have no labels.' } },
    {
      ...item(5, 10),
      result: {
        comment: 'Two air bubbles in the wrapping near the left edge; rewrap before shipping.',
        resp: 'Montage',
        photos: [photo(3)],
      },
    },
    { ...item(6, 16), result: { comment: LONG_COMMENTS[1], resp: 'Mekanik', severity: 'major' } },
  ];
  const notApplicable = [item(1, 7), item(2, 2), item(6, 1)];
  const results: Record<string, RowResult> = {};
  for (const section of sections) {
    for (const { id } of section.items) results[id] = { status: 'OK' };
  }
  for (const { id, result } of noks) results[id] = { status: 'NOK', ...result };
  for (const { id } of notApplicable) {
    results[id] = { status: 'NA', comment: 'Option not ordered by the customer.' };
  }
  const extras: ExtraDeviation[] = [
    {
      id: 'E2eExtra00000001',
      description: 'Paint damage on the right-hand door, a 3 cm scratch near the handle',
      comment: 'Touch up before shipping.',
      resp: 'Lackering',
      severity: 'minor',
      photos: [photo(4, 'Right-hand door')],
    },
    {
      id: 'E2eExtra00000002',
      description: 'Operator manual missing from the electrical cabinet',
      resp: 'Dokumentation',
      severity: 'major',
    },
  ];

  const etag = await save(request, created, results, extras);
  const finalised = await request.post(`/api/inspections/${created.inspection.id}/finalise`, {
    headers: { 'If-Match': etag },
  });
  expect(finalised.status()).toBe(200);
  return {
    inspection: InspectionSchema.parse(await finalised.json()),
    cards: expectedCards(noks, extras),
  };
}

// -------------------------------------------------------------------------------------------
// Tests
// -------------------------------------------------------------------------------------------

test('a blank checklist of the 90-row RigiMill MG prints on A4 with room to write', async ({
  page,
  context,
  copyOfSeeded,
  cleanup,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const template = await copyOfSeeded('E2E print – blank checklist');
  const { inspection } = await createInspection(
    page.request,
    template,
    'RigiMill MG – Volvo Cars Skövde',
  );
  cleanup.inspection(inspection.id);

  await page.goto(`/inspections/${inspection.id}/print?mode=blank`);
  const pages = await printPdf(page, 'blank-checklist');
  await expect(page.locator('[data-print-root]')).toHaveAttribute('data-print-mode', 'blank');
  await expect(page.locator('tr[data-spare]')).toHaveCount(6 * 3);

  // 90 checkpoints and 3 spare lines per section, each at least 9 mm: 108 × 9 mm = 972 mm, at
  // least 4 of the 267 mm content pages; measured 5 (most checkpoints take two lines). With the
  // front page and the Deviation Summary: 7, and one page more is allowed.
  expect(pages.length).toBeGreaterThanOrEqual(6);
  expect(pages.length).toBeLessThanOrEqual(8);
  expectPages(pages, inspectionFooter(await companyName(page.request), inspection));
  expectFrontPage(pages[0]!, [inspection.number, 'Rev: 1', 'Inspected by', 'Signature']);
  const { checklistPages } = expectChecklist(pages, inspection.templateSnapshot.sections, 3);
  expect(smallestRowPitch(checklistPages) / MM).toBeGreaterThanOrEqual(9);
  expectBlankDeviationTable(pages);
});

for (const perPage of [2, 4] as const) {
  test(`a finalised report prints its deviations as cards with photos, ${perPage} per page`, async ({
    page,
    context,
    browser,
    copyOfSeeded,
    cleanup,
  }) => {
    await signIn(context, INSPECTOR, ['inspector']);
    const template = await copyOfSeeded(`E2E print – report ${perPage} per page`);
    const upload = async (label: string, width = 1200, height = 900) =>
      uploadPhoto(page.request, await testPhoto(browser, { width, height, label }));
    const photos = {
      machine: await upload('Machine', 1400, 700),
      plain: await Promise.all([0, 1, 2, 3, 4].map((index) => upload(`Photo ${index + 1}`))),
      marked: await Promise.all([0, 1, 2, 3, 4].map((index) => upload(`Marked ${index + 1}`))),
    };
    cleanup.images([photos.machine, ...photos.plain, ...photos.marked]);
    const { inspection, cards } = await createReport(page.request, template, photos);
    cleanup.inspection(inspection.id);

    await page.goto(`/inspections/${inspection.id}/print?mode=report`);
    if (perPage === 4) {
      // Chosen in the toolbar: the address keeps it, and the page waits for the photos again.
      await expectReady(page);
      await page
        .getByRole('group', { name: 'Deviations' })
        .getByRole('button', { name: '4 per page' })
        .click();
      await expect(page).toHaveURL(/[?&]deviationsPerPage=4/);
    }
    // 2 per page is the default.
    const section = page.locator(`section[data-deviations-per-page="${perPage}"]`);
    await expect(section).toBeVisible();
    await expect(section.locator('article[data-deviation-card]')).toHaveCount(7);
    // A marked-up photo prints its flattened copy, the others the photo itself.
    await expect(section.locator('[data-deviation-card="D-01"] img')).toHaveCount(2);
    await expect(section.locator('[data-deviation-card="D-01"] img').first()).toHaveAttribute(
      'src',
      new RegExp(`/images/${photos.marked[0]}\\.jpg\\?`),
    );
    await expect(section.locator('[data-deviation-card="D-01"] img').nth(1)).toHaveAttribute(
      'src',
      new RegExp(`/images/${photos.plain[1]}\\.jpg\\?`),
    );
    // The status in words in its column: three rows N/A.
    await expect(page.locator('tr[data-row-ref] .paper-mark', { hasText: 'N/A' })).toHaveCount(3);
    const pdf = await printPdf(page, `report-${perPage}-per-page`);

    // Report rows are at least 7 mm: 90 × 7 mm = 630 mm, at least 3 checklist pages; measured 5
    // (two-line checkpoints, long comments), and one more is allowed. Then the front page, and
    // the cards on exactly ⌈7 / perPage⌉ pages (expectCards).
    const checklistPages = pdf.length - 1 - Math.ceil(cards.length / perPage);
    expect(checklistPages).toBeGreaterThanOrEqual(3);
    expect(checklistPages).toBeLessThanOrEqual(6);
    expectPages(pdf, inspectionFooter(await companyName(page.request), inspection));
    expectFrontPage(pdf[0]!, [
      inspection.number,
      new RegExp(`^Finalised .+ by ${INSPECTOR.replaceAll('.', '\\.')}$`),
      '90 / 90 rows filled · 5 NOK · 7 deviations',
    ]);
    // The front page shows the logo and the machine photo.
    expect(pdf[0]!.images).toBe(2);
    expectChecklist(pdf, inspection.templateSnapshot.sections, 0);
    expectCards(pdf, cards, pagesOf(cards, perPage), inspection.number);
  });
}

test('a page holds fewer cards when their text needs the room; no card is ever split', async ({
  page,
  context,
  browser,
  cleanup,
}) => {
  await signIn(context, INSPECTOR, ['inspector']);
  const template = await createTemplate('E2E print – long deviations', true);
  cleanup.template(template.id);
  const created = await createInspection(page.request, template, 'RigiMill MG – Sandvik Gimo');
  cleanup.inspection(created.inspection.id);
  const photo = await uploadPhoto(
    page.request,
    await testPhoto(browser, { width: 1200, height: 900, label: 'Photo' }),
  );
  cleanup.images([photo]);

  // Five NOK rows of six, the first three with a very long comment; still in progress.
  const items = created.inspection.templateSnapshot.sections.flatMap((section) => section.items);
  const veryLong = LONG_COMMENTS.join(' ');
  const noks = items.slice(0, 5).map(({ id, text }, index) => ({
    id,
    text,
    result: {
      status: 'NOK' as const,
      comment: index < 3 ? veryLong : 'Needs adjustment before delivery.',
      resp: 'Montage',
      photos: index === 0 ? [{ imageId: photo, annotations: [] }] : undefined,
    },
  }));
  await save(
    page.request,
    created,
    Object.fromEntries(noks.map(({ id, result }) => [id, result])),
    [],
  );
  const { inspection } = created;

  await page.goto(`/inspections/${inspection.id}/print?mode=report&deviationsPerPage=4`);
  const pdf = await printPdf(page, 'report-long-deviations');

  // Two long cards fill a page of four; the third moves on, whole, with the two short ones.
  expectPages(
    pdf,
    `${inspectionFooter(await companyName(page.request), inspection)} · Not finalised`,
  );
  expectFrontPage(pdf[0]!, [inspection.number, 'NOT FINALISED – DRAFT REPORT']);
  expectChecklist(pdf, inspection.templateSnapshot.sections, 0);
  expectCards(
    pdf,
    expectedCards(noks, []),
    [
      ['D-01', 'D-02'],
      ['D-03', 'D-04', 'D-05'],
    ],
    inspection.number,
  );
});

test('a template preview prints the draft as a blank checklist; spare rows run on past z', async ({
  page,
  context,
  copyOfSeeded,
}) => {
  await signIn(context, ADMIN, ['admin']);
  // Section 5 has 22 rows: five spare lines are 5.w to 5.aa.
  const template = await copyOfSeeded('E2E print – template preview', 5);

  await page.goto(`/templates/${template.id}/print`);
  const pages = await printPdf(page, 'template-preview');
  await expect(page.locator('tr[data-row-ref="5.aa"][data-spare]')).toHaveCount(1);

  // 90 checkpoints and 5 spare lines per section at 9 mm or more: 120 × 9 mm = 1080 mm, at
  // least 5 content pages; measured 6. With the front page and the Deviation Summary: 8, and one
  // page more is allowed.
  expect(pages.length).toBeGreaterThanOrEqual(7);
  expect(pages.length).toBeLessThanOrEqual(9);
  expectPages(pages, `${await companyName(page.request)} · ${template.name} · Rev 2 (draft)`);
  expectFrontPage(pages[0]!, ['Draft – Rev 2', 'Inspected by']);
  const { checklistPages } = expectChecklist(pages, template.sections, 5);
  expect(checklistPages.flatMap(refsOn).map((ref) => ref.text)).toContain('5.aa');
  expect(smallestRowPitch(checklistPages) / MM).toBeGreaterThanOrEqual(9);
  expectBlankDeviationTable(pages);
});
