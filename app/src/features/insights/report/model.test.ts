import type { DeviationRow, Insights, InsightsQuery } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { buildReport, periodText, reportFileName, type ReportInput } from './model';

describe('periodText', () => {
  it('names whole months by their months', () => {
    expect(periodText({ from: '2026-10-01', to: '2026-10-31' })).toBe('2026-10');
    expect(periodText({ from: '2024-02-01', to: '2024-02-29' })).toBe('2024-02');
    expect(periodText({ from: '2026-01-01', to: '2026-10-31' })).toBe('2026-01 – 2026-10');
    expect(periodText({ from: '2025-01-01', to: '2025-12-31' })).toBe('2025-01 – 2025-12');
  });

  it('gives the dates of anything else', () => {
    expect(periodText({ from: '2025-12-01', to: '2026-11-05' })).toBe('2025-12-01 – 2026-11-05');
    expect(periodText({ from: '2026-10-02', to: '2026-10-31' })).toBe('2026-10-02 – 2026-10-31');
    // 2025 is no leap year: the 28th ends February, the 29th doesn't exist to end it.
    expect(periodText({ from: '2025-02-01', to: '2025-02-27' })).toBe('2025-02-01 – 2025-02-27');
  });

  it('says so when an end is open, or both', () => {
    expect(periodText({ from: '2026-01-01' })).toBe('From 2026-01-01');
    expect(periodText({ to: '2026-10-31' })).toBe('Up to 2026-10-31');
    expect(periodText({})).toBe('All time');
  });
});

describe('reportFileName', () => {
  const query = (patch: Partial<InsightsQuery>): InsightsQuery => ({
    includeInProgress: false,
    ...patch,
  });

  it('names the filters, as the CSV export names its file', () => {
    expect(reportFileName(query({ from: '2026-01-01', to: '2026-10-30', model: 'RMMG' }), '')).toBe(
      'Deviation report 2026-01-01 to 2026-10-30, RMMG',
    );
    expect(reportFileName(query({}), '2026-11-05')).toBe('Deviation report start to 2026-11-05');
    expect(
      reportFileName(query({ from: '2026-03-01', includeInProgress: true }), '2026-11-05'),
    ).toBe('Deviation report 2026-03-01 to 2026-11-05, incl. in progress');
  });

  it('names whole months by their months', () => {
    expect(reportFileName(query({ from: '2026-10-01', to: '2026-10-31', model: 'RMMG' }), '')).toBe(
      'Deviation report 2026-10, RMMG',
    );
    expect(reportFileName(query({ from: '2026-01-01', to: '2026-06-30' }), '')).toBe(
      'Deviation report 2026-01 to 2026-06',
    );
  });
});

// ---------------------------------------------------------------------------------------------

function insights(patch: Partial<Insights> = {}): Insights {
  return {
    modelCodes: ['RMMG', 'RMHS'],
    checkNames: [],
    firstInspectionDate: '2026-09-02',
    inspections: { finalised: 4, inProgress: 0 },
    deviations: 10,
    rows: { ok: 90, nok: 10, na: 4 },
    perMonth: [
      { month: '2026-09', inspections: 1, deviations: 2 },
      { month: '2026-10', inspections: 3, deviations: 8 },
    ],
    perSection: [
      { title: 'Loading area', deviations: 6 },
      { title: '', deviations: 2 },
      { title: null, deviations: 2 },
    ],
    perModel: [
      { modelCode: 'RMMG', inspections: 3, deviations: 10 },
      { modelCode: 'RMHS', inspections: 1, deviations: 0 },
    ],
    bySeverity: { minor: 5, major: 4, critical: 1 },
    topCheckpoints: [
      {
        itemId: 'a',
        modelCode: 'RMMG',
        ref: '1.a',
        text: 'Lifting columns - Marked',
        sectionTitle: 'Loading area',
        removed: false,
        failed: 3,
        inspections: 4,
      },
      {
        itemId: 'b',
        modelCode: 'RMHS',
        ref: '2.c',
        text: 'Door - Closes',
        sectionTitle: '',
        removed: true,
        failed: 1,
        inspections: 1,
      },
    ],
    byResp: [
      { resp: 'Mechanical', deviations: 8 },
      { resp: '', deviations: 2 },
    ],
    byCategory: [
      { category: 'Leakage', deviations: 5 },
      { category: '', deviations: 5 },
    ],
    unreadableRows: 0,
    ...patch,
  };
}

function row(patch: Partial<DeviationRow>): DeviationRow {
  return {
    kind: 'final',
    inspectionId: 'i1',
    inspectionNumber: 'FI-2026-0001',
    serialNumber: ' SN-1 ',
    machineName: ' Volvo Skövde ',
    modelCode: 'RMMG',
    templateId: 't1',
    templateRevision: 2,
    itemId: 'a',
    sectionTitle: 'Loading area',
    displayRef: '1.a',
    checkpointText: 'Lifting columns - Marked',
    comment: ' Blue mark missing ',
    resp: 'Mechanical',
    severity: 'major',
    category: 'Leakage',
    inspectionDate: '2026-10-07',
    finalised: true,
    createdAt: '2026-10-07T08:00:00.000Z',
    checkName: 'Final inspection – RigiMill MG',
    ...patch,
  };
}

const MODELS = [
  { code: 'RMMG', name: 'RigiMill MG' },
  { code: 'RMHS', name: 'RigiMill HS' },
];

function input(patch: Partial<ReportInput> = {}): ReportInput {
  return {
    query: { from: '2025-12-01', to: '2026-11-05', includeInProgress: false },
    period: 'last12',
    insights: insights(),
    models: MODELS,
    companyName: 'Modig Machine Tool',
    generatedAt: '2026-11-05T13:32:00.000Z',
    generatedBy: 'Anna Andersson',
    deviations: null,
    today: '2026-11-05',
    ...patch,
  };
}

describe('buildReport', () => {
  it('states what it covers, and when and by whom it was made', () => {
    const report = buildReport(input());
    expect(report.title).toBe('Deviation report');
    expect(report.period).toBe('2025-12-01 – 2026-11-05');
    expect(report.subject).toBe('Deviation report · 2025-12-01 – 2026-11-05 · All models');
    expect(report.fileName).toBe('Deviation report 2025-12-01 to 2026-11-05');
    expect(report.facts.map(({ label }) => label)).toEqual([
      'Period',
      'Model',
      'Inspections',
      'Generated',
    ]);
    expect(report.facts[0]!.value).toBe('2025-12-01 – 2026-11-05 (last 12 months)');
    expect(report.facts[1]!.value).toBe('All models');
    expect(report.facts[2]!.value).toBe('Finalised only');
    expect(report.facts[3]!.value).toMatch(/^2026-11-05 \d\d:32 by Anna Andersson$/);
  });

  it('names a model and inspections in progress; a fixed period has no name after it', () => {
    const report = buildReport(
      input({
        query: { from: '2026-10-01', to: '2026-10-31', model: 'RMMG', includeInProgress: true },
        period: 'custom',
      }),
    );
    expect(report.subject).toBe('Deviation report · 2026-10 · RigiMill MG · incl. in progress');
    expect(report.facts.slice(0, 3).map(({ value }) => value)).toEqual([
      '2026-10',
      'RigiMill MG',
      'Finalised and in progress',
    ]);
    expect(report.fileName).toBe('Deviation report 2026-10, RMMG, incl. in progress');
  });

  it('says a quality checks’ report is one, which check it covers, and counts checks', () => {
    const report = buildReport(
      input({
        query: {
          kind: 'quality',
          from: '2026-10-01',
          to: '2026-10-31',
          model: 'RMMG',
          check: 'Quality check – Pre start up',
          includeInProgress: false,
        },
        period: 'month',
        deviations: [
          row({
            kind: 'quality',
            inspectionNumber: 'QC-2026-0003',
            machineName: 'Magellan#1',
            checkName: 'Quality check – Pre start up',
          }),
          // Started before quality checks had a Machine ID.
          row({
            kind: 'quality',
            inspectionId: 'older',
            inspectionNumber: 'QC-2026-0001',
            machineName: '',
            checkName: 'Quality check – Pre start up',
          }),
        ],
      }),
    );
    expect(report.title).toBe('Quality check deviation report');
    expect(report.subject).toBe(
      'Quality check deviation report · 2026-10 · RigiMill MG · Pre start up',
    );
    expect(report.fileName).toBe('Quality check deviation report 2026-10, RMMG, Pre start up');
    expect(report.facts.map(({ label, value }) => [label, value]).slice(0, 4)).toEqual([
      ['Period', '2026-10'],
      ['Model', 'RigiMill MG'],
      ['Quality check', 'Quality check – Pre start up'],
      ['Quality checks', 'Finalised only'],
    ]);
    expect(report.kpis.map(({ label }) => label)).toEqual([
      'Quality checks finalised',
      'Deviations',
      'Deviations per check',
      'First-pass rate',
    ]);
    expect(report.kpis[2]!.detail).toBe('Average per quality check');
    // Each check's deviations under its number, Machine ID and title.
    expect(report.list?.groups.map(({ number, machine }) => ({ number, machine }))).toEqual([
      { number: 'QC-2026-0003', machine: 'Magellan#1 · Quality check – Pre start up' },
      { number: 'QC-2026-0001', machine: 'Quality check – Pre start up' },
    ]);
    // Every quality check when none is picked.
    const all = buildReport(input({ query: { kind: 'quality', includeInProgress: true } }));
    expect(all.facts[2]).toEqual({ label: 'Quality check', value: 'All quality checks' });
    expect(all.facts[3]).toEqual({ label: 'Quality checks', value: 'Finalised and in progress' });
  });

  it('has the KPI tiles’ figures and words', () => {
    expect(buildReport(input()).kpis).toEqual([
      {
        label: 'Inspections finalised',
        value: '4',
        detail: 'Machines inspected in the period',
      },
      { label: 'Deviations', value: '10', detail: 'NOK rows and extra deviations' },
      { label: 'Deviations per machine', value: '2.5', detail: 'Average per inspection' },
      {
        label: 'First-pass rate',
        value: '90.0%',
        detail: '90 of 100 checked rows OK (N/A not counted)',
      },
    ]);
    const withInProgress = buildReport(
      input({ insights: insights({ inspections: { finalised: 4, inProgress: 1 } }) }),
    );
    expect(withInProgress.kpis[0]).toEqual({
      label: 'Inspections',
      value: '5',
      detail: '4 finalised · 1 in progress',
    });
    const nothingChecked = buildReport(
      input({ insights: insights({ rows: { ok: 0, nok: 0, na: 3 } }) }),
    );
    expect(nothingChecked.kpis[3]).toMatchObject({ value: '–', detail: 'No rows checked yet' });
  });

  it('ranks with shares of every deviation and bars against the largest', () => {
    const report = buildReport(input());
    expect(
      report.severity.map(({ label, value, share, bar }) => [label, value, share, bar]),
    ).toEqual([
      ['Minor', 5, 0.5, 1],
      ['Major', 4, 0.4, 0.8],
      ['Critical', 1, 0.1, 0.2],
    ]);
    expect(report.sections.map(({ label, note, share }) => [label, note, share])).toEqual([
      ['Loading area', undefined, 0.6],
      ['Untitled section', undefined, 0.2],
      ['Extra deviations', '(not tied to a row)', 0.2],
    ]);
    expect(report.resps.map(({ label }) => label)).toEqual(['Mechanical', 'Not assigned']);
    expect(report.categories.map(({ label }) => label)).toEqual(['Leakage', 'No category']);
    expect(
      report.models.map(({ label, inspections, value, perInspection, share, bar }) => [
        label,
        inspections,
        value,
        perInspection,
        share,
        bar,
      ]),
    ).toEqual([
      ['RigiMill MG', 3, 10, 10 / 3, 1, 1],
      ['RigiMill HS', 1, 0, 0, 0, 0],
    ]);
  });

  it('lists the top checkpoints with their share of the inspections that had them', () => {
    const report = buildReport(input());
    expect(report.showModel).toBe(true);
    expect(report.top).toEqual([
      {
        key: 'a',
        rank: 1,
        ref: '1.a',
        text: 'Lifting columns - Marked',
        section: 'Loading area',
        removed: false,
        model: 'RigiMill MG',
        failed: 3,
        inspections: 4,
        share: 0.75,
      },
      expect.objectContaining({ rank: 2, section: 'Untitled section', removed: true, share: 1 }),
    ]);
    // A model is chosen, or the selection has one: refs don't repeat across models.
    const oneModel = { from: '2026-01-01', model: 'RMMG', includeInProgress: false };
    expect(buildReport(input({ query: oneModel })).showModel).toBe(false);
    const single = insights({ perModel: [{ modelCode: 'RMMG', inspections: 4, deviations: 10 }] });
    expect(buildReport(input({ insights: single })).showModel).toBe(false);
  });

  it('says when nothing matches, and when records could not be read', () => {
    const none = insights({
      inspections: { finalised: 0, inProgress: 0 },
      deviations: 0,
      perMonth: [],
      perModel: [],
    });
    expect(buildReport(input({ insights: none })).empty).toBe(true);
    expect(buildReport(input()).empty).toBe(false);
    expect(buildReport(input()).unreadable).toBeNull();
    expect(buildReport(input({ insights: insights({ unreadableRows: 1 }) })).unreadable).toBe(
      '1 deviation record could not be read and is not counted, so these numbers may be too low.',
    );
    expect(buildReport(input({ insights: insights({ unreadableRows: 3 }) })).unreadable).toBe(
      '3 deviation records could not be read and are not counted, so these numbers may be too low.',
    );
  });

  it('groups the deviation list by inspection, in the order the rows come', () => {
    const rows = [
      row({}),
      row({ itemId: '', displayRef: '—', checkpointText: 'Scratch', comment: '' }),
      row({
        inspectionId: 'i2',
        inspectionNumber: 'FI-2026-0002',
        inspectionDate: '2026-10-09',
        modelCode: 'RMHS',
        machineName: 'RigiMill HS',
        finalised: false,
        severity: 'critical',
        category: '',
        resp: '',
      }),
    ];
    const report = buildReport(input({ deviations: rows }));
    expect(report.list?.count).toBe(3);
    expect(report.list?.groups).toEqual([
      {
        key: 'i1',
        number: 'FI-2026-0001',
        date: '2026-10-07',
        model: 'RigiMill MG',
        machine: 'Volvo Skövde',
        serialNumber: 'SN-1',
        finalised: true,
        rows: [
          {
            key: 'a',
            ref: '1.a',
            extra: false,
            text: 'Lifting columns - Marked',
            comment: 'Blue mark missing',
            severity: 'major',
            category: 'Leakage',
            resp: 'Mechanical',
          },
          expect.objectContaining({ ref: '—', extra: true, text: 'Scratch', comment: '' }),
        ],
      },
      expect.objectContaining({
        number: 'FI-2026-0002',
        model: 'RigiMill HS',
        finalised: false,
        rows: [expect.objectContaining({ severity: 'critical', category: '', resp: '' })],
      }),
    ]);
  });

  it('has no list unless it is asked for and has something to list', () => {
    expect(buildReport(input()).list).toBeNull();
    const noDeviations = insights({ deviations: 0 });
    expect(buildReport(input({ insights: noDeviations, deviations: [] })).list).toBeNull();
  });
});
