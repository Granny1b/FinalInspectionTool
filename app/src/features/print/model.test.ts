import type { Inspection, Item, Section, Template } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { formatDateTime } from '../../lib/format';
import {
  BLANK_DEVIATION_LINES,
  inspectionPrint,
  NOT_FINALISED_MARKER,
  packCards,
  printedImageIds,
  templatePrint,
  type DeviationCard,
  type PrintModel,
  type PrintRow,
} from './model';

const CONTEXT = { companyName: 'Modig Machine Tool', modelLabel: 'RigiMill MG' };

/** 16-character ids, as the schemas want them: "Item000000000007". */
const id = (prefix: string, n: number) => `${prefix}${String(n).padStart(16 - prefix.length, '0')}`;
const items = (section: number, count: number): Item[] =>
  Array.from({ length: count }, (_, index) => ({
    id: id(`I${section}x`, index),
    text: `Checkpoint ${section}.${index}`,
  }));
const section = (n: number, title: string, rows: number): Section => ({
  id: id('Sect', n),
  title,
  items: items(n, rows),
});

const SECTIONS = [section(1, 'Loading area', 2), section(2, 'Tool arena', 3)];
const [row1a, row1b] = SECTIONS[0]!.items;
const [row2a, row2b, row2c] = SECTIONS[1]!.items;

function inspection(patch: Partial<Inspection> = {}): Inspection {
  return {
    id: 'Insp000000000001',
    number: 'FI-2026-0042',
    templateId: 'Tmpl000000000001',
    templateRevision: 2,
    templateSnapshot: {
      name: 'Final inspection – RigiMill MG',
      sections: SECTIONS,
      printSettings: { spareRowsPerSection: 3 },
    },
    front: {
      machineName: 'RigiMill MG – Volvo Skövde',
      modelCode: 'RMMG',
      serialNumber: 'RM-2026-031',
      participants: ['Erik Lund', 'Anna Andersson'],
      location: 'Kalmar, Sweden',
      date: '2026-10-07',
      photoId: 'Phot000000000001',
    },
    results: {},
    extraDeviations: [],
    state: 'in_progress',
    createdAt: '2026-10-07T08:00:00.000Z',
    createdBy: 'anna@modig.se',
    updatedAt: '2026-10-07T08:00:00.000Z',
    updatedBy: 'anna@modig.se',
    ...patch,
  };
}

function template(patch: Partial<Template> = {}): Template {
  return {
    id: 'Tmpl000000000001',
    name: 'Final inspection – RigiMill MG',
    modelCode: 'RMMG',
    revision: 3,
    status: 'draft',
    coverImageId: 'Covr000000000001',
    printSettings: { spareRowsPerSection: 2 },
    sections: SECTIONS,
    updatedAt: '2026-10-07T08:00:00.000Z',
    updatedBy: 'anna@modig.se',
    ...patch,
  };
}

const refs = (rows: PrintRow[]) => rows.map((row) => row.ref);
const blankNumbers = Array.from(
  { length: BLANK_DEVIATION_LINES },
  (_, index) => `D-${String(index + 1).padStart(2, '0')}`,
);
function cardsOf(model: PrintModel): DeviationCard[] {
  if (model.deviations.kind !== 'cards') throw new Error('expected deviation cards');
  return model.deviations.cards;
}

describe('a blank checklist', () => {
  const model = inspectionPrint(inspection(), 'blank', CONTEXT);

  it('fills the front page from the inspection', () => {
    expect(model.mode).toBe('blank');
    expect(model.front.number).toBe('FI-2026-0042');
    expect(model.front.fields).toEqual([
      { label: 'Machine name', value: 'RigiMill MG – Volvo Skövde' },
      { label: 'Model', value: 'RigiMill MG' },
      { label: 'Serial number', value: 'RM-2026-031' },
      { label: 'Participants', value: 'Erik Lund, Anna Andersson' },
      { label: 'Location', value: 'Kalmar, Sweden' },
      { label: 'Date', value: '7 Oct 2026' },
    ]);
    expect(model.front.photoId).toBe('Phot000000000001');
    expect(model.front.revision).toBe('Rev: 2');
    expect(model.front.report).toBeNull();
  });

  it('numbers sections and rows, then adds the frozen spare rows with the lettering continued', () => {
    expect(model.sections.map((s) => [s.number, s.title])).toEqual([
      [1, 'Loading area'],
      [2, 'Tool arena'],
    ]);
    expect(refs(model.sections[0]!.rows)).toEqual(['1.a', '1.b', '1.c', '1.d', '1.e']);
    expect(refs(model.sections[1]!.rows)).toEqual(['2.a', '2.b', '2.c', '2.d', '2.e', '2.f']);
    expect(model.sections[0]!.rows.map((row) => row.spare)).toEqual([
      false,
      false,
      true,
      true,
      true,
    ]);
    expect(model.sections[0]!.rows[0]).toEqual({
      ref: '1.a',
      text: 'Checkpoint 1.0',
      spare: false,
      status: null,
      severity: null,
      comment: '',
      resp: '',
    });
    expect(model.sections[0]!.rows[2]).toMatchObject({ text: '', status: null, comment: '' });
  });

  it('ignores recorded results: the paper is for filling in by hand', () => {
    const filled = inspectionPrint(
      inspection({ results: { [row1a!.id]: { status: 'NOK', comment: 'Loose', resp: 'El' } } }),
      'blank',
      CONTEXT,
    );
    expect(filled.sections[0]!.rows[0]).toMatchObject({ status: null, comment: '', resp: '' });
  });

  it('has fifteen numbered deviation lines to fill in, even when deviations were recorded', () => {
    expect(BLANK_DEVIATION_LINES).toBe(15);
    expect(model.deviations).toEqual({ kind: 'lines', numbers: blankNumbers });
    const recorded = inspectionPrint(
      inspection({ results: { [row1a!.id]: { status: 'NOK' } } }),
      'blank',
      CONTEXT,
    );
    expect(recorded.deviations).toEqual({ kind: 'lines', numbers: blankNumbers });
  });

  it('names the inspection in the footer and the file', () => {
    expect(model.footer).toBe(
      'Modig Machine Tool · FI-2026-0042 · RigiMill MG – Volvo Skövde · S/N RM-2026-031 · Rev 2',
    );
    expect(model.fileName).toBe('FI-2026-0042 RigiMill MG – Volvo Skövde – Blank checklist');
    expect(model.checklistTitle).toBe('Final inspection – RigiMill MG · Rev 2');
  });

  it('falls back to the default company name and dashes for a missing machine or serial', () => {
    const bare = inspectionPrint(
      inspection({
        front: { ...inspection().front, machineName: ' ', serialNumber: '' },
      }),
      'blank',
      { companyName: '  ', modelLabel: 'RMMG' },
    );
    expect(bare.footer).toBe('Modig Machine Tool · FI-2026-0042 · — · S/N — · Rev 2');
    expect(bare.fileName).toBe('FI-2026-0042 – Blank checklist');
    expect(bare.front.companyName).toBe('Modig Machine Tool');
  });
});

describe('lettering', () => {
  it('runs past z (aa, ab…) and the spare rows continue after it', () => {
    const long = { ...section(1, 'Long', 27) };
    const model = inspectionPrint(
      inspection({
        templateSnapshot: {
          name: 'Long',
          sections: [long],
          printSettings: { spareRowsPerSection: 3 },
        },
      }),
      'blank',
      CONTEXT,
    );
    const rows = model.sections[0]!.rows;
    expect(rows).toHaveLength(30);
    expect(refs(rows.slice(24))).toEqual(['1.y', '1.z', '1.aa', '1.ab', '1.ac', '1.ad']);
    expect(rows.slice(27).every((row) => row.spare)).toBe(true);
    expect(rows[26]!.spare).toBe(false);
  });
});

describe('a report', () => {
  const results: Inspection['results'] = {
    [row1a!.id]: { status: 'OK', comment: '  Checked twice ' },
    [row1b!.id]: { status: 'NOK', comment: 'Screw loose', resp: 'Assembly', severity: 'major' },
    [row2a!.id]: { status: 'NA' },
    [row2b!.id]: { status: 'NOK', comment: 'Label missing' },
    [row2c!.id]: { status: 'OK' },
  };
  const finalised = inspection({
    results,
    extraDeviations: [
      {
        id: 'Extr000000000001',
        description: 'Paint damage on door',
        comment: 'Left side',
        resp: 'Paint shop',
        severity: 'critical',
      },
    ],
    state: 'finalised',
    finalisedAt: '2026-10-08T12:32:00.000Z',
    finalisedBy: 'anna.andersson@modig.se',
  });
  const model = inspectionPrint(finalised, 'report', CONTEXT);

  it('marks each row with its status, NOK severity (minor by default), comment and resp', () => {
    const [a, b] = model.sections[0]!.rows;
    expect(a).toMatchObject({ ref: '1.a', status: 'OK', severity: null, comment: 'Checked twice' });
    expect(b).toMatchObject({
      ref: '1.b',
      status: 'NOK',
      severity: 'major',
      comment: 'Screw loose',
      resp: 'Assembly',
    });
    expect(model.sections[1]!.rows.map((row) => [row.status, row.severity])).toEqual([
      ['NA', null],
      ['NOK', 'minor'],
      ['OK', null],
    ]);
  });

  it('has no spare rows', () => {
    expect(model.sections.flatMap((s) => s.rows).some((row) => row.spare)).toBe(false);
    expect(refs(model.sections[1]!.rows)).toEqual(['2.a', '2.b', '2.c']);
  });

  it('has a card per deviation: NOK rows in checklist order, then extras', () => {
    expect(cardsOf(model)).toEqual([
      {
        number: 'D-01',
        ref: '1.b',
        sectionTitle: 'Loading area',
        text: 'Checkpoint 1.1',
        comment: 'Screw loose',
        severity: 'major',
        resp: 'Assembly',
        photos: [],
      },
      {
        number: 'D-02',
        ref: '2.b',
        sectionTitle: 'Tool arena',
        text: 'Checkpoint 2.1',
        comment: 'Label missing',
        severity: 'minor',
        resp: '',
        photos: [],
      },
      {
        number: 'D-03',
        ref: null,
        sectionTitle: '',
        text: 'Paint damage on door',
        comment: 'Left side',
        severity: 'critical',
        resp: 'Paint shop',
        photos: [],
      },
    ]);
  });

  it('prints the annotated copy of a photo when there is one, else the photo itself', () => {
    const withPhotos = inspectionPrint(
      inspection({
        results: {
          [row1b!.id]: {
            status: 'NOK',
            photos: [
              {
                imageId: 'Orig000000000001',
                renderedImageId: 'Rend000000000001',
                caption: '  Left column ',
                annotations: [{ kind: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, color: '#E02424' }],
              },
              { imageId: 'Orig000000000002', annotations: [] },
            ],
          },
        },
        extraDeviations: [
          {
            id: 'Extr000000000001',
            description: ' Paint damage ',
            severity: 'minor',
            photos: [{ imageId: 'Orig000000000003', annotations: [], caption: 'Door' }],
          },
        ],
      }),
      'report',
      CONTEXT,
    );
    expect(cardsOf(withPhotos).map((card) => card.photos)).toEqual([
      [
        { imageId: 'Rend000000000001', caption: 'Left column' },
        { imageId: 'Orig000000000002', caption: '' },
      ],
      [{ imageId: 'Orig000000000003', caption: 'Door' }],
    ]);
    expect(cardsOf(withPhotos)[1]).toMatchObject({ ref: null, text: 'Paint damage' });
    expect(printedImageIds(withPhotos)).toEqual([
      'Phot000000000001',
      'Rend000000000001',
      'Orig000000000002',
      'Orig000000000003',
    ]);
  });

  it('says when and by whom it was finalised, and sums it up', () => {
    expect(model.front.report).toEqual({
      finalised: true,
      text: `Finalised ${formatDateTime('2026-10-08T12:32:00.000Z')} by anna.andersson@modig.se`,
      summary: '5 / 5 rows filled · 2 NOK · 3 deviations',
    });
    expect(model.fileName).toBe('FI-2026-0042 RigiMill MG – Volvo Skövde – Inspection report');
    expect(model.footer).not.toContain('Not finalised');
  });

  it('marks an inspection in progress as a draft, on the front page and in every footer', () => {
    const draft = inspectionPrint(
      inspection({ results: { [row1a!.id]: { status: 'OK' } } }),
      'report',
      CONTEXT,
    );
    expect(draft.front.report).toEqual({
      finalised: false,
      text: NOT_FINALISED_MARKER,
      summary: '1 / 5 rows filled · 0 NOK · 0 deviations',
    });
    expect(draft.footer).toMatch(/ · Rev 2 · Not finalised$/);
    expect(draft.fileName).toMatch(/ – Draft report$/);
    // Rows without a status yet print empty boxes.
    expect(draft.sections[1]!.rows.every((row) => row.status === null)).toBe(true);
  });

  it('has no deviation cards when nothing was found', () => {
    const clean = inspectionPrint(
      inspection({ results: { [row1a!.id]: { status: 'OK' } }, state: 'finalised' }),
      'report',
      CONTEXT,
    );
    expect(clean.deviations).toEqual({ kind: 'cards', cards: [] });
    expect(clean.front.report?.summary).toBe('1 / 5 rows filled · 0 NOK · 0 deviations');
  });
});

describe('a template preview', () => {
  it('prints the draft blank, marked as a draft, with its own spare rows', () => {
    const model = templatePrint(template(), { ...CONTEXT, draft: true });
    expect(model.mode).toBe('blank');
    expect(model.front.number).toBeNull();
    expect(model.front.fields).toEqual([
      { label: 'Machine name', value: '' },
      { label: 'Model', value: 'RigiMill MG' },
      { label: 'Serial number', value: '' },
      { label: 'Participants', value: '' },
      { label: 'Location', value: '' },
      { label: 'Date', value: '' },
    ]);
    expect(model.front.photoId).toBe('Covr000000000001');
    expect(model.front.revision).toBe('Draft – Rev 3');
    expect(refs(model.sections[0]!.rows)).toEqual(['1.a', '1.b', '1.c', '1.d']);
    expect(model.deviations).toEqual({ kind: 'lines', numbers: blankNumbers });
    expect(printedImageIds(model)).toEqual(['Covr000000000001']);
    expect(model.footer).toBe(
      'Modig Machine Tool · Final inspection – RigiMill MG · Rev 3 (draft)',
    );
    expect(model.checklistTitle).toBe('Final inspection – RigiMill MG · Draft – Rev 3');
    expect(model.fileName).toBe(
      'Final inspection – RigiMill MG – Draft – Rev 3 – Checklist preview',
    );
  });

  it('prints a published revision like the workbook: "Rev: N"', () => {
    const model = templatePrint(template({ status: 'published', revision: 2 }), {
      ...CONTEXT,
      draft: false,
    });
    expect(model.front.revision).toBe('Rev: 2');
    expect(model.footer).toBe('Modig Machine Tool · Final inspection – RigiMill MG · Rev 2');
  });

  it('keeps an empty section: only its spare rows, or no rows at all', () => {
    const sections = [section(1, 'Empty', 0), section(2, 'Full', 1)];
    const withSpare = templatePrint(template({ sections }), { ...CONTEXT, draft: true });
    expect(refs(withSpare.sections[0]!.rows)).toEqual(['1.a', '1.b']);
    expect(withSpare.sections[0]!.rows.every((row) => row.spare)).toBe(true);

    const without = templatePrint(
      template({ sections, printSettings: { spareRowsPerSection: 0 } }),
      { ...CONTEXT, draft: true },
    );
    expect(without.sections[0]!.rows).toEqual([]);
    expect(refs(without.sections[1]!.rows)).toEqual(['2.a']);
  });

  it('names an untitled template', () => {
    const model = templatePrint(template({ name: '  ' }), { ...CONTEXT, draft: true });
    expect(model.footer).toBe('Modig Machine Tool · Untitled template · Rev 3 (draft)');
  });
});

describe('deviation pages', () => {
  const five = ['D-01', 'D-02', 'D-03', 'D-04', 'D-05'];

  it('puts 2 or 4 cards on a page while they fit; only the last page holds fewer', () => {
    const short = [40, 40, 40, 40, 40];
    expect(packCards(five, short, { perPage: 2, room: 240 })).toEqual([
      ['D-01', 'D-02'],
      ['D-03', 'D-04'],
      ['D-05'],
    ]);
    expect(packCards(five, short, { perPage: 4, room: 240 })).toEqual([
      ['D-01', 'D-02', 'D-03', 'D-04'],
      ['D-05'],
    ]);
  });

  it('moves a card that no longer fits on to the next page, whole and in order', () => {
    // D-02 has a long comment: D-03 doesn't fit after it, and D-01 to D-03 can't share a page.
    const heights = [50, 120, 80, 40, 40];
    expect(packCards(five, heights, { perPage: 4, room: 240 })).toEqual([
      ['D-01', 'D-02'],
      ['D-03', 'D-04', 'D-05'],
    ]);
    // Exactly full still fits.
    expect(packCards(five, [120, 120, 1, 1, 1], { perPage: 4, room: 240 })).toEqual([
      ['D-01', 'D-02'],
      ['D-03', 'D-04', 'D-05'],
    ]);
  });

  it('gives a card taller than a page a page of its own', () => {
    expect(packCards(five.slice(0, 3), [30, 300, 30], { perPage: 4, room: 240 })).toEqual([
      ['D-01'],
      ['D-02'],
      ['D-03'],
    ]);
  });

  it('has no pages without cards', () => {
    expect(packCards([], [], { perPage: 2, room: 240 })).toEqual([]);
  });

  it('loads a photo used twice once, and no front photo when there is none', () => {
    const model = inspectionPrint(
      inspection({
        front: { ...inspection().front, photoId: undefined },
        results: {
          [row1a!.id]: {
            status: 'NOK',
            photos: [{ imageId: 'Same000000000001', annotations: [] }],
          },
          [row1b!.id]: {
            status: 'NOK',
            photos: [{ imageId: 'Same000000000001', annotations: [] }],
          },
        },
      }),
      'report',
      CONTEXT,
    );
    expect(printedImageIds(model)).toEqual(['Same000000000001']);
    expect(printedImageIds(inspectionPrint(inspection(), 'blank', CONTEXT))).toEqual([
      'Phot000000000001',
    ]);
  });
});
