import { deriveDeviations, type FollowUp, type Inspection, type Section } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { formatDateTime } from '../../../lib/format';
import { defaultDeviationsPerPage, NOT_FINALISED_MARKER } from '../model';
import { appendixCount, printoutImageIds } from '../printout';
import { qualityCheckPrint, qualityImageIds, type QualityPrintModel } from './model';

const CONTEXT = {
  companyName: 'Modig Machine Tool',
  modelLabel: 'RigiMill MG',
  personName: (email: string) => (email === 'anna@modig.se' ? 'Anna Andersson' : email),
};

/** 16-character ids, as the schemas want them: "Item000000000007". */
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(16 - prefix.length, '0')}`;

const SECTIONS: Section[] = [
  {
    id: id('Sect', 1),
    title: 'Safety features',
    items: [
      {
        id: id('Item', 1),
        text: 'Check and verify safety decals on balancing tubes.',
        how: 'Should be visible and not turned inward.',
        references: ['ISO 12100', 'ISO 7010'],
        timeHours: 0.2,
        // Pictures are for the app: never printed.
        guide: { images: [{ imageId: id('Gide', 1), annotations: [], verdict: 'good' }] },
      },
      { id: id('Item', 2), text: 'Warning signs inside the cabinet.', timeHours: 0.1 },
    ],
  },
  {
    id: id('Sect', 2),
    title: '  Electrical cabinet ',
    items: [
      { id: id('Item', 3), text: 'Cable glands tight.', references: ['IEC 60204-1'] },
      { id: id('Item', 4), text: 'Door switch works.', timeHours: 0.5 },
    ],
  },
];

/**
 * The quality check's front page as frozen in older checks, with the typed document number, made
 * by and date the schema no longer has. Not a literal at its place in the inspection, so the
 * extra fields typecheck: the printout must not show them even if they reach it.
 */
const QUALITY_FRONT = {
  name: 'Pre start up',
  department: 'Quality',
  documentNumber: '1.22.2',
  madeBy: 'Sam Andersson',
  date: '2026-11-05',
};

function check(patch: Partial<Inspection> = {}): Inspection {
  return {
    id: 'Insp000000000004',
    kind: 'quality',
    number: 'QC-2026-0004',
    templateId: 'Tmpl000000000002',
    templateRevision: 2,
    templateSnapshot: {
      name: 'Quality check – Pre start up',
      sections: SECTIONS,
      quality: QUALITY_FRONT,
    },
    front: {
      machineName: 'Magellan#2',
      modelCode: 'RMMG',
      serialNumber: 'RM-2026-031',
      participants: ['Erik Lund', 'Sam Andersson'],
      location: '',
      date: '2026-11-06',
    },
    results: {
      [id('Item', 1)]: {
        status: 'NOK',
        comment: '  Decal on the left tube turned inward ',
        severity: 'major',
        resp: 'Assembly',
        category: 'Wrong assembly',
        photos: [
          {
            imageId: id('Phot', 1),
            renderedImageId: id('Rend', 1),
            caption: 'Left tube',
            annotations: [],
          },
        ],
      },
      [id('Item', 2)]: { status: 'OK', comment: 'Fine' },
      [id('Item', 3)]: { status: 'NA' },
      [id('Item', 4)]: { status: 'NOK' },
    },
    extraDeviations: [
      {
        id: id('Extr', 1),
        description: 'Scratch on the guard door',
        severity: 'minor',
        resp: 'Paint',
        photos: [{ imageId: id('Phot', 2), annotations: [] }],
      },
    ],
    state: 'finalised',
    finalisedAt: '2026-11-06T13:32:00.000Z',
    finalisedBy: 'anna@modig.se',
    createdAt: '2026-11-06T08:00:00.000Z',
    createdBy: 'sam@modig.se',
    updatedAt: '2026-11-06T13:32:00.000Z',
    updatedBy: 'anna@modig.se',
    ...patch,
  };
}

const report = (patch?: Partial<Inspection>) => qualityCheckPrint(check(patch), 'report', CONTEXT);

/** The cards of a model that has them. */
function cardsOf(model: QualityPrintModel) {
  if (model.deviations.kind !== 'cards') throw new Error('This printout has no deviation cards');
  return model.deviations.cards;
}
const values = (fields: { label: string; value: string }[]) =>
  Object.fromEntries(fields.map(({ label, value }) => [label, value]));

describe('a quality check’s entire report', () => {
  const model = report();

  it('is a quality check’s document, in the mode asked for', () => {
    expect(model.document).toBe('quality');
    expect(model.mode).toBe('report');
  });

  it('fills the front page: the check, the machine, its department and the revision', () => {
    const { front } = model;
    expect(front.companyName).toBe('Modig Machine Tool');
    expect(front.number).toBe('QC-2026-0004');
    expect(front.title).toBe('Quality check – Pre start up');
    // The machine first, Machine ID leading.
    expect(front.fields).toEqual([
      { label: 'Machine ID', value: 'Magellan#2' },
      { label: 'Machine model', value: 'RigiMill MG' },
      { label: 'Serial number', value: 'RM-2026-031' },
      { label: 'Date', value: '2026-11-06' },
      { label: 'Checked by', value: 'Erik Lund, Sam Andersson' },
      { label: 'Department', value: 'Quality' },
    ]);
    // As on a final report; the toolbar and the checklist's heading say "Rev 2".
    expect(front.revision).toBe('Rev: 2');
    expect(model.revisionLabel).toBe('Rev 2');
    expect(front.state).toEqual({
      finalised: true,
      text: `Finalised ${formatDateTime('2026-11-06T13:32:00.000Z')} by Anna Andersson`,
    });
    expect(front.size).toBe('2 sections · 4 rows · 0.8 h');
  });

  it('prints no typed document number, made by or date of the quality check', () => {
    const printed = JSON.stringify(model);
    expect(printed).not.toContain('1.22.2');
    expect(printed).not.toContain('Document no.');
    expect(printed).not.toContain('2026-11-05');
    expect(model.front.fields.map((field) => field.label)).not.toContain('Made by');
  });

  it('sums up the rows by status and counts the deviations, extra ones included', () => {
    expect(model.front.counts).toEqual([
      { label: 'Rows', value: 4 },
      { label: 'OK', value: 1 },
      { label: 'NOK', value: 2 },
      { label: 'N/A', value: 1 },
      { label: 'Deviations', value: 3 },
    ]);
  });

  it('prints every section with its rows and time, and each row with how and its references', () => {
    expect(model.checklistTitle).toBe('Quality check – Pre start up · Rev 2');
    expect(model.sections.map(({ number, title, stats }) => [number, title, stats])).toEqual([
      [1, 'Safety features', '2 rows · 0.3 h'],
      [2, 'Electrical cabinet', '2 rows · 0.5 h'],
    ]);
    expect(model.sections[0]!.rows).toEqual([
      {
        ref: '1.a',
        what: 'Check and verify safety decals on balancing tubes.',
        how: 'Should be visible and not turned inward.',
        references: ['ISO 12100', 'ISO 7010'],
        status: 'NOK',
        deviation: { number: 'D-01', severity: 'major' },
        comment: 'Decal on the left tube turned inward',
      },
      {
        ref: '1.b',
        what: 'Warning signs inside the cabinet.',
        how: '',
        references: [],
        status: 'OK',
        deviation: null,
        comment: 'Fine',
      },
    ]);
    // A NOK without a severity is Minor, as on its card; N/A has no card.
    expect(model.sections[1]!.rows.map((row) => [row.ref, row.status, row.deviation])).toEqual([
      ['2.a', 'NA', null],
      ['2.b', 'NOK', { number: 'D-02', severity: 'minor' }],
    ]);
  });

  it('has a card per deviation, NOK rows in checklist order and then the extra ones', () => {
    const cards = cardsOf(model);
    expect(cards.map((card) => [card.number, card.ref, card.text])).toEqual([
      ['D-01', '1.a', 'Check and verify safety decals on balancing tubes.'],
      ['D-02', '2.b', 'Door switch works.'],
      ['D-03', null, 'Scratch on the guard door'],
    ]);
    expect(cards[0]).toEqual({
      number: 'D-01',
      ref: '1.a',
      sectionTitle: 'Safety features',
      text: 'Check and verify safety decals on balancing tubes.',
      comment: 'Decal on the left tube turned inward',
      severity: 'major',
      resp: 'Assembly',
      category: 'Wrong assembly',
      // The marked-up copy, as on a final report's card.
      photos: [{ imageId: id('Rend', 1), caption: 'Left tube' }],
    });
    expect(cards[2]).toMatchObject({ ref: null, sectionTitle: '', resp: 'Paint', category: '' });
  });

  it('ends with the instructions as the check has them, how and references with pictures', () => {
    expect(model.instructions?.map((section) => section.title)).toEqual([
      'Safety features',
      'Electrical cabinet',
    ]);
    expect(model.instructions?.[0]?.rows[0]).toMatchObject({
      ref: '1.a',
      what: 'Check and verify safety decals on balancing tubes.',
      how: 'Should be visible and not turned inward.',
      references: ['ISO 12100', 'ISO 7010'],
    });
  });

  it('loads the deviation photos and the instructions’ pictures: no machine photo, no appendix', () => {
    const photos = [id('Rend', 1), id('Phot', 2), id('Gide', 1)];
    expect(qualityImageIds(model)).toEqual(photos);
    expect(printoutImageIds(model, { appendix: true })).toEqual(photos);
    expect(appendixCount(model)).toBe(0);
    // Photos: two to a page, as a final report.
    expect(defaultDeviationsPerPage(model)).toBe(2);
  });

  it('names the check, its machine and its page in the footer, the subject and the file', () => {
    expect(model.footer).toBe(
      'QC-2026-0004 · Quality check – Pre start up · Magellan#2 · RigiMill MG · S/N RM-2026-031',
    );
    expect(model.subject).toBe(
      'QC-2026-0004 · Quality check – Pre start up · Magellan#2 · RigiMill MG',
    );
    expect(model.fileName).toBe(
      'QC-2026-0004 Magellan#2 RigiMill MG – Pre start up – Quality check report',
    );
  });
});

describe('a quality check in progress', () => {
  const model = report({
    state: 'in_progress',
    finalisedAt: undefined,
    finalisedBy: undefined,
    results: { [id('Item', 1)]: { status: 'OK' }, [id('Item', 3)]: { status: 'NOK' } },
    extraDeviations: [],
  });

  it('says it is not finalised, on the front page and on every page', () => {
    expect(model.front.state).toEqual({ finalised: false, text: NOT_FINALISED_MARKER });
    expect(model.footer).toMatch(/ · Not finalised$/);
    expect(model.fileName).toMatch(/ – Draft report$/);
  });

  it('counts the rows not filled yet and prints them without a status', () => {
    expect(
      values(model.front.counts.map(({ label, value }) => ({ label, value: `${value}` }))),
    ).toEqual({
      Rows: '4',
      OK: '1',
      NOK: '1',
      'N/A': '0',
      'Not filled': '2',
      Deviations: '1',
    });
    expect(model.sections.flatMap((section) => section.rows.map((row) => row.status))).toEqual([
      'OK',
      null,
      'NOK',
      null,
    ]);
  });
});

describe('only the deviations', () => {
  const model = qualityCheckPrint(check(), 'deviations', CONTEXT);

  it('has the short header and the same cards, without the instructions', () => {
    expect(model.mode).toBe('deviations');
    expect(model.instructions).toBeNull();
    expect(model.header).toEqual([
      { label: 'Machine ID', value: 'Magellan#2' },
      { label: 'Machine model', value: 'RigiMill MG' },
      { label: 'Serial number', value: 'RM-2026-031' },
      { label: 'Date', value: '2026-11-06' },
      { label: 'Checked by', value: 'Erik Lund, Sam Andersson' },
      { label: 'Deviations', value: '3' },
    ]);
    expect(cardsOf(model).map((card) => card.number)).toEqual(['D-01', 'D-02', 'D-03']);
    expect(cardsOf(model)).toEqual(cardsOf(report()));
  });

  it('is named as the deviations, with the same footer', () => {
    expect(model.fileName).toBe('QC-2026-0004 Magellan#2 RigiMill MG – Pre start up – Deviations');
    expect(model.footer).toBe(report().footer);
    expect(
      qualityCheckPrint(check({ state: 'in_progress' }), 'deviations', CONTEXT).fileName,
    ).toMatch(/ – Draft deviations$/);
  });
});

describe('only the checklist', () => {
  const model = qualityCheckPrint(check(), 'checklist', CONTEXT);

  it('has the short header with the result, the same checklist, and no cards or instructions', () => {
    expect(model.mode).toBe('checklist');
    expect(values(model.header)).toEqual({
      'Machine ID': 'Magellan#2',
      'Machine model': 'RigiMill MG',
      'Serial number': 'RM-2026-031',
      Date: '2026-11-06',
      'Checked by': 'Erik Lund, Sam Andersson',
      Result: '1 OK · 2 NOK · 1 N/A',
    });
    expect(model.sections).toEqual(report().sections);
    expect(model.deviations).toEqual({ kind: 'none' });
    expect(model.instructions).toBeNull();
    expect(qualityImageIds(model)).toEqual([]);
  });

  it('says how many rows are left while the check is being done, and is named the checklist', () => {
    const inProgress = qualityCheckPrint(
      check({ state: 'in_progress', results: { [id('Item', 1)]: { status: 'OK' } } }),
      'checklist',
      CONTEXT,
    );
    expect(values(inProgress.header)['Result']).toBe('1 OK · 0 NOK · 0 N/A · 3 not filled');
    expect(inProgress.fileName).toMatch(/ – Draft checklist$/);
    expect(model.fileName).toBe('QC-2026-0004 Magellan#2 RigiMill MG – Pre start up – Checklist');
  });
});

describe('deviations closed in the app', () => {
  const [first, , extra] = deriveDeviations(check());
  const closed = (patch: Partial<FollowUp> = {}): FollowUp => ({
    status: 'closed',
    action: ' New decal, turned outward ',
    closedOn: '2026-11-08',
    closedBy: 'Sam Andersson',
    updatedAt: '2026-11-08T09:00:00.000Z',
    updatedBy: 'sam@modig.se',
    ...patch,
  });
  const model = qualityCheckPrint(check(), 'deviations', {
    ...CONTEXT,
    followUps: {
      [first!.key]: closed(),
      [extra!.key]: closed({ status: 'open', closedOn: '', closedBy: '' }),
    },
  });

  it('print how they were closed instead of empty lines; open ones keep the lines', () => {
    const [d1, d2, d3] = cardsOf(model);
    expect(d1!.closed).toEqual({
      action: 'New decal, turned outward',
      closedOn: '2026-11-08',
      closedBy: 'Sam Andersson',
    });
    expect(d2!.closed).toBeUndefined();
    expect(d3!.closed).toBeUndefined();
  });

  it('count what is still open in the header', () => {
    expect(values(model.header)['Deviations']).toBe('3 · 2 open');
    expect(values(qualityCheckPrint(check(), 'deviations', CONTEXT).header)['Deviations']).toBe(
      '3',
    );
  });
});

describe('what a quality check may lack', () => {
  it('without deviations has no cards and counts none', () => {
    const model = qualityCheckPrint(
      check({ results: { [id('Item', 1)]: { status: 'OK' } }, extraDeviations: [] }),
      'deviations',
      CONTEXT,
    );
    expect(cardsOf(model)).toEqual([]);
    expect(values(model.header)['Deviations']).toBe('0');
    expect(model.front.counts.at(-1)).toEqual({ label: 'Deviations', value: 0 });
    // Without photos four cards share a page, as a final report.
    expect(defaultDeviationsPerPage(model)).toBe(4);
    expect(qualityImageIds(model)).toEqual([]);
  });

  it('without a machine ID (done before it was asked for) leaves it out, never "undefined"', () => {
    const front = { ...check().front, machineName: '  ', serialNumber: '', participants: [] };
    const model: QualityPrintModel = qualityCheckPrint(check({ front }), 'report', CONTEXT);
    expect(values(model.front.fields)).toMatchObject({
      'Machine ID': '',
      'Serial number': '',
      'Checked by': '',
    });
    expect(values(model.header)).toMatchObject({
      'Machine ID': '—',
      'Serial number': '—',
      'Checked by': '—',
    });
    expect(model.footer).toBe('QC-2026-0004 · Quality check – Pre start up · RigiMill MG · S/N —');
    expect(model.subject).toBe('QC-2026-0004 · Quality check – Pre start up · RigiMill MG');
    expect(model.fileName).toBe('QC-2026-0004 RigiMill MG – Pre start up – Quality check report');
    expect(JSON.stringify(model)).not.toContain('undefined');
  });

  it('cuts a very long machine ID in the footer only, as a final report its machine', () => {
    const long = `Magellan ${'line 4, hall B '.repeat(10)}`.trim();
    const model = report({ front: { ...check().front, machineName: long } });
    expect(values(model.front.fields)['Machine ID']).toBe(long);
    const parts = model.footer.split(' · ');
    expect(parts[2]!.length).toBeLessThanOrEqual(60);
    expect(parts[2]).toMatch(/^Magellan line 4.*…$/);
  });

  it('without the check’s front page or rows still prints, with what it has', () => {
    const model = report({
      templateSnapshot: {
        name: ' ',
        sections: [{ id: id('Sect', 9), title: '', items: [] }],
      },
      results: {},
      extraDeviations: [],
    });
    expect(model.front.title).toBe('Quality check');
    expect(values(model.front.fields)['Department']).toBe('');
    expect(model.front.revision).toBe('Rev: 2');
    expect(model.sections).toEqual([{ number: 1, title: '', stats: 'No rows · 0.0 h', rows: [] }]);
    expect(model.front.size).toBe('1 section · 0 rows · 0.0 h');
    expect(model.front.counts.map((count) => count.label)).toEqual([
      'Rows',
      'OK',
      'NOK',
      'N/A',
      'Deviations',
    ]);
  });
});
