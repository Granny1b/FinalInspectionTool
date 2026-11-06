import type { TemplateSummary } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { checkCountText, publishedTitle, startChoices } from './startChoices';

function summary(patch: Partial<TemplateSummary>): TemplateSummary {
  return {
    id: 'T000000000000001',
    kind: 'final',
    name: 'Final inspection – RigiMill MG',
    modelCode: 'RMMG',
    publishedRevision: 1,
    publishedName: 'Final inspection – RigiMill MG',
    publishedModelCode: 'RMMG',
    draftRevision: 2,
    hasUnpublishedChanges: false,
    itemCount: 3,
    updatedAt: '2026-11-05T08:00:00.000Z',
    updatedBy: 'boss@modig.se',
    ...patch,
  };
}

const MODELS = [
  { code: 'RMMG', name: 'RigiMill MG' },
  { code: 'IM', name: 'IM8' },
  { code: 'HHV', name: 'HHV3 DUO' },
];

const machineMG = summary({ id: 'MachineMG0000001' });
const machineIM = summary({ id: 'MachineIM0000001', modelCode: 'IM', publishedModelCode: 'IM' });
const machineHHV = summary({ id: 'MachineHH0000001', modelCode: 'HHV', publishedModelCode: 'HHV' });

function check(id: string, parent: TemplateSummary, patch: Partial<TemplateSummary> = {}) {
  return summary({
    id,
    kind: 'quality',
    parentId: parent.id,
    modelCode: parent.modelCode,
    publishedModelCode: parent.modelCode,
    ...patch,
  });
}

describe('startChoices', () => {
  it('offers the machines with a published quality check, by name, each with its checks by title', () => {
    const choices = startChoices(
      [
        machineMG,
        machineIM,
        machineHHV,
        check('QcRun0000000001', machineMG, {
          name: 'Quality check – Run in',
          publishedName: 'Quality check – Run in',
        }),
        check('QcPre0000000001', machineMG, {
          name: 'Quality check – Pre start up (draft rename)',
          publishedName: 'Quality check – Pre start up',
          publishedRevision: 2,
        }),
        check('QcIM00000000001', machineIM, { publishedName: 'Quality check – Frame' }),
        // Never published: nothing to start from.
        check('QcHHV0000000001', machineHHV, { publishedRevision: null, publishedName: null }),
      ],
      MODELS,
    );
    expect(
      choices.map(({ modelCode, name, checks }) => [modelCode, name, checks.map(publishedTitle)]),
    ).toEqual([
      ['IM', 'IM8', ['Quality check – Frame']],
      ['RMMG', 'RigiMill MG', ['Quality check – Pre start up', 'Quality check – Run in']],
    ]);
  });

  it('leaves out a quality check whose machine’s template is gone', () => {
    const orphan = check('QcOrphan0000001', summary({ id: 'GoneGoneGone0001' }));
    expect(startChoices([machineMG, orphan], MODELS)).toEqual([]);
  });

  it('names a model no longer in the settings by its code', () => {
    const machine = summary({
      id: 'MachineOld000001',
      modelCode: 'OLD',
      publishedModelCode: 'OLD',
    });
    expect(startChoices([machine, check('QcOld0000000001', machine)], MODELS)[0]?.name).toBe('OLD');
  });
});

describe('checkCountText', () => {
  it('counts quality checks', () => {
    expect(checkCountText(1)).toBe('1 quality check');
    expect(checkCountText(3)).toBe('3 quality checks');
  });
});
