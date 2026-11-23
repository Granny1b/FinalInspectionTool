import type { GuideWording } from '../guides/wording';

/**
 * How the picture dialogs talk about an assembly step: its pictures show how the step is done; one
 * may be marked as the right or the wrong way.
 */
export const ASSEMBLY_GUIDE_WORDING: GuideWording = {
  title: 'Pictures',
  intro: 'Pictures that show how this step is done, and its instructions.',
  descriptionLabel: 'Instructions',
  descriptionPlaceholder: 'How to do it, what to watch out for, torques, the order of things…',
  imagesHeading: 'Pictures',
  imagesHint:
    'Click a picture to draw arrows, boxes and labels on it; drag its ⠿ to change the order. Paste or drop a picture anywhere here to add it. Mark one Right or Wrong when it shows that.',
  noun: 'picture',
  listLabel: (stepRef) => `Pictures of step ${stepRef}`,
  verdicts: { info: 'Picture', good: 'Right', bad: 'Wrong' },
  stackVerdicts: false,
  removeLabel: 'Remove pictures and instructions',
  removeTitle: (stepRef) => `Remove the pictures and instructions of step ${stepRef}?`,
  removeMessage: 'They are removed from the draft. Published revisions keep theirs.',
  empty: 'No pictures or instructions yet.',
};

/** "12 steps", "1 step", "No steps". */
export function stepCountText(count: number): string {
  return count === 0 ? 'No steps' : count === 1 ? '1 step' : `${count} steps`;
}

/** "3 tasks", "1 task". */
export function taskCountText(count: number): string {
  return count === 1 ? '1 task' : `${count} tasks`;
}
