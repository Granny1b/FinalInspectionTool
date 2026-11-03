import type * as AzureFunctions from '@azure/functions';
import type { HttpResponseInit } from '@azure/functions';
import {
  ApiErrorSchema,
  blobNames,
  CONTAINERS,
  InsightsSchema,
  newId,
  type Inspection,
  type RowResult,
  type Template,
} from '@modig/shared';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { context, principal, request } from '../../test/requests';
import {
  draftTemplate,
  resetStorage,
  sampleInspection,
  storeTemplate,
  useTestStorage,
} from '../../test/storage';
import { syncDeviations } from '../lib/deviations';
import { writeInspection } from '../lib/inspections';
import { clearRevisionCache } from '../lib/insights';
import { writeJson } from '../lib/storage';
import { exportInsightsCsv, getInsights } from './insights';

// Record the registrations instead of letting the package (in "test mode") warn about them.
const registrations = vi.hoisted((): unknown[][] => []);
vi.mock('@azure/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureFunctions>()),
  app: { http: (...args: unknown[]) => registrations.push(args) },
}));

beforeAll(useTestStorage);
beforeEach(async () => {
  await resetStorage();
  clearRevisionCache();
});

const ADMIN = principal('anna@modig.se', ['admin']);
const INSPECTOR = principal('sam@modig.se', ['inspector']);

const insights = async (query: Record<string, string> = {}, who = ADMIN) =>
  getInsights(request({ principal: who, query }), context());

function parsed(response: HttpResponseInit) {
  expect(response.status).toBe(200);
  return InsightsSchema.parse(response.jsonBody);
}

/** The template every test inspects: published as revision 2, rows a, b (section 1) and c. */
async function publishedTemplate(): Promise<{ template: Template; items: string[] }> {
  const template = draftTemplate({ status: 'published', revision: 2 });
  await storeTemplate(template, [2]);
  const items = template.sections.flatMap((section) => section.items.map((item) => item.id));
  return { template, items };
}

/** Stores an inspection the way the API does (blob with its list summary, then the table). */
async function inspect(
  template: Template,
  results: Record<string, RowResult>,
  patch: Partial<Inspection> = {},
): Promise<Inspection> {
  const inspection = sampleInspection(
    { id: newId(), state: 'finalised', results, ...patch },
    template,
  );
  await writeInspection(inspection, {});
  await syncDeviations(inspection);
  return inspection;
}

describe('insights endpoints', () => {
  it('registers two GETs', () => {
    expect(registrations).toEqual([
      [
        'insights',
        { methods: ['GET'], authLevel: 'anonymous', route: 'insights', handler: getInsights },
      ],
      [
        'insightsExport',
        {
          methods: ['GET'],
          authLevel: 'anonymous',
          route: 'insights/export.csv',
          handler: exportInsightsCsv,
        },
      ],
    ]);
  });

  it('are for admins only', async () => {
    expect((await getInsights(request(), context())).status).toBe(401);
    expect((await insights({}, INSPECTOR)).status).toBe(403);
    const csv = await exportInsightsCsv(request({ principal: INSPECTOR }), context());
    expect(csv.status).toBe(403);
  });

  it('refuses filters that are not valid, saying which', async () => {
    const response = await insights({ from: '2026-10-31', to: '2026-10-01' });
    expect(response.status).toBe(400);
    const body = ApiErrorSchema.parse(response.jsonBody);
    expect(body.message).toBe('The filters in the URL are not valid.');
    expect(body.details).toEqual([expect.objectContaining({ path: ['to'] })]);
    const csv = await exportInsightsCsv(
      request({ principal: ADMIN, query: { model: 'a/b' } }),
      context(),
    );
    expect(csv.status).toBe(400);
  });
});

describe('GET /api/insights', () => {
  it('is all zeros without inspections', async () => {
    expect(parsed(await insights())).toEqual({
      modelCodes: [],
      inspections: { finalised: 0, inProgress: 0 },
      deviations: 0,
      rows: { ok: 0, nok: 0, na: 0 },
      perMonth: [],
      perSection: [],
      perModel: [],
      bySeverity: { minor: 0, major: 0, critical: 0 },
      topCheckpoints: [],
      byResp: [],
    });
  });

  it('counts finalised inspections, their rows and their deviations', async () => {
    const { template, items } = await publishedTemplate();
    const [a, b, c] = items as [string, string, string];
    await inspect(
      template,
      {
        [a]: { status: 'NOK', severity: 'major', resp: 'Mechanics' },
        [b]: { status: 'OK' },
        [c]: { status: 'NA' },
      },
      {
        front: { ...sampleInspection().front, date: '2026-09-10' },
        extraDeviations: [{ id: newId(), description: 'Scratch on door', severity: 'minor' }],
      },
    );
    await inspect(template, { [a]: { status: 'NOK', resp: 'Mechanics ' }, [b]: { status: 'OK' } });
    // In progress: left out by default.
    await inspect(template, { [b]: { status: 'NOK' } }, { state: 'in_progress' });

    const result = parsed(await insights());
    expect(result.inspections).toEqual({ finalised: 2, inProgress: 0 });
    expect(result.deviations).toBe(3);
    expect(result.rows).toEqual({ ok: 2, nok: 2, na: 1 });
    expect(result.perMonth).toEqual([
      { month: '2026-09', inspections: 1, deviations: 2 },
      { month: '2026-10', inspections: 1, deviations: 1 },
    ]);
    expect(result.perSection).toEqual([
      { title: 'Loading area', deviations: 2 },
      { title: null, deviations: 1 },
    ]);
    expect(result.perModel).toEqual([{ modelCode: 'RMMG', inspections: 2, deviations: 3 }]);
    expect(result.bySeverity).toEqual({ minor: 2, major: 1, critical: 0 });
    expect(result.byResp).toEqual([
      { resp: 'Mechanics', deviations: 2 },
      { resp: '', deviations: 1 },
    ]);
    expect(result.topCheckpoints).toEqual([
      {
        itemId: a,
        modelCode: 'RMMG',
        ref: '1.a',
        text: 'Lifting columns - Marked screws, blue/red/yellow',
        sectionTitle: 'Loading area',
        removed: false,
        failed: 2,
        inspections: 2,
      },
    ]);

    const all = parsed(await insights({ includeInProgress: 'true' }));
    expect(all.inspections).toEqual({ finalised: 2, inProgress: 1 });
    expect(all.deviations).toBe(4);
  });

  it('applies the date range and the model to inspections and deviations alike', async () => {
    const { template, items } = await publishedTemplate();
    const nok = { [items[0]!]: { status: 'NOK' as const } };
    const on = (date: string) => ({ front: { ...sampleInspection().front, date } });
    await inspect(template, nok, on('2026-01-31'));
    await inspect(template, nok, on('2026-02-01'));
    await inspect(template, nok, on('2026-02-28'));
    await inspect(template, nok, on('2026-03-01'));

    const february = parsed(await insights({ from: '2026-02-01', to: '2026-02-28' }));
    expect(february.inspections.finalised).toBe(2);
    expect(february.deviations).toBe(2);
    expect(february.perMonth).toEqual([{ month: '2026-02', inspections: 2, deviations: 2 }]);

    const otherModel = parsed(await insights({ model: 'RMMT' }));
    expect(otherModel.inspections.finalised).toBe(0);
    expect(otherModel.deviations).toBe(0);
    expect(otherModel.modelCodes).toEqual(['RMMG']);
  });

  it('shows where a checkpoint is now, and counts only inspections whose checklist had it', async () => {
    const { template, items } = await publishedTemplate();
    const [a] = items as [string];
    await inspect(template, { [a]: { status: 'NOK' } });

    // Revision 3 moves row a to the end of section 2 and rewords it, and adds a row d.
    const [loading, electrical] = template.sections as [
      Template['sections'][0],
      Template['sections'][0],
    ];
    const moved = loading.items[0]!;
    const added = { id: newId(), text: 'Door - Closes' };
    const revision3: Template = {
      ...template,
      revision: 3,
      sections: [
        { ...loading, items: [...loading.items.slice(1), added] },
        {
          ...electrical,
          items: [...electrical.items, { ...moved, text: 'Lifting columns - Marked' }],
        },
      ],
    };
    await writeJson(CONTAINERS.templates, blobNames.templateRevision(template.id, 3), revision3);
    await inspect(revision3, { [added.id]: { status: 'NOK' } });
    await inspect(revision3, { [added.id]: { status: 'NOK' }, [a]: { status: 'OK' } });

    const { topCheckpoints } = parsed(await insights());
    expect(
      topCheckpoints.map(({ itemId, ref, text, failed, inspections }) => ({
        itemId,
        ref,
        text,
        failed,
        inspections,
      })),
    ).toEqual([
      // Row d failed in both inspections made since it was added; the first one never had it.
      { itemId: added.id, ref: '1.b', text: 'Door - Closes', failed: 2, inspections: 2 },
      { itemId: a, ref: '2.b', text: 'Lifting columns - Marked', failed: 1, inspections: 3 },
    ]);
  });

  it('ignores deviation rows whose inspection no longer exists', async () => {
    const { template, items } = await publishedTemplate();
    await inspect(template, { [items[0]!]: { status: 'NOK' } });
    // Rows in the table, but no blob: deleted by hand, say.
    await syncDeviations(
      sampleInspection(
        { id: newId(), state: 'finalised', results: { [items[1]!]: { status: 'NOK' } } },
        template,
      ),
    );
    const result = parsed(await insights());
    expect(result.deviations).toBe(1);
    expect(result.topCheckpoints).toHaveLength(1);
  });
});

describe('GET /api/insights/export.csv', () => {
  const exportCsv = (query: Record<string, string> = {}) =>
    exportInsightsCsv(request({ principal: ADMIN, query }), context());

  it('downloads the filtered rows as semicolon-separated UTF-8 with a header row', async () => {
    const { template, items } = await publishedTemplate();
    const [a, b] = items as [string, string];
    await inspect(
      template,
      {
        [b]: { status: 'NOK', comment: 'Skruv "lös"; åtdragen', resp: 'Mekanik' },
        [a]: { status: 'NOK', comment: '=HYPERLINK("x")', severity: 'critical' },
      },
      {
        number: 'FI-2026-0002',
        front: { ...sampleInspection().front, machineName: ' Fräs ', date: '2026-10-08' },
        extraDeviations: [{ id: newId(), description: '-1 screw', severity: 'minor' }],
      },
    );
    await inspect(template, { [b]: { status: 'NOK' } }, { number: 'FI-2026-0001' });
    await inspect(template, { [b]: { status: 'NOK' } }, { state: 'in_progress' });

    const response = await exportCsv({ to: '2026-10-31', model: 'RMMG' });
    expect(response.status).toBe(200);
    expect(response.headers).toMatchObject({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="Deviations start to 2026-10-31, RMMG.csv"',
    });
    const body = response.body as string;
    expect(body.startsWith('\uFEFF')).toBe(true);
    const lines = body.slice(1).split('\r\n');
    expect(lines.at(-1)).toBe(''); // ends with a line break
    expect(lines[0]).toBe(
      'inspectionId;inspectionNumber;serialNumber;machineName;modelCode;templateId;' +
        'templateRevision;itemId;sectionTitle;displayRef;checkpointText;comment;resp;severity;' +
        'inspectionDate;finalised;createdAt',
    );
    const rows = lines.slice(1, -1).map((line) => line.split(';'));
    // Oldest inspection first; in each, checklist order, then the extra deviation.
    expect(rows.map((row) => [row[1], row[9]])).toEqual([
      ['FI-2026-0001', '1.b'],
      ['FI-2026-0002', '1.a'],
      ['FI-2026-0002', '1.b'],
      ['FI-2026-0002', '—'],
    ]);
    expect(lines[2]).toContain(`;" Fräs ";RMMG;${template.id};2;${a};`);
    // Formulas stay text; quotes and separators are quoted.
    expect(lines[2]).toContain(`;"'=HYPERLINK(""x"")";;critical;2026-10-08;true;`);
    expect(lines[3]).toContain(';"Skruv ""lös""; åtdragen";Mekanik;minor;');
    expect(lines[4]).toContain(";'-1 screw;");
  });

  it('includes in-progress inspections when asked, and names the file after the filters', async () => {
    const { template, items } = await publishedTemplate();
    await inspect(template, { [items[0]!]: { status: 'NOK' } }, { state: 'in_progress' });
    const none = await exportCsv();
    expect((none.body as string).split('\r\n')).toHaveLength(2); // header and the final line break
    const response = await exportCsv({ from: '2026-01-01', includeInProgress: 'true' });
    expect((response.body as string).split('\r\n')).toHaveLength(3);
    expect(response.headers).toMatchObject({
      'Content-Disposition': expect.stringMatching(
        /^attachment; filename="Deviations 2026-01-01 to \d{4}-\d{2}-\d{2}, incl\. in progress\.csv"$/,
      ),
    });
  });
});
