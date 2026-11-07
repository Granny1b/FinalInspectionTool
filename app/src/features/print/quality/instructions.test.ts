import type { Section } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { defaultDeviationsPerPage } from '../model';
import { appendixCount, printoutImageIds } from '../printout';
import type { Inspection } from '@modig/shared';
import {
  checkInstructionsPrint,
  instructionImageIds,
  qualityInstructionsPrint,
  type InstructionsSource,
} from './instructions';
import { qualityCheckPrintout } from './model';

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
        text: ' Check and verify safety decals on balancing tubes. ',
        how: 'Should be visible\nand not turned inward.',
        references: ['ISO 12100', 'ISO 7010'],
        timeHours: 0.25,
        guide: {
          description: ' Decals on both tubes. ',
          images: [
            {
              imageId: id('Gide', 1),
              renderedImageId: id('Rend', 1),
              annotations: [],
              verdict: 'good',
              caption: ' Left tube ',
            },
            { imageId: id('Gide', 2), annotations: [], verdict: 'bad' },
            { imageId: id('Gide', 3), annotations: [], verdict: 'info' },
          ],
        },
      },
      { id: id('Item', 2), text: 'Warning signs inside the cabinet.' },
    ],
  },
  { id: id('Sect', 2), title: '  Electrical cabinet ', items: [] },
];

const SOURCE: InstructionsSource = {
  name: 'Quality check – Pre start up',
  quality: { name: 'Pre start up', department: 'Quality' },
  sections: SECTIONS,
  revision: 3,
  updatedAt: '2026-11-04T09:30:00.000Z',
  updatedBy: 'anna@modig.se',
};

describe('a quality check’s instructions', () => {
  const model = qualityInstructionsPrint(SOURCE, { ...CONTEXT, draft: false });

  it('has a cover with what the check is for, its revision and its sections', () => {
    expect(model.document).toBe('instructions');
    expect(model.cover).toEqual({
      companyName: 'Modig Machine Tool',
      title: 'Quality check – Pre start up',
      fields: [
        { label: 'Machine model', value: 'RigiMill MG' },
        { label: 'Department', value: 'Quality' },
        { label: 'Revision', value: 'Rev 3' },
        { label: 'Published', value: '2026-11-04 by Anna Andersson' },
        { label: 'Size', value: '2 sections · 2 rows · 0.3 h' },
      ],
      draft: false,
      contents: [
        { number: 1, title: 'Safety features', stats: '2 rows · 0.3 h' },
        { number: 2, title: 'Electrical cabinet', stats: 'No rows · 0.0 h' },
      ],
    });
  });

  it('prints every row as the app shows it, pictures by their row, two to a line', () => {
    const [first, second] = model.sections[0]!.rows;
    expect(first).toEqual({
      ref: '1.a',
      what: 'Check and verify safety decals on balancing tubes.',
      how: 'Should be visible\nand not turned inward.',
      references: ['ISO 12100', 'ISO 7010'],
      time: '0.3 h',
      information: 'Decals on both tubes.',
      pictures: [
        [
          // The copy with its arrows and boxes drawn on, when there is one.
          { imageId: id('Rend', 1), verdict: 'good', ref: '1.a', caption: 'Left tube' },
          { imageId: id('Gide', 2), verdict: 'bad', ref: '1.a', caption: '' },
        ],
        [{ imageId: id('Gide', 3), verdict: 'info', ref: '1.a', caption: '' }],
      ],
    });
    // A row with nothing but its text.
    expect(second).toEqual({
      ref: '1.b',
      what: 'Warning signs inside the cabinet.',
      how: '',
      references: [],
      time: '',
      information: '',
      pictures: [],
    });
    expect(model.sections[1]).toMatchObject({ number: 2, title: 'Electrical cabinet', rows: [] });
  });

  it('loads its pictures, has no appendix and no deviation cards', () => {
    const pictures = [id('Rend', 1), id('Gide', 2), id('Gide', 3)];
    expect(instructionImageIds(model)).toEqual(pictures);
    expect(printoutImageIds(model, { appendix: false })).toEqual(pictures);
    expect(printoutImageIds(model, { appendix: true })).toEqual(pictures);
    expect(appendixCount(model)).toBe(0);
    expect(model.deviations).toEqual({ kind: 'none' });
    expect(defaultDeviationsPerPage(model)).toBe(4);
  });

  it('names its pages and its file after the check and its revision', () => {
    expect(model.checklistTitle).toBe('Quality check – Pre start up · Rev 3');
    expect(model.subject).toBe('Quality check – Pre start up');
    expect(model.footer).toBe('Modig Machine Tool · Quality check – Pre start up · Rev 3');
    expect(model.fileName).toBe('Quality check – Pre start up – Rev 3 – Instructions');
  });

  it('marks a draft as not published, on the cover and every page', () => {
    const draft = qualityInstructionsPrint(SOURCE, { ...CONTEXT, draft: true });
    expect(draft.cover.draft).toBe(true);
    expect(draft.cover.fields).toContainEqual({ label: 'Revision', value: 'Draft – Rev 3' });
    expect(draft.cover.fields).toContainEqual({ label: 'Status', value: 'Not published' });
    expect(draft.footer).toBe('Modig Machine Tool · Quality check – Pre start up · Draft – Rev 3');
    expect(draft.fileName).toBe('Quality check – Pre start up – Draft – Rev 3 – Instructions');
  });

  it('falls back for a check without a name, department or company', () => {
    const bare = qualityInstructionsPrint(
      { ...SOURCE, name: ' ', quality: undefined, sections: [] },
      { ...CONTEXT, companyName: '', draft: false },
    );
    expect(bare.cover.title).toBe('Quality check');
    expect(bare.cover.fields).toContainEqual({ label: 'Department', value: '' });
    expect(bare.cover.contents).toEqual([]);
    expect(bare.footer).toMatch(/ · Quality check · Rev 3$/);
  });
});

describe('a quality check’s instructions printed from the check', () => {
  const check = {
    number: 'QC-2026-0004',
    templateRevision: 2,
    templateSnapshot: {
      name: 'Quality check – Pre start up',
      quality: { name: 'Pre start up', department: 'Quality' },
      sections: SECTIONS,
    },
    front: {
      machineName: 'Magellan#2',
      modelCode: 'RMMG',
      serialNumber: 'RM-2026-031',
      participants: ['Erik Lund'],
      location: '',
      date: '2026-11-06',
    },
    machineRef: id('Mach', 1),
  } satisfies Parameters<typeof checkInstructionsPrint>[0];

  it('names the machine and says the checklist is the machine’s own copy', () => {
    const model = checkInstructionsPrint(check, CONTEXT);
    expect(model.cover.draft).toBe(false);
    expect(model.cover.fields).toEqual([
      { label: 'Machine ID', value: 'Magellan#2' },
      { label: 'Machine model', value: 'RigiMill MG' },
      { label: 'Serial number', value: 'RM-2026-031' },
      { label: 'Quality check', value: 'QC-2026-0004' },
      { label: 'Department', value: 'Quality' },
      { label: 'Checklist', value: 'This machine’s copy, based on Rev 2' },
      { label: 'Size', value: '2 sections · 2 rows · 0.3 h' },
    ]);
    // The same rows and pictures as from the template.
    expect(model.sections).toEqual(
      qualityInstructionsPrint(SOURCE, { ...CONTEXT, draft: false }).sections,
    );
    expect(model.checklistTitle).toBe('Quality check – Pre start up · Rev 2');
    expect(model.subject).toBe(
      'QC-2026-0004 · Quality check – Pre start up · Magellan#2 · RigiMill MG',
    );
    expect(model.footer).toBe(
      'QC-2026-0004 · Quality check – Pre start up · Magellan#2 · RigiMill MG · S/N RM-2026-031',
    );
    expect(model.fileName).toBe(
      'QC-2026-0004 Magellan#2 RigiMill MG – Pre start up – Instructions',
    );
  });

  it('says only the revision for a check on no machine', () => {
    const { machineRef: _none, ...unlinked } = check;
    expect(checkInstructionsPrint(unlinked, CONTEXT).cover.fields).toContainEqual({
      label: 'Checklist',
      value: 'Rev 2',
    });
  });

  it('is what a check prints in the Instructions mode; the other modes print its report', () => {
    const inspection = {
      ...check,
      id: id('Insp', 4),
      kind: 'quality',
      templateId: id('Tmpl', 2),
      state: 'in_progress',
      results: {},
      extraDeviations: [],
      createdAt: '2026-11-06T08:00:00.000Z',
      createdBy: 'sam@modig.se',
      updatedAt: '2026-11-06T08:00:00.000Z',
      updatedBy: 'sam@modig.se',
    } as Inspection;
    expect(qualityCheckPrintout(inspection, 'instructions', CONTEXT)).toEqual(
      checkInstructionsPrint(inspection, CONTEXT),
    );
    expect(qualityCheckPrintout(inspection, 'report', CONTEXT)).toMatchObject({
      document: 'quality',
      mode: 'report',
    });
    expect(qualityCheckPrintout(inspection, 'deviations', CONTEXT)).toMatchObject({
      document: 'quality',
      mode: 'deviations',
    });
  });
});
