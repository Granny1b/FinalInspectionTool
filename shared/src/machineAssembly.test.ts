import { describe, expect, it } from 'vitest';
import {
  assemblyProgress,
  initialsOf,
  InitialsSchema,
  withoutSignOffs,
  withSignOffs,
  type AssemblySignOff,
} from './machineAssembly';
import type { Section } from './schemas';

const sections: Section[] = [
  {
    id: 't1',
    title: 'Task 1',
    items: [
      { id: 'a', text: 'A', assembly: { minutes: 10 } },
      { id: 'b', text: 'B', assembly: { minutes: 30 } },
    ],
  },
  { id: 't2', title: 'Task 2', items: [{ id: 'c', text: 'C' }] },
  { id: 't3', title: 'Empty', items: [] },
];
const by = (initials: string, at: string, email = 'sam@modig.se'): AssemblySignOff => ({
  initials,
  by: email,
  at,
});

describe('initials', () => {
  it('are made from a name or an email', () => {
    expect(initialsOf('Sam Andersson')).toBe('SA');
    expect(initialsOf('lars-christer.svensson@modig.se')).toBe('LCS');
    expect(initialsOf('åsa öberg')).toBe('ÅÖ');
    expect(initialsOf('')).toBe('');
  });

  it('are one to five letters or digits', () => {
    expect(InitialsSchema.parse(' LCS ')).toBe('LCS');
    expect(InitialsSchema.safeParse('3034').success).toBe(true);
    expect(InitialsSchema.safeParse('').success).toBe(false);
    expect(InitialsSchema.safeParse('S A').success).toBe(false);
    expect(InitialsSchema.safeParse('ABCDEF').success).toBe(false);
  });
});

describe('progress', () => {
  it('counts signed steps, and a task is done when all its steps are', () => {
    const progress = assemblyProgress(sections, {
      a: by('SA', '2026-11-23T10:00:00.000Z'),
      b: by('LB', '2026-11-23T12:00:00.000Z'),
      // A step a newer revision no longer has.
      gone: by('SA', '2026-11-24T10:00:00.000Z'),
    });
    expect(progress).toMatchObject({
      steps: 3,
      signed: 2,
      tasksDone: 1,
      minutes: 40,
      minutesSigned: 40,
      done: false,
      lastSignedAt: '2026-11-23T12:00:00.000Z',
    });
    // A task without steps is never done.
    expect(progress.tasks.map((task) => task.done)).toEqual([true, false, false]);
  });

  it('is done when every step is signed, and not for an instruction without steps', () => {
    const all = { a: by('SA', '1'), b: by('SA', '1'), c: by('SA', '1') };
    expect(assemblyProgress(sections, all).done).toBe(true);
    expect(assemblyProgress([], {}).done).toBe(false);
  });
});

describe('signing and taking back', () => {
  it('leaves a step already signed to its first signer', () => {
    const first = { a: by('SA', '1') };
    const next = withSignOffs(first, ['a', 'b'], by('LB', '2', 'lisa@modig.se'));
    expect(next.a?.initials).toBe('SA');
    expect(next.b?.initials).toBe('LB');
    expect(withSignOffs(next, ['a', 'b'], by('XX', '3'))).toBe(next);
  });

  it('takes back only what the caller may', () => {
    const signOffs = { a: by('SA', '1'), b: by('LB', '2', 'lisa@modig.se') };
    const own = (signOff: AssemblySignOff) => signOff.by === 'sam@modig.se';
    expect(withoutSignOffs(signOffs, ['a', 'b', 'c'], own)).toEqual({
      signOffs: { b: signOffs.b },
      refused: ['b'],
    });
    expect(withoutSignOffs(signOffs, ['c'], own).signOffs).toBe(signOffs);
  });
});
