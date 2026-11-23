import { stepDepartments, type Item, type Section } from '@modig/shared';

export type StepFilter = {
  /** Words that must all be in the step: its text, instructions, parts, assy, bolts, documents. */
  query: string;
  /** Only this department's steps; '' for all. */
  department: string;
};

export const NO_FILTER: StepFilter = { query: '', department: '' };

export function isFiltering(filter: StepFilter): boolean {
  return Boolean(filter.query.trim() || filter.department);
}

const fold = (text: string) => text.toLowerCase();

/** Everything of a step a search looks in, as one lower-case text. */
function haystack(item: Item): string {
  const step = item.assembly;
  return fold(
    [
      item.text,
      item.guide?.description,
      step?.department,
      step?.assyNumber,
      step?.assyName,
      ...(step?.partNumbers ?? []),
      ...(step?.fasteners ?? []).map((fastener) => fastener.designation),
      ...(step?.documents ?? []).flatMap((document) => [document.label, document.target]),
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export function stepMatches(item: Item, filter: StepFilter): boolean {
  if (filter.department && (item.assembly?.department?.trim() ?? '') !== filter.department) {
    return false;
  }
  const words = fold(filter.query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = haystack(item);
  return words.every((word) => text.includes(word));
}

/** A task with the steps a filter leaves, each with its place in the whole task. */
export type ShownTask = {
  section: Section;
  index: number;
  steps: { item: Item; stepIndex: number }[];
};

/** The tasks as shown under `filter`: every task without one, else only those with a match. */
export function shownTasks(sections: readonly Section[], filter: StepFilter): ShownTask[] {
  const filtering = isFiltering(filter);
  return sections
    .map((section, index) => ({
      section,
      index,
      steps: section.items
        .map((item, stepIndex) => ({ item, stepIndex }))
        .filter(({ item }) => !filtering || stepMatches(item, filter)),
    }))
    .filter((task) => !filtering || task.steps.length > 0);
}

/** Each department with how many steps it has, in the order they first appear. */
export function departmentCounts(sections: readonly Section[]): { name: string; steps: number }[] {
  return stepDepartments([...sections]).map((name) => ({
    name,
    steps: sections.reduce(
      (count, section) =>
        count + section.items.filter((item) => item.assembly?.department?.trim() === name).length,
      0,
    ),
  }));
}
