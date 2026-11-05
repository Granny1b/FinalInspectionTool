import { describe, expect, it } from 'vitest';
import {
  aggregateInsights,
  compareRefs,
  deviationsPerInspection,
  firstPassRate,
  insightsQueryParams,
  monthsBetween,
  parseInsightsQuery,
  TOP_CHECKPOINTS,
  type ChecklistLookup,
  type CurrentCheckpoint,
  type InsightsInspection,
  type InsightsQuery,
} from './insights';
import type { DeviationRow } from './schemas';

const ALL: InsightsQuery = { includeInProgress: true };
const FINALISED: InsightsQuery = { includeInProgress: false };

function inspection(id: string, patch: Partial<InsightsInspection> = {}): InsightsInspection {
  return {
    id,
    number: `FI-2026-${id.padStart(4, '0')}`,
    modelCode: 'RMMG',
    date: '2026-10-07',
    state: 'finalised',
    filled: 10,
    okCount: 8,
    nokCount: 1,
    templateId: 'tplMG',
    templateRevision: 2,
    ...patch,
  };
}

function row(inspectionId: string, patch: Partial<DeviationRow> = {}): DeviationRow {
  return {
    inspectionId,
    inspectionNumber: `FI-2026-${inspectionId.padStart(4, '0')}`,
    serialNumber: 'SN-1',
    machineName: 'RigiMill MG',
    modelCode: 'RMMG',
    templateId: 'tplMG',
    templateRevision: 2,
    itemId: 'i1',
    sectionTitle: 'Loading area',
    displayRef: '1.a',
    checkpointText: 'Lifting columns - Marked screws',
    comment: '',
    resp: '',
    severity: 'minor',
    category: '',
    inspectionDate: '2026-10-07',
    finalised: true,
    createdAt: '2026-10-07T08:00:00.000Z',
    ...patch,
  };
}

/** Revision 1 of tplMG has i1 and i2; revision 2 adds i3. */
const REVISIONS: Record<string, string[]> = {
  'tplMG/1': ['i1', 'i2'],
  'tplMG/2': ['i1', 'i2', 'i3'],
  'tplMT/1': ['m1'],
};
const CURRENT: Record<string, CurrentCheckpoint> = {
  'tplMG/i1': {
    ref: '2.a',
    text: 'Lifting columns - Marked screws, blue/red',
    sectionTitle: 'Gantry',
  },
  'tplMG/i3': { ref: '1.c', text: 'Safety fence - Closed', sectionTitle: 'Loading area' },
};
const checklists: ChecklistLookup = {
  itemIds: (templateId, revision) => {
    const ids = REVISIONS[`${templateId}/${revision}`];
    return ids && new Set(ids);
  },
  current: (templateId, itemId) => CURRENT[`${templateId}/${itemId}`],
};

const aggregate = (
  query: InsightsQuery,
  inspections: InsightsInspection[],
  deviations: DeviationRow[] = [],
) => aggregateInsights({ query, inspections, deviations, checklists });

describe('parseInsightsQuery', () => {
  /** A query string's parameters (shared has no DOM or Node types, so no URLSearchParams). */
  const params = (values: Record<string, string>) => ({
    get: (name: string) => values[name] ?? null,
  });
  const parse = (values: Record<string, string>) => parseInsightsQuery(params(values));

  it('reads every filter, and nothing when none is given', () => {
    expect(parse({})).toEqual({ success: true, data: { includeInProgress: false } });
    expect(
      parse({ from: '2026-01-01', to: '2026-12-31', model: 'RMMG', includeInProgress: 'true' }),
    ).toEqual({
      success: true,
      data: { from: '2026-01-01', to: '2026-12-31', model: 'RMMG', includeInProgress: true },
    });
  });

  it('treats empty values as not given', () => {
    expect(parse({ from: '', to: '', model: '', includeInProgress: '' })).toEqual({
      success: true,
      data: { includeInProgress: false },
    });
  });

  it.each([
    ['a date that is not one', { from: '2026-02-30' }],
    ['a date before 2000', { from: '1999-12-31' }],
    ['a date after 2099', { to: '2100-01-01' }],
    ['a start after the end', { from: '2026-10-02', to: '2026-10-01' }],
    ['a model code with a slash', { model: 'RM/MG' }],
    ['a flag that is not true or false', { includeInProgress: 'yes' }],
  ])('refuses %s', (_case, values) => {
    expect(parse(values).success).toBe(false);
  });

  it('round-trips through the URL, leaving out the filters not in use', () => {
    const query = { from: '2026-01-01', model: 'RMMG', includeInProgress: false };
    expect(insightsQueryParams(query)).toEqual({ from: '2026-01-01', model: 'RMMG' });
    expect(parse(insightsQueryParams(query))).toEqual({ success: true, data: query });
    expect(insightsQueryParams(ALL)).toEqual({ includeInProgress: 'true' });
  });
});

describe('monthsBetween', () => {
  it('lists every month of the range, across New Year', () => {
    expect(monthsBetween('2025-11-30', '2026-02-01')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(monthsBetween('2026-10-01', '2026-10-31')).toEqual(['2026-10']);
    expect(monthsBetween('2026-10-01', '2026-09-30')).toEqual([]);
  });
});

describe('compareRefs', () => {
  it('sorts refs in checklist order, an extra deviation last', () => {
    const refs = ['10.a', '—', '1.aa', '2.b', '1.z', '1.b'];
    expect(refs.sort(compareRefs)).toEqual(['1.b', '1.z', '1.aa', '2.b', '10.a', '—']);
  });
});

describe('aggregateInsights', () => {
  it('counts only finalised inspections unless in-progress ones are included', () => {
    const inspections = [
      inspection('1'),
      inspection('2', { state: 'in_progress', filled: 4, okCount: 2, nokCount: 2 }),
    ];
    const deviations = [row('1'), row('2'), row('2', { itemId: 'i2' })];

    const finalised = aggregate(FINALISED, inspections, deviations);
    expect(finalised.inspections).toEqual({ finalised: 1, inProgress: 0 });
    expect(finalised.deviations).toBe(1);
    expect(finalised.rows).toEqual({ ok: 8, nok: 1, na: 1 });

    const all = aggregate(ALL, inspections, deviations);
    expect(all.inspections).toEqual({ finalised: 1, inProgress: 1 });
    expect(all.deviations).toBe(3);
    expect(all.rows).toEqual({ ok: 10, nok: 3, na: 1 });
  });

  it('filters by the front-page date, both ends included, and by model', () => {
    const inspections = [
      inspection('1', { date: '2026-01-01' }),
      inspection('2', { date: '2026-03-31' }),
      inspection('3', { date: '2026-04-01' }),
      inspection('4', { date: '2026-02-10', modelCode: 'RMMT', templateId: 'tplMT' }),
    ];
    const inRange = aggregate(
      { from: '2026-01-01', to: '2026-03-31', includeInProgress: false },
      inspections,
    );
    expect(inRange.inspections.finalised).toBe(3);
    const oneModel = aggregate({ model: 'RMMT', includeInProgress: false }, inspections);
    expect(oneModel.inspections.finalised).toBe(1);
    // The model filter's choices never depend on the filters.
    expect(oneModel.modelCodes).toEqual(['RMMG', 'RMMT']);
  });

  it('gives the earliest inspection date whatever the filters, for the month filter', () => {
    const inspections = [
      inspection('1', { date: '2026-03-31' }),
      inspection('2', { date: '2025-11-02', state: 'in_progress', modelCode: 'RMMT' }),
      inspection('3', { date: '2026-01-15' }),
    ];
    const filtered = aggregate(
      { from: '2026-03-01', to: '2026-03-31', model: 'RMMG', includeInProgress: false },
      inspections,
    );
    expect(filtered.firstInspectionDate).toBe('2025-11-02');
    expect(aggregate(ALL, []).firstInspectionDate).toBeNull();
  });

  it('ignores deviation rows of inspections it does not know', () => {
    const result = aggregate(ALL, [inspection('1')], [row('1'), row('gone')]);
    expect(result.deviations).toBe(1);
    expect(result.topCheckpoints.map((checkpoint) => checkpoint.failed)).toEqual([1]);
  });

  it('counts per month over the whole range, empty months included', () => {
    const result = aggregate(
      { from: '2026-01-15', to: '2026-04-30', includeInProgress: false },
      [
        inspection('1', { date: '2026-01-20' }),
        inspection('2', { date: '2026-03-02' }),
        inspection('3', { date: '2026-03-28' }),
      ],
      [row('1'), row('2'), row('2', { itemId: 'i2' }), row('3', { inspectionDate: '2026-12-01' })],
    );
    expect(result.perMonth).toEqual([
      { month: '2026-01', inspections: 1, deviations: 1 },
      { month: '2026-02', inspections: 0, deviations: 0 },
      // A row counts in its inspection's month, whatever the row says.
      { month: '2026-03', inspections: 2, deviations: 3 },
      { month: '2026-04', inspections: 0, deviations: 0 },
    ]);
  });

  it('runs the months from the first to the last inspection when the range is open', () => {
    const inspections = [
      inspection('1', { date: '2025-12-05' }),
      inspection('2', { date: '2026-02-01' }),
    ];
    expect(aggregate(FINALISED, inspections).perMonth.map((m) => m.month)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(
      aggregate({ to: '2026-03-10', includeInProgress: false }, inspections).perMonth.map(
        (m) => m.month,
      ),
    ).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
    expect(aggregate(FINALISED, []).perMonth).toEqual([]);
  });

  it('groups sections and resps ignoring case and spaces, extra deviations apart', () => {
    const deviations = [
      row('1', { sectionTitle: 'Loading area', resp: 'Mechanics' }),
      row('1', { itemId: 'i2', sectionTitle: 'loading area ', resp: ' mechanics' }),
      row('1', { itemId: 'i3', sectionTitle: 'Loading area', resp: 'Electrical' }),
      row('1', { itemId: '', displayRef: '—', sectionTitle: '', resp: '' }),
      row('1', { itemId: 'i4', sectionTitle: 'Gantry', resp: '' }),
    ];
    const result = aggregate(ALL, [inspection('1')], deviations);
    expect(result.perSection).toEqual([
      { title: 'Loading area', deviations: 3 },
      { title: 'Gantry', deviations: 1 },
      { title: null, deviations: 1 },
    ]);
    expect(result.byResp).toEqual([
      { resp: 'Mechanics', deviations: 2 },
      { resp: 'Electrical', deviations: 1 },
      { resp: '', deviations: 2 },
    ]);
  });

  it('groups categories like resps: trimmed, ignoring case, uncategorised last', () => {
    const deviations = [
      row('1', { category: 'Missing parts' }),
      row('1', { itemId: 'i2', category: 'Leakage' }),
      row('1', { itemId: 'i3', category: 'missing parts ' }),
      row('1', { itemId: '', displayRef: '—', sectionTitle: '', category: 'Missing parts' }),
      row('1', { itemId: 'i4', category: '' }),
      row('1', { itemId: 'i5', category: '' }),
      row('1', { itemId: 'i6', category: 'Cleanliness' }),
      // Out of scope: not counted.
      row('9', { category: 'Leakage' }),
    ];
    expect(aggregate(ALL, [inspection('1')], deviations).byCategory).toEqual([
      { category: 'Missing parts', deviations: 3 },
      // A tie is alphabetical.
      { category: 'Cleanliness', deviations: 1 },
      { category: 'Leakage', deviations: 1 },
      { category: '', deviations: 2 },
    ]);
    expect(aggregate(ALL, [inspection('1')]).byCategory).toEqual([]);
  });

  it('lists every model in scope, with or without deviations, and splits by severity', () => {
    const result = aggregate(
      ALL,
      [
        inspection('1'),
        inspection('2'),
        inspection('3', { modelCode: 'RMMT', templateId: 'tplMT', templateRevision: 1 }),
      ],
      [
        row('1', { severity: 'critical' }),
        row('2', { severity: 'major' }),
        row('2', { itemId: 'i2' }),
      ],
    );
    expect(result.perModel).toEqual([
      { modelCode: 'RMMG', inspections: 2, deviations: 3 },
      { modelCode: 'RMMT', inspections: 1, deviations: 0 },
    ]);
    expect(result.bySeverity).toEqual({ minor: 1, major: 1, critical: 1 });
  });

  it('ranks checkpoints by failures, against the inspections whose checklist had them', () => {
    const inspections = [
      inspection('1', { templateRevision: 1 }),
      inspection('2', { templateRevision: 1 }),
      inspection('3'),
      inspection('4'),
    ];
    const deviations = [
      // i1 fails in three of the four inspections.
      row('1', { displayRef: '1.a' }),
      row('2', { displayRef: '1.a' }),
      row('3', { displayRef: '1.a' }),
      // i3 exists from revision 2 only: it failed in both inspections that had it.
      row('3', { itemId: 'i3', displayRef: '1.c' }),
      row('4', { itemId: 'i3', displayRef: '1.c' }),
      // i2 was removed after these inspections; it is shown as it was last inspected.
      row('1', {
        itemId: 'i2',
        displayRef: '1.b',
        checkpointText: 'Old text',
        sectionTitle: 'Old',
      }),
      row('4', {
        itemId: 'i2',
        displayRef: '1.b',
        checkpointText: 'Last text',
        sectionTitle: 'Area',
      }),
    ];
    expect(aggregate(ALL, inspections, deviations).topCheckpoints).toEqual([
      {
        itemId: 'i1',
        modelCode: 'RMMG',
        ref: '2.a',
        text: 'Lifting columns - Marked screws, blue/red',
        sectionTitle: 'Gantry',
        removed: false,
        failed: 3,
        inspections: 4,
      },
      {
        itemId: 'i3',
        modelCode: 'RMMG',
        ref: '1.c',
        text: 'Safety fence - Closed',
        sectionTitle: 'Loading area',
        removed: false,
        failed: 2,
        inspections: 2,
      },
      {
        itemId: 'i2',
        modelCode: 'RMMG',
        ref: '1.b',
        text: 'Last text',
        sectionTitle: 'Area',
        removed: true,
        failed: 2,
        inspections: 4,
      },
    ]);
  });

  it('counts the template’s inspections when a revision cannot be read', () => {
    const inspections = [
      inspection('1', { templateRevision: 9 }),
      inspection('2', { templateRevision: 9 }),
      inspection('3', { modelCode: 'RMMT', templateId: 'tplMT', templateRevision: 1 }),
    ];
    const [top] = aggregate(ALL, inspections, [row('1', { templateRevision: 9 })]).topCheckpoints;
    expect(top).toMatchObject({ itemId: 'i1', failed: 1, inspections: 2 });
  });

  it('lists at most ten checkpoints and leaves extra deviations out', () => {
    const inspections = [inspection('1')];
    const deviations = Array.from({ length: 12 }, (_, index) =>
      row('1', { itemId: `x${index}`, displayRef: `1.${String.fromCharCode(97 + index)}` }),
    );
    deviations.push(row('1', { itemId: '', displayRef: '—' }));
    const top = aggregate(ALL, inspections, deviations).topCheckpoints;
    expect(top).toHaveLength(TOP_CHECKPOINTS);
    // Equal failures and shares: checklist order.
    expect(top.map((checkpoint) => checkpoint.ref).slice(0, 3)).toEqual(['1.a', '1.b', '1.c']);
  });
});

describe('derived KPIs', () => {
  it('first-pass rate: OK rows among checked rows, N/A left out', () => {
    expect(firstPassRate({ ok: 87, nok: 3, na: 10 })).toBeCloseTo(87 / 90);
    expect(firstPassRate({ ok: 0, nok: 0, na: 5 })).toBeNull();
  });

  it('deviations per inspection in scope', () => {
    expect(
      deviationsPerInspection({ inspections: { finalised: 3, inProgress: 1 }, deviations: 6 }),
    ).toBe(1.5);
    expect(
      deviationsPerInspection({ inspections: { finalised: 0, inProgress: 0 }, deviations: 0 }),
    ).toBeNull();
  });
});
