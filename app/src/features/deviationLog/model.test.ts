import { NOT_SET, type DeviationLogEntry } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  deviationsTabHref,
  filterFromParams,
  filterToParams,
  isFiltered,
  listChoices,
  logView,
  queryOf,
  type LogFilter,
} from './model';

const TODAY = '2026-11-06';

function entry(patch: Partial<DeviationLogEntry> = {}): DeviationLogEntry {
  return {
    kind: 'final',
    inspectionId: 'A000000000000001',
    inspectionNumber: 'FI-2026-0001',
    serialNumber: 'MG-0001',
    machineName: 'Magellan#1',
    modelCode: 'RMMG',
    templateId: 'tplMG',
    templateRevision: 2,
    itemId: 'item1',
    sectionTitle: 'Electrical cabinets',
    displayRef: '2.c',
    checkpointText: 'SMC filter - Cables labelled',
    comment: 'Not labelled',
    resp: 'Electrical',
    severity: 'minor',
    category: 'Markings & labels',
    inspectionDate: '2026-10-01',
    finalised: true,
    createdAt: '2026-10-01T08:00:00.000Z',
    checkName: 'Final inspection – RigiMill MG',
    deviationNumber: 'D-01',
    status: 'open',
    action: '',
    closedOn: '',
    closedBy: '',
    key: 'item1',
    foundOn: '2026-10-01',
    ...patch,
  };
}

const OPEN: LogFilter = { kind: 'final', status: 'open', q: '' };

/** Two machines of final inspections and one quality check, in no particular order. */
const LOG = [
  entry({ key: 'b', deviationNumber: 'D-02', resp: 'Mechanical', foundOn: '2026-10-20' }),
  entry({ key: 'a', deviationNumber: 'D-01', status: 'closed', closedOn: '2026-10-10' }),
  entry({ key: 'c', deviationNumber: 'D-10', resp: '', category: '' }),
  entry({
    key: 'd',
    inspectionId: 'A000000000000002',
    inspectionNumber: 'FI-2026-0002',
    machineName: 'Boeing#2',
    serialNumber: 'BO-0002',
    inspectionDate: '2026-10-15',
    deviationNumber: 'D-01',
    status: 'closed',
    resp: 'electrical ',
    foundOn: '2026-10-15',
  }),
  entry({
    key: 'e',
    inspectionId: 'A000000000000003',
    inspectionNumber: 'FI-2026-0003',
    machineName: 'Airbus#3',
    serialNumber: 'AB-0003',
    modelCode: 'RMMT',
    inspectionDate: '2026-11-01',
    finalised: false,
    deviationNumber: 'D-01',
    foundOn: '2026-11-01',
  }),
  entry({ key: 'q', kind: 'quality', inspectionId: 'Q000000000000001', checkName: 'QC – Pre' }),
];

describe('filters in the address', () => {
  it('reads them, open deviations by default, and leaves out what it can’t read', () => {
    expect(filterFromParams(new URLSearchParams(''), 'quality')).toEqual({
      kind: 'quality',
      status: 'open',
      q: '',
    });
    expect(
      filterFromParams(
        new URLSearchParams('status=all&model=RMMG&resp=Electrical&category=-&q=magellan%20'),
        'final',
      ),
    ).toEqual({
      kind: 'final',
      status: 'all',
      model: 'RMMG',
      resp: 'Electrical',
      category: NOT_SET,
      // As typed: the box keeps the space before the next word.
      q: 'magellan ',
    });
    expect(
      filterFromParams(new URLSearchParams('status=done&model=RM%20MG&resp=Media'), 'final'),
    ).toEqual({ kind: 'final', status: 'open', resp: 'Media', q: '' });
  });

  it('writes only the filters in use, and round-trips', () => {
    expect(filterToParams(OPEN).toString()).toBe('');
    const filter: LogFilter = {
      kind: 'final',
      status: 'closed',
      model: 'RMMG',
      resp: 'Electrical',
      q: 'cables ',
    };
    expect(filterToParams(filter).toString()).toBe(
      'status=closed&model=RMMG&resp=Electrical&q=cables+',
    );
    expect(filterFromParams(filterToParams(filter), 'final')).toEqual(filter);
    expect(queryOf(filter)).toEqual({ ...filter, q: 'cables' });
    expect(queryOf(OPEN)).toEqual({ kind: 'final', status: 'open' });
    expect(isFiltered(OPEN)).toBe(false);
    expect(isFiltered({ ...OPEN, status: 'all' })).toBe(false);
    expect(isFiltered({ ...OPEN, q: ' x' })).toBe(true);
  });

  it('links to an inspection’s Deviations tab, at one deviation', () => {
    expect(deviationsTabHref('quality', 'Q000000000000001', 'item1')).toBe(
      '/quality-checks/Q000000000000001?tab=deviations&deviation=item1',
    );
    expect(deviationsTabHref('final', 'A000000000000001')).toBe(
      '/inspections/A000000000000001?tab=deviations',
    );
  });
});

describe('logView', () => {
  it('groups the deviations of a machine’s checks under the machine, as it is named now', () => {
    const machines = [
      {
        id: 'M000000000000001',
        machineName: 'Magellan#1B',
        serialNumber: 'MG-9',
        modelCode: 'RMMG',
      },
    ];
    const quality: LogFilter = { kind: 'quality', status: 'all', q: '' };
    const linked = (patch: Partial<DeviationLogEntry>) =>
      entry({ kind: 'quality', machineRef: 'M000000000000001', ...patch });
    const view = logView(
      [
        linked({ key: 'a', checkName: 'Quality check – Pre start up' }),
        linked({
          key: 'b',
          inspectionId: 'Q000000000000002',
          inspectionNumber: 'QC-2026-0002',
          checkName: 'Quality check – Frame',
          // Done before the machine was renamed: under it all the same.
          machineName: 'Magellan#1',
        }),
        // Not linked: grouped by its Machine ID and check, as before.
        entry({ kind: 'quality', key: 'c', inspectionId: 'Q000000000000003' }),
      ],
      quality,
      TODAY,
      machines,
    );
    expect(view.groups).toHaveLength(2);
    const machine = view.groups.find((group) => group.machineRef)!;
    expect(machine).toMatchObject({
      machineName: 'Magellan#1B',
      serialNumber: 'MG-9',
      checkName: '',
    });
    expect(machine.inspections.map((inspection) => inspection.checkName).sort()).toEqual([
      'Quality check – Frame',
      'Quality check – Pre start up',
    ]);
    const unlinked = view.groups.find((group) => !group.machineRef)!;
    expect(unlinked.checkName).toBe('Final inspection – RigiMill MG');
  });

  it('groups by machine, those with open deviations first, then the newest', () => {
    const view = logView(LOG, { ...OPEN, status: 'all' }, TODAY);
    expect(view.groups.map((group) => group.machineName)).toEqual([
      'Airbus#3',
      'Magellan#1',
      'Boeing#2',
    ]);
    const magellan = view.groups[1]!;
    // Each by number; the progress counts open and closed.
    expect(magellan.entries.map((row) => row.deviationNumber)).toEqual(['D-01', 'D-02', 'D-10']);
    expect([magellan.open, magellan.closed]).toEqual([2, 1]);
    expect(magellan.inspections).toEqual([
      {
        id: 'A000000000000001',
        number: 'FI-2026-0001',
        date: '2026-10-01',
        finalised: true,
        checkName: '',
      },
    ]);
    expect(view.groups[0]!.inspections[0]!.finalised).toBe(false);
    // The quality check is not one of them.
    expect(view.shown).toBe(5);
  });

  it('lists what the status asks for, and counts the rest in the summary and progress', () => {
    const view = logView(LOG, OPEN, TODAY);
    expect(view.groups.map((group) => group.machineName)).toEqual(['Airbus#3', 'Magellan#1']);
    expect(view.groups[1]!.entries.map((row) => row.key)).toEqual(['b', 'c']);
    expect([view.groups[1]!.open, view.groups[1]!.closed]).toEqual([2, 1]);
    expect(view.summary).toEqual({
      open: 3,
      closed: 2,
      // Found 2026-10-01, more than 30 days before 2026-11-06.
      overdue: 1,
      oldestOpen: '2026-10-01',
      openByResp: [
        { resp: 'Electrical', open: 1 },
        { resp: 'Mechanical', open: 1 },
        { resp: '', open: 1 },
      ],
    });
    const closed = logView(LOG, { ...OPEN, status: 'closed' }, TODAY);
    // Machines with open deviations still come first.
    expect(closed.groups.map((group) => group.machineName)).toEqual(['Magellan#1', 'Boeing#2']);
  });

  it('filters the summary too, but the responsible chips by everything else', () => {
    const view = logView(LOG, { ...OPEN, resp: 'ELECTRICAL' }, TODAY);
    expect(view.shown).toBe(1);
    expect(view.summary).toMatchObject({ open: 1, closed: 2 });
    expect(view.summary.openByResp.map(({ resp }) => resp)).toEqual([
      'Electrical',
      'Mechanical',
      '',
    ]);
    expect(logView(LOG, { ...OPEN, resp: NOT_SET }, TODAY).groups[0]!.entries).toEqual([
      expect.objectContaining({ key: 'c' }),
    ]);
    expect(logView(LOG, { ...OPEN, q: 'airbus' }, TODAY).summary).toMatchObject({
      open: 1,
      closed: 0,
      overdue: 0,
    });
  });

  it('keeps several inspections of one machine together, newest first in its header', () => {
    const again = entry({
      key: 'z',
      inspectionId: 'A000000000000009',
      inspectionNumber: 'FI-2026-0009',
      inspectionDate: '2026-11-02',
      machineName: ' MAGELLAN#1',
      deviationNumber: 'D-01',
    });
    const view = logView([...LOG, again], OPEN, TODAY);
    const magellan = view.groups.find((group) => group.key.includes('magellan#1'))!;
    expect(magellan.inspections.map((inspection) => inspection.number)).toEqual([
      'FI-2026-0009',
      'FI-2026-0001',
    ]);
    // The newest inspection's spelling; its deviations after the older one's.
    expect(magellan.machineName).toBe(' MAGELLAN#1');
    expect(magellan.entries.map((row) => row.key)).toEqual(['b', 'c', 'z']);
    // Now the newest machine: first.
    expect(view.groups[0]).toBe(magellan);
  });

  it('keeps a machine’s quality checks apart, by title', () => {
    const checks = [
      entry({ kind: 'quality', key: 'p', checkName: 'Quality check – Pre start up' }),
      entry({
        kind: 'quality',
        key: 'r',
        inspectionId: 'Q000000000000002',
        checkName: 'Quality check – Run in',
        inspectionDate: '2026-10-05',
      }),
    ];
    const view = logView(checks, { ...OPEN, kind: 'quality' }, TODAY);
    expect(view.groups.map((group) => [group.machineName, group.checkName])).toEqual([
      ['Magellan#1', 'Quality check – Run in'],
      ['Magellan#1', 'Quality check – Pre start up'],
    ]);
    // A final inspection's group has no title.
    expect(logView(LOG, OPEN, TODAY).groups[0]!.checkName).toBe('');
  });
});

describe('listChoices', () => {
  it('offers every responsible by name, once whatever its case, and Not assigned last', () => {
    expect(listChoices(LOG, 'resp', undefined)).toEqual([
      { value: 'Electrical', label: 'Electrical' },
      { value: 'Mechanical', label: 'Mechanical' },
      { value: NOT_SET, label: 'Not assigned' },
    ]);
    // One from a link stays selectable.
    expect(listChoices(LOG, 'category', 'Safety').map(({ label }) => label)).toEqual([
      'Markings & labels',
      'Safety',
      'No category',
    ]);
  });
});
