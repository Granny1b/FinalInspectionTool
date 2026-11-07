import type { DeviationLogEntry, LogMachine } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { logView, type LogFilter } from '../../deviationLog/model';
import { deviationLogPrintHref } from '../links';
import { defaultDeviationsPerPage } from '../model';
import { appendixCount, printoutImageIds } from '../printout';
import {
  deviationLogPrint,
  logPrintImageIds,
  parseLogLayout,
  photoKey,
  type LogPrintContext,
} from './model';

const TODAY = '2026-11-07';
const MODELS = [{ code: 'RMMG', name: 'RigiMill MG' }];

function entry(patch: Partial<DeviationLogEntry> = {}): DeviationLogEntry {
  return {
    kind: 'quality',
    inspectionId: 'Q000000000000003',
    inspectionNumber: 'QC-2026-0003',
    serialNumber: '12345',
    machineName: 'Testgellan#1',
    modelCode: 'RMMG',
    templateId: 'Tmpl000000000001',
    templateRevision: 2,
    itemId: 'item1',
    sectionTitle: 'Safety features',
    displayRef: '1.a',
    checkpointText: 'Check and verify safety decals on X-motors.',
    comment: ' Its broken and dont work. ',
    resp: 'Mechanical',
    severity: 'minor',
    category: 'Function & adjustment',
    inspectionDate: '2026-11-06',
    finalised: false,
    createdAt: '2026-11-06T08:00:00.000Z',
    checkName: 'Quality check – Pre start up',
    deviationNumber: 'D-01',
    status: 'open',
    action: '',
    closedOn: '',
    closedBy: '',
    key: 'item1',
    foundOn: '2026-11-06',
    machineRef: 'Mach000000000001',
    ...patch,
  };
}

const MACHINES: LogMachine[] = [
  { id: 'Mach000000000001', machineName: 'Testgellan#1', serialNumber: '12345', modelCode: 'RMMG' },
];

const LOG = [
  entry(),
  entry({
    key: 'item4',
    itemId: 'item4',
    deviationNumber: 'D-02',
    displayRef: '4.a',
    sectionTitle: 'Backpack',
    checkpointText: 'Check the "Backpack" for visual damages.',
    comment: 'Broken stuff',
    resp: 'Quality',
    category: 'Missing parts',
    status: 'closed',
    action: 'New cover fitted',
    closedOn: '2026-11-07',
    closedBy: 'Sam Andersson',
  }),
  // Not on the checklist, on a machine of no record.
  entry({
    key: 'Extr000000000001',
    itemId: '',
    displayRef: '',
    sectionTitle: '',
    checkpointText: 'Scratch on the guard door',
    comment: '',
    inspectionId: 'Q000000000000009',
    inspectionNumber: 'QC-2026-0009',
    machineName: 'Boeing#2',
    serialNumber: '',
    machineRef: undefined,
    checkName: 'Quality check – Frame',
    deviationNumber: 'D-01',
    severity: 'major',
    // Older: the log lists the newest machine first among those with open deviations.
    inspectionDate: '2026-10-30',
    foundOn: '2026-10-30',
  }),
];

const ALL: LogFilter = { kind: 'quality', status: 'all', q: '' };
const CONTEXT: LogPrintContext = {
  kind: 'quality',
  companyName: 'Modig Machine Tool',
  models: MODELS,
  today: TODAY,
};

const print = (filter: LogFilter, layout: 'list' | 'cards', context = CONTEXT) =>
  deviationLogPrint(logView(LOG, filter, TODAY, MACHINES), filter, layout, context);

describe('the deviation log on paper', () => {
  it('says what is printed: the title, the day, the filters and how many', () => {
    const model = print({ ...ALL, machine: 'Mach000000000001', resp: 'Mechanical' }, 'list', {
      ...CONTEXT,
      machineName: 'Testgellan#1',
    });
    expect(model.document).toBe('deviation-log');
    expect(model.header).toEqual({
      companyName: 'Modig Machine Tool',
      title: 'Quality check deviations',
      facts: [
        { label: 'Printed', value: TODAY },
        { label: 'Status', value: 'Open and closed' },
        { label: 'Machine', value: 'Testgellan#1' },
        { label: 'Responsible', value: 'Mechanical' },
      ],
      summary: '1 deviation · 1 open · 0 closed',
    });
    expect(model.subject).toBe('Testgellan#1 · Mechanical · Open and closed');
    expect(model.footer).toBe(
      `Quality check deviations · Testgellan#1 · Mechanical · Open and closed · Printed ${TODAY}`,
    );
    expect(model.fileName).toBe(
      `Quality check deviations ${TODAY}, Testgellan#1, Mechanical, Open and closed – Checklist`,
    );
  });

  it('lists every deviation machine by machine, closed ones with how they were closed', () => {
    const model = print(ALL, 'list');
    expect(model.deviations).toEqual({ kind: 'none' });
    expect(model.open).toBe(2);
    expect(model.groups.map((group) => [group.machineName, group.counts])).toEqual([
      ['Testgellan#1', '1 open · 1 closed'],
      ['Boeing#2', '1 open · 0 closed'],
    ]);
    const [machine, other] = model.groups;
    expect(machine).toMatchObject({
      serialNumber: '12345',
      modelLabel: 'RigiMill MG',
      inspections: ['QC-2026-0003 Pre start up 2026-11-06'],
    });
    expect(machine!.rows).toEqual([
      {
        id: 'QC-2026-0003 · D-01',
        severity: 'minor',
        ref: '1.a',
        text: 'Check and verify safety decals on X-motors.',
        sectionTitle: 'Safety features',
        check: 'Pre start up',
        comment: 'Its broken and dont work.',
        resp: 'Mechanical',
        category: 'Function & adjustment',
        closed: null,
      },
      expect.objectContaining({
        id: 'QC-2026-0003 · D-02',
        closed: { action: 'New cover fitted', closedOn: '2026-11-07', closedBy: 'Sam Andersson' },
      }),
    ]);
    expect(other!.rows[0]).toMatchObject({ ref: null, sectionTitle: '', check: 'Frame' });
  });

  it('prints only what the filters show', () => {
    const model = print({ ...ALL, status: 'open' }, 'list');
    expect(model.groups.flatMap((group) => group.rows.map((row) => row.id))).toEqual([
      'QC-2026-0003 · D-01',
      'QC-2026-0009 · D-01',
    ]);
    expect(model.subject).toBe('Open');
    const none = print({ ...ALL, q: 'nothing like this' }, 'list');
    expect(none.groups).toEqual([]);
    expect(none.header.summary).toBe('0 deviations · 0 open · 0 closed');
    expect(none.open).toBe(0);
  });

  it('has a card per deviation with its photos and where it was found', () => {
    const photos = new Map([
      [
        photoKey(LOG[0]!),
        [
          { imageId: 'Phot000000000001', renderedImageId: 'Rend000000000001', annotations: [] },
          { imageId: 'Phot000000000002', annotations: [], caption: ' Left ' },
        ],
      ],
    ]);
    const model = print(ALL, 'cards', { ...CONTEXT, photos });
    expect(model.deviations.kind).toBe('cards');
    if (model.deviations.kind !== 'cards') return;
    const [first, second, third] = model.deviations.cards;
    expect(first).toEqual({
      number: 'QC-2026-0003 · D-01',
      ref: '1.a',
      sectionTitle: 'Safety features',
      text: 'Check and verify safety decals on X-motors.',
      comment: 'Its broken and dont work.',
      severity: 'minor',
      resp: 'Mechanical',
      category: 'Function & adjustment',
      photos: [
        { imageId: 'Rend000000000001', caption: '' },
        { imageId: 'Phot000000000002', caption: 'Left' },
      ],
      context: 'Testgellan#1 · S/N 12345 · Pre start up',
    });
    expect(second!.closed).toEqual({
      action: 'New cover fitted',
      closedOn: '2026-11-07',
      closedBy: 'Sam Andersson',
    });
    expect(third).toMatchObject({ ref: null, context: 'Boeing#2 · Frame', photos: [] });
    expect(logPrintImageIds(model)).toEqual(['Rend000000000001', 'Phot000000000002']);
    expect(printoutImageIds(model, { appendix: true })).toEqual(logPrintImageIds(model));
    expect(appendixCount(model)).toBe(0);
    // Photos: two to a page, as a report opens.
    expect(defaultDeviationsPerPage(model)).toBe(2);
    expect(model.fileName).toMatch(/ – With pictures$/);
  });

  it('has no images in the checklist', () => {
    expect(logPrintImageIds(print(ALL, 'list'))).toEqual([]);
  });

  it('has an address of its own, with the page’s filters', () => {
    expect(parseLogLayout('cards')).toBe('cards');
    expect(parseLogLayout('table')).toBeNull();
    expect(
      deviationLogPrintHref(
        'quality',
        { ...ALL, status: 'open', machine: 'Mach000000000001' },
        { layout: 'cards', deviationsPerPage: 4 },
        true,
      ),
    ).toBe(
      '/deviations/quality/print?machine=Mach000000000001&layout=cards&deviationsPerPage=4&autoprint=1',
    );
    expect(deviationLogPrintHref('final', { ...ALL, kind: 'final' }, { layout: 'list' })).toBe(
      '/deviations/final/print?status=all&layout=list',
    );
  });
});
