import type { MachineCheck, MachineSummary, TemplateSummary } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import {
  basedOnText,
  checkChoices,
  checklistHref,
  checkStateText,
  checkTitle,
  choicesText,
  filterFromParams,
  filterMachines,
  filterToParams,
  isFiltered,
  machineModels,
  matchingMachines,
  nextCheck,
  updateAvailable,
  updateText,
} from './model';

const MODELS = [
  { code: 'RMMG', name: 'RigiMill MG' },
  { code: 'IM', name: 'IM8' },
];

function machine(patch: Partial<MachineSummary>): MachineSummary {
  return {
    id: 'M000000000000001',
    machineName: 'Magellan#1',
    modelCode: 'RMMG',
    serialNumber: 'RM-2026-016',
    createdAt: '2026-11-06T08:00:00.000Z',
    createdBy: 'anna@modig.se',
    updatedAt: '2026-11-06T08:00:00.000Z',
    updatedBy: 'anna@modig.se',
    progress: {
      quality: { total: 2, started: 1, finalised: 1 },
      final: { total: 1, started: 0, finalised: 0 },
      deviations: { open: 0, closed: 0 },
    },
    ...patch,
  };
}

function template(patch: Partial<TemplateSummary>): TemplateSummary {
  return {
    id: 'T000000000000001',
    kind: 'final',
    name: 'Final inspection – RigiMill MG',
    modelCode: 'RMMG',
    publishedRevision: 2,
    publishedName: 'Final inspection – RigiMill MG',
    publishedModelCode: 'RMMG',
    draftRevision: 3,
    hasUnpublishedChanges: false,
    itemCount: 90,
    updatedAt: '2026-11-06T08:00:00.000Z',
    updatedBy: 'boss@modig.se',
    ...patch,
  };
}

function check(patch: Partial<MachineCheck>): MachineCheck {
  return {
    id: 'Q000000000000001',
    kind: 'quality',
    number: '',
    machineName: 'Magellan#1',
    serialNumber: 'RM-2026-016',
    modelCode: 'RMMG',
    date: '2026-11-06',
    state: 'not_started',
    nokCount: 0,
    okCount: 0,
    filled: 0,
    total: 12,
    templateId: 'T000000000000002',
    templateRevision: 3,
    templateName: 'Quality check – Pre start up',
    machineRef: 'M000000000000001',
    updatedAt: '2026-11-06T08:00:00.000Z',
    latestRevision: 3,
    changes: { added: 0, removed: 0, changed: 0 },
    deviations: { open: 0, closed: 0 },
    ...patch,
  };
}

describe('the machines list', () => {
  const list = [
    machine({}),
    machine({ id: 'M2', machineName: 'Boeing#2', modelCode: 'IM', serialNumber: 'IM-77' }),
    machine({
      id: 'M3',
      machineName: 'Airbus#3',
      progress: {
        quality: { total: 1, started: 1, finalised: 1 },
        final: { total: 1, started: 1, finalised: 1 },
        deviations: { open: 0, closed: 2 },
      },
    }),
  ];

  it('searches the Machine ID, serial number and model, every word', () => {
    const filter = { query: 'magellan 016', model: '', stage: '' } as const;
    expect(filterMachines(list, filter, MODELS).map((entry) => entry.id)).toEqual([
      'M000000000000001',
    ]);
    expect(filterMachines(list, { ...filter, query: 'im8' }, MODELS)).toHaveLength(1);
  });

  it('offers the machines that match the words typed in a search box, all for none', () => {
    const names = (query: string) =>
      matchingMachines(list, query, MODELS).map((entry) => entry.machineName);
    expect(names('')).toEqual(list.map((entry) => entry.machineName));
    expect(names('  MAGELLAN  ')).toEqual(['Magellan#1']);
    expect(names('rigimill 016')).toEqual(['Magellan#1', 'Airbus#3']);
    expect(names('im-77')).toEqual(['Boeing#2']);
    expect(names('volvo')).toEqual([]);
  });

  it('filters by model and by status', () => {
    expect(filterMachines(list, { query: '', model: 'IM', stage: '' }, MODELS)).toHaveLength(1);
    expect(
      filterMachines(list, { query: '', model: '', stage: 'done' }, MODELS).map(
        (entry) => entry.machineName,
      ),
    ).toEqual(['Airbus#3']);
  });

  it('keeps its filters in the address, only those in use', () => {
    const filter = { query: 'mag', model: 'RMMG', stage: 'in_build' } as const;
    expect(filterToParams(filter).toString()).toBe('q=mag&model=RMMG&stage=in_build');
    expect(filterFromParams(filterToParams(filter))).toEqual(filter);
    expect(filterFromParams(new URLSearchParams('stage=nonsense')).stage).toBe('');
    expect(isFiltered({ query: ' ', model: '', stage: '' })).toBe(false);
  });
});

describe('a machine’s checks', () => {
  it('are named by their check, and say where they are', () => {
    expect(checkTitle(check({}))).toBe('Pre start up');
    expect(
      checkTitle(check({ kind: 'final', templateName: 'Final inspection – RigiMill MG' })),
    ).toBe('Final inspection');
    expect(checkStateText(check({}))).toBe('Not started');
    expect(checkStateText(check({ state: 'in_progress', filled: 4 }))).toBe(
      'In progress · 4 / 12 rows',
    );
    expect(checkStateText(check({ state: 'finalised' }))).toBe('Finalised');
  });

  it('say which revision their copy is based on and what the machine changed', () => {
    expect(basedOnText(check({}))).toBe('Based on Pre start up rev 3');
    expect(basedOnText(check({ changes: { added: 2, removed: 1, changed: 0 } }))).toBe(
      'Based on Pre start up rev 3 · 2 rows added, 1 removed',
    );
    expect(basedOnText(check({ changes: null }))).toBe('Based on Pre start up rev 3');
  });

  it('can be updated when the template has a newer revision, unless finalised', () => {
    expect(updateAvailable(check({}))).toBe(false);
    expect(updateAvailable(check({ latestRevision: 4 }))).toBe(true);
    expect(updateAvailable(check({ latestRevision: 4, state: 'in_progress' }))).toBe(true);
    expect(updateAvailable(check({ latestRevision: 4, state: 'finalised' }))).toBe(false);
    expect(updateAvailable(check({ latestRevision: null }))).toBe(false);
    expect(updateText(check({ latestRevision: 4 }))).toBe(
      'Rev 4 available · this machine has rev 3',
    );
  });

  it('say which is next: the first quality check not started, then the final inspection', () => {
    const final = check({ id: 'F', kind: 'final' });
    const first = check({ id: 'Q1', state: 'finalised' });
    const second = check({ id: 'Q2', state: 'in_progress' });
    const third = check({ id: 'Q3' });
    expect(nextCheck([first, second, third, final])).toBe('Q3');
    // Not while a quality check is in progress; once all are done, the final inspection.
    expect(nextCheck([first, second, final])).toBeNull();
    expect(nextCheck([first, final])).toBe('F');
    expect(nextCheck([first, { ...final, state: 'in_progress' }])).toBeNull();
  });

  it('have their checklist edited at their own address', () => {
    expect(checklistHref('quality', 'Q1')).toBe('/quality-checks/Q1/checklist');
    expect(checklistHref('final', 'F1')).toBe('/inspections/F1/checklist');
  });
});

describe('checkChoices', () => {
  const final = template({});
  const templates = [
    final,
    template({
      id: 'Q2',
      kind: 'quality',
      parentId: final.id,
      name: 'Quality check – Frame',
      publishedName: 'Quality check – Frame',
      publishedRevision: 1,
      itemCount: 8,
      position: 1,
    }),
    template({
      id: 'Q1',
      kind: 'quality',
      parentId: final.id,
      name: 'Quality check – Pre start up (draft title)',
      publishedName: 'Quality check – Pre start up',
      publishedRevision: 3,
      itemCount: 12,
      position: 0,
    }),
    template({
      id: 'Q3',
      kind: 'quality',
      parentId: final.id,
      name: 'Quality check – Covers',
      publishedRevision: null,
      publishedName: null,
    }),
    template({ id: 'X', modelCode: 'IM', publishedModelCode: 'IM', name: 'Final – IM8' }),
  ];

  it('offers the model’s published quality checks in their order, then its final inspection', () => {
    expect(checkChoices(templates, 'RMMG')).toEqual([
      { templateId: 'Q1', kind: 'quality', title: 'Pre start up', revision: 3 },
      { templateId: 'Q2', kind: 'quality', title: 'Frame', revision: 1 },
      { templateId: final.id, kind: 'final', title: 'Final inspection', revision: 2 },
    ]);
    expect(choicesText(checkChoices(templates, 'RMMG'))).toBe(
      '2 quality checks and the final inspection',
    );
    expect(choicesText(checkChoices(templates, 'IM'))).toBe('The final inspection');
    expect(checkChoices(templates, 'NONE')).toEqual([]);
  });

  it('leaves out a final inspection never published', () => {
    const unpublished = templates.map((entry) =>
      entry.id === final.id ? { ...entry, publishedRevision: null } : entry,
    );
    expect(checkChoices(unpublished, 'RMMG').map((choice) => choice.kind)).toEqual([
      'quality',
      'quality',
    ]);
    expect(choicesText([{ kind: 'quality' }])).toBe('1 quality check');
  });

  it('offers the models that have something published to copy, by name', () => {
    expect(machineModels(templates, MODELS)).toEqual([
      { code: 'IM', name: 'IM8' },
      { code: 'RMMG', name: 'RigiMill MG' },
    ]);
    const draftOnly = template({
      id: 'D',
      modelCode: 'NEW',
      publishedModelCode: null,
      publishedRevision: null,
    });
    expect(machineModels([...templates, draftOnly], MODELS).map((model) => model.code)).toEqual([
      'IM',
      'RMMG',
    ]);
  });
});
