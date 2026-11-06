import { describe, expect, it } from 'vitest';
import { InspectionSchema, type InspectionState } from './schemas';
import { InspectionSummarySchema, isStarted, type InspectionSummary } from './inspections';
import {
  compareMachineChecks,
  CreateMachineRequestSchema,
  machineKey,
  machineNameTaken,
  machineProgress,
  machineStage,
  machineStatusText,
  planMachinesFromInspections,
  StartCheckRequestSchema,
  TemplateUpdateRequestSchema,
} from './machines';
import { compareQualityChecks } from './templates';

const NONE = { open: 0, closed: 0 };

function checks(...states: [kind: 'final' | 'quality', state: InspectionState][]) {
  return states.map(([kind, state]) => ({ kind, state }));
}

describe('machine status', () => {
  it('is "No checks yet" without checks', () => {
    const progress = machineProgress([], NONE);
    expect(machineStage(progress)).toBe('no_checks');
    expect(machineStatusText(progress)).toBe('No checks yet');
  });

  it('is in build while quality checks are not all finalised', () => {
    const progress = machineProgress(
      checks(
        ['quality', 'finalised'],
        ['quality', 'finalised'],
        ['quality', 'finalised'],
        ['quality', 'in_progress'],
        ['quality', 'not_started'],
        ['final', 'not_started'],
      ),
      NONE,
    );
    expect(progress.quality).toEqual({ total: 5, started: 4, finalised: 3 });
    expect(progress.final).toEqual({ total: 1, started: 0, finalised: 0 });
    expect(machineStatusText(progress)).toBe('In build · QC 3/5');
  });

  it('is ready for the final inspection once every quality check is finalised', () => {
    const ready = machineProgress(checks(['quality', 'finalised'], ['final', 'not_started']), {
      open: 2,
      closed: 0,
    });
    expect(machineStatusText(ready)).toBe('Ready for final inspection');
    // Also when the machine has no final inspection yet, or no quality checks.
    expect(machineStage(machineProgress(checks(['quality', 'finalised']), NONE))).toBe('ready');
    expect(machineStage(machineProgress(checks(['final', 'not_started']), NONE))).toBe('ready');
  });

  it('says the final inspection is in progress, with the quality checks it went ahead of', () => {
    const early = machineProgress(
      checks(['quality', 'finalised'], ['quality', 'in_progress'], ['final', 'in_progress']),
      NONE,
    );
    expect(machineStatusText(early)).toBe('Final inspection in progress · QC 1/2');
    const inOrder = machineProgress(
      checks(['quality', 'finalised'], ['final', 'in_progress']),
      NONE,
    );
    expect(machineStatusText(inOrder)).toBe('Final inspection in progress');
  });

  it('is done when everything is finalised and no deviation is open', () => {
    const all = checks(['quality', 'finalised'], ['final', 'finalised']);
    expect(machineStatusText(machineProgress(all, { open: 0, closed: 4 }))).toBe('Done');
    expect(machineStatusText(machineProgress(all, { open: 1, closed: 3 }))).toBe(
      'Finalised · 1 open deviation',
    );
    expect(machineStatusText(machineProgress(all, { open: 2, closed: 0 }))).toBe(
      'Finalised · 2 open deviations',
    );
  });
});

describe('Machine IDs', () => {
  it('compare trimmed and ignoring case', () => {
    expect(machineKey('  Magellan#1 ')).toBe(machineKey('MAGELLAN#1'));
    const machines = [{ id: 'm1', machineName: 'Magellan#1' }];
    expect(machineNameTaken(machines, ' magellan#1')).toBe(
      'There is already a machine with the Machine ID Magellan#1.',
    );
    expect(machineNameTaken(machines, 'magellan#1', 'm1')).toBeNull();
    expect(machineNameTaken(machines, 'Magellan#2')).toBeNull();
  });

  it('are required to make a machine, with its serial number; each check copied once', () => {
    const request = {
      machineName: ' Magellan#1 ',
      modelCode: 'RMMG',
      serialNumber: 'RM-016',
      templateIds: ['a', 'b'],
    };
    expect(CreateMachineRequestSchema.parse(request).machineName).toBe('Magellan#1');
    expect(CreateMachineRequestSchema.safeParse({ ...request, machineName: ' ' }).success).toBe(
      false,
    );
    expect(CreateMachineRequestSchema.safeParse({ ...request, serialNumber: '' }).success).toBe(
      false,
    );
    expect(
      CreateMachineRequestSchema.safeParse({ ...request, templateIds: ['a', 'a'] }).success,
    ).toBe(false);
  });
});

describe('the requests of a machine’s checks', () => {
  it('start with an optional date and Checked by', () => {
    expect(StartCheckRequestSchema.parse({})).toEqual({});
    expect(StartCheckRequestSchema.safeParse({ date: '1999-12-31' }).success).toBe(false);
  });

  it('update to a revision with no choices made', () => {
    expect(TemplateUpdateRequestSchema.parse({ revision: 4 })).toEqual({
      revision: 4,
      takeTemplate: [],
      removeRows: [],
    });
  });
});

describe('stored inspections', () => {
  const stored = {
    id: 'i1',
    number: 'FI-2026-0001',
    templateId: 't1',
    templateRevision: 2,
    templateSnapshot: { name: 'Final inspection – RigiMill MG', sections: [] },
    front: {
      machineName: 'Magellan#1',
      modelCode: 'RMMG',
      serialNumber: 'S1',
      participants: [],
      location: '',
      date: '2026-10-01',
    },
    results: {},
    extraDeviations: [],
    state: 'in_progress',
    createdAt: '2026-10-01T08:00:00.000Z',
    createdBy: 'a@modig.se',
    updatedAt: '2026-10-01T08:00:00.000Z',
    updatedBy: 'a@modig.se',
  };

  it('read as before when stored before machines: no machine, started', () => {
    const inspection = InspectionSchema.parse(stored);
    expect(inspection.machineRef).toBeUndefined();
    expect(isStarted(inspection)).toBe(true);
  });

  it('a machine’s check not started has no number yet', () => {
    const check = InspectionSchema.parse({
      ...stored,
      number: '',
      state: 'not_started',
      machineRef: 'm1',
    });
    expect(check.number).toBe('');
    expect(isStarted(check)).toBe(false);
    expect(InspectionSchema.safeParse({ ...stored, number: 'FI-26-1' }).success).toBe(false);
  });

  it('their list rows read without a machine', () => {
    const { templateSnapshot: _snapshot, ...rest } = stored;
    const summary = InspectionSummarySchema.parse({
      ...rest,
      machineName: 'Magellan#1',
      serialNumber: 'S1',
      modelCode: 'RMMG',
      date: '2026-10-01',
      nokCount: 0,
      okCount: 0,
      filled: 0,
      total: 0,
    });
    expect(summary.machineRef).toBeUndefined();
  });
});

describe('compareMachineChecks', () => {
  it('orders quality checks as their model does, then by title, then the final inspection', () => {
    const list = [
      { id: '1', kind: 'final' as const, templateId: 'F', templateName: 'Final inspection' },
      { id: '2', kind: 'quality' as const, templateId: 'Q3', templateName: 'Quality check – Zeta' },
      { id: '3', kind: 'quality' as const, templateId: 'Q2', templateName: 'Quality check – Beta' },
      {
        id: '4',
        kind: 'quality' as const,
        templateId: 'Q1',
        templateName: 'Quality check – Alpha',
      },
      { id: '5', kind: 'quality' as const, templateId: 'Q4', templateName: 'Quality check – Aaa' },
    ];
    expect(list.sort(compareMachineChecks(['Q2', 'Q1'])).map((check) => check.id)).toEqual([
      '3',
      '4',
      '5',
      '2',
      '1',
    ]);
  });

  it('a model’s quality checks by their place, then by title', () => {
    const list = [
      { id: 'a', name: 'Quality check – Frame' },
      { id: 'b', name: 'Quality check – Electrical', position: 1 },
      { id: 'c', name: 'Quality check – Pre start up', position: 0 },
      { id: 'd', name: 'Quality check – Covers' },
    ];
    expect(list.sort(compareQualityChecks).map((check) => check.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('planMachinesFromInspections', () => {
  let n = 0;
  function summary(fields: Partial<InspectionSummary>): InspectionSummary {
    n += 1;
    return {
      id: `i${n}`,
      kind: 'final',
      number: `FI-2026-${String(n).padStart(4, '0')}`,
      machineName: 'Magellan#1',
      serialNumber: 'S1',
      modelCode: 'RMMG',
      date: '2026-10-01',
      state: 'finalised',
      nokCount: 0,
      okCount: 0,
      filled: 0,
      total: 0,
      templateId: 't1',
      templateRevision: 1,
      templateName: '',
      updatedAt: '2026-10-01T08:00:00.000Z',
      ...fields,
    };
  }

  it('makes one machine per Machine ID (trimmed, any case) and model, as the newest spells it', () => {
    const old = summary({ machineName: ' magellan#1', serialNumber: 'OLD', date: '2026-09-01' });
    const qc = summary({ kind: 'quality', machineName: 'Magellan#1 ', date: '2026-10-02' });
    const other = summary({ machineName: 'Magellan#2', serialNumber: 'S2' });
    const plan = planMachinesFromInspections([old, qc, other], []);
    expect(plan.create).toEqual([
      {
        machineName: 'Magellan#1',
        modelCode: 'RMMG',
        serialNumber: 'S1',
        inspectionIds: [qc.id, old.id],
      },
      {
        machineName: 'Magellan#2',
        modelCode: 'RMMG',
        serialNumber: 'S2',
        inspectionIds: [other.id],
      },
    ]);
    expect(plan.link).toEqual([]);
    expect(plan.unmatched).toEqual([]);
  });

  it('links to a machine that exists, and leaves what matches none', () => {
    const match = summary({ machineName: 'MAGELLAN#1' });
    const otherModel = summary({ modelCode: 'IM' });
    const blank = summary({ machineName: '  ' });
    const linked = summary({ machineRef: 'm9' });
    const notStarted = summary({ state: 'not_started', number: '' });
    const plan = planMachinesFromInspections(
      [match, otherModel, blank, linked, notStarted],
      [{ id: 'm1', machineName: 'Magellan#1', modelCode: 'RMMG' }],
    );
    expect(plan.create).toEqual([]);
    expect(plan.link).toEqual([{ machineId: 'm1', inspectionIds: [match.id] }]);
    expect(plan.unmatched).toEqual([otherModel.id, blank.id]);
  });

  it('gives a Machine ID used with two models to the model with more inspections', () => {
    const a1 = summary({ machineName: 'X1', modelCode: 'IM', date: '2026-10-05' });
    const b1 = summary({ machineName: 'X1', modelCode: 'RMMG', date: '2026-09-01' });
    const b2 = summary({ machineName: 'x1', modelCode: 'RMMG', date: '2026-09-02' });
    const plan = planMachinesFromInspections([a1, b1, b2], []);
    expect(plan.create).toEqual([
      expect.objectContaining({
        machineName: 'x1',
        modelCode: 'RMMG',
        inspectionIds: [b2.id, b1.id],
      }),
    ]);
    expect(plan.unmatched).toEqual([a1.id]);
  });
});
