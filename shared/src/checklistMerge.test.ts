import { describe, expect, it } from 'vitest';
import {
  checklistChanges,
  checklistChangesText,
  mergeChecklists,
  mergeCountsText,
  sameRowContent,
  type ChecklistContent,
  type MergeInput,
} from './checklistMerge';
import type { Item, Section } from './schemas';

/**
 * Checklists written short: `{ S1: 'Loading area', rows: ['a', 'b'] }` per section, where a row
 * is its id and its text is "Row {id}" unless given as `[id, text]` or an Item.
 */
type RowSpec = string | [string, string] | Item;
type SectionSpec = { id: string; title?: string; rows: RowSpec[] };

function row(spec: RowSpec): Item {
  if (typeof spec === 'string') return { id: spec, text: `Row ${spec}` };
  if (Array.isArray(spec)) return { id: spec[0], text: spec[1] };
  return spec;
}

/** The base's titles, so a section written without one is as the base has it. */
const TITLES: Record<string, string> = { S1: 'Loading area', S2: 'Tool arena' };

function checklist(...sections: SectionSpec[]): ChecklistContent {
  return {
    name: 'Quality check – Pre start up',
    quality: { name: 'Pre start up', department: 'Quality' },
    sections: sections.map((section): Section => ({
      id: section.id,
      title: section.title ?? TITLES[section.id] ?? `Section ${section.id}`,
      items: section.rows.map(row),
    })),
  };
}

/** Each section's id and its rows' ids, in order: what the structure came out as. */
function shape(content: ChecklistContent): string[] {
  return content.sections.map(
    (section) => `${section.id}: ${section.items.map((item) => item.id).join(' ')}`,
  );
}

function itemOf(content: ChecklistContent, id: string): Item | undefined {
  return content.sections.flatMap((section) => section.items).find((item) => item.id === id);
}

function merge(input: Partial<MergeInput> & Pick<MergeInput, 'base' | 'theirs' | 'ours'>) {
  return mergeChecklists(input);
}

const BASE = checklist(
  { id: 'S1', title: 'Loading area', rows: ['a', 'b', 'c'] },
  { id: 'S2', title: 'Tool arena', rows: ['d', 'e'] },
);

describe('mergeChecklists: nothing to do', () => {
  it('keeps the copy when the template did not change', () => {
    const ours = checklist(
      { id: 'S1', title: 'Loading area', rows: ['a', ['b', 'Our b'], 'x'] },
      { id: 'S2', title: 'Tool arena', rows: ['e'] },
    );
    const { checklist: merged, report } = merge({ base: BASE, theirs: BASE, ours });
    expect(merged).toEqual(ours);
    expect(report.unchanged).toBe(true);
    expect(report.sections).toEqual([]);
    expect(report.conflicts).toEqual([]);
  });

  it('becomes the template when the copy was never changed', () => {
    const theirs = checklist(
      { id: 'S2', title: 'Tool arena', rows: ['e', 'f'] },
      { id: 'S1', title: 'Loading', rows: ['c', ['a', 'New a']] },
    );
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours: BASE });
    expect(shape(merged)).toEqual(shape(theirs));
    expect(merged.sections.map((section) => section.title)).toEqual(['Tool arena', 'Loading']);
    expect(itemOf(merged, 'a')?.text).toBe('New a');
    expect(report.unchanged).toBe(false);
  });
});

describe('mergeChecklists: rows the template added', () => {
  it('adds them after their neighbour in the template, or first', () => {
    const theirs = checklist(
      { id: 'S1', rows: ['n0', 'a', 'b', 'n1', 'n2', 'c'] },
      { id: 'S2', rows: ['d', 'e', 'n3'] },
    );
    const ours = checklist({ id: 'S1', rows: ['a', 'c'] }, { id: 'S2', rows: ['d', 'e'] });
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours });
    // b was removed here; its new neighbours n1 and n2 follow a, the nearest one still here.
    expect(shape(merged)).toEqual(['S1: n0 a n1 n2 c', 'S2: d e n3']);
    expect(report.totals.added).toBe(4);
    expect(report.sections.map((section) => [section.sectionId, section.added])).toEqual([
      ['S1', 3],
      ['S2', 1],
    ]);
  });

  it('adds a new section after its neighbour, with its rows', () => {
    const theirs = checklist(
      { id: 'S1', rows: ['a', 'b', 'c'] },
      { id: 'S9', title: 'Electrical cabinet', rows: ['p', 'q'] },
      { id: 'S2', rows: ['d', 'e'] },
    );
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours: BASE });
    expect(shape(merged)).toEqual(['S1: a b c', 'S9: p q', 'S2: d e']);
    expect(report.sections).toEqual([
      expect.objectContaining({ sectionId: 'S9', change: 'added', added: 2 }),
    ]);
  });

  it('keeps both when both sides added rows at the same place: the machine’s first', () => {
    const theirs = checklist({ id: 'S1', rows: ['a', 't1', 't2', 'b', 'c'] }, BASE_S2);
    const ours = checklist({ id: 'S1', rows: ['a', 'o1', 'b', 'c'] }, BASE_S2);
    const { checklist: merged } = merge({ base: BASE, theirs, ours });
    expect(shape(merged)).toEqual(['S1: a o1 t1 t2 b c', 'S2: d e']);
  });

  it('keeps both when both sides added a section at the same place', () => {
    const theirs = checklist(...BASE_SECTIONS, { id: 'T', rows: ['t'] });
    const ours = checklist(...BASE_SECTIONS, { id: 'O', rows: ['o'] });
    const { checklist: merged } = merge({ base: BASE, theirs, ours });
    expect(shape(merged)).toEqual(['S1: a b c', 'S2: d e', 'O: o', 'T: t']);
  });

  it('never adds a second row with an id the copy already has', () => {
    const theirs = checklist({ id: 'S1', rows: ['a', 'b', 'c', 'x'] }, BASE_S2);
    const ours = checklist({ id: 'S1', rows: ['a', 'b', 'c'] }, { id: 'S2', rows: ['d', 'x'] });
    const { checklist: merged } = merge({ base: BASE, theirs, ours });
    expect(shape(merged)).toEqual(['S1: a b c', 'S2: d x']);
  });
});

const BASE_S2: SectionSpec = { id: 'S2', title: 'Tool arena', rows: ['d', 'e'] };
const BASE_SECTIONS: SectionSpec[] = [
  { id: 'S1', title: 'Loading area', rows: ['a', 'b', 'c'] },
  BASE_S2,
];

describe('mergeChecklists: rows changed', () => {
  it('takes each field from the side that changed it', () => {
    const base = checklist({
      id: 'S1',
      rows: [{ id: 'a', text: 'Decals', how: 'Look', references: ['ISO 1'], timeHours: 0.2 }],
    });
    const theirs = checklist({
      id: 'S1',
      rows: [
        { id: 'a', text: 'Safety decals', how: 'Look', references: ['ISO 1'], timeHours: 0.3 },
      ],
    });
    const ours = checklist({
      id: 'S1',
      rows: [
        { id: 'a', text: 'Decals', how: 'Look closely', references: ['ISO 1'], timeHours: 0.2 },
      ],
    });
    const { checklist: merged, report } = merge({ base, theirs, ours });
    expect(itemOf(merged, 'a')).toEqual({
      id: 'a',
      text: 'Safety decals',
      how: 'Look closely',
      references: ['ISO 1'],
      timeHours: 0.3,
    });
    expect(report.conflicts).toEqual([]);
    expect(report.totals).toEqual({ added: 0, reworded: 1, changed: 0, removed: 0 });
  });

  it('counts a change of how, references, time or pictures as changed, not reworded', () => {
    const guide = { images: [], description: 'Both tubes' };
    const theirs = checklist(
      {
        id: 'S1',
        rows: [
          { id: 'a', text: 'Row a', guide },
          { id: 'b', text: 'Row b', references: ['ISO 2'] },
          'c',
        ],
      },
      BASE_S2,
    );
    const { report } = merge({ base: BASE, theirs, ours: BASE });
    expect(report.totals).toEqual({ added: 0, reworded: 0, changed: 2, removed: 0 });
    expect(mergeCountsText(report.totals)).toBe('2 rows changed');
  });

  it('keeps the machine’s wording where both changed it, unless the template’s is picked', () => {
    const theirs = checklist({ id: 'S1', rows: [['a', 'Template a'], 'b', 'c'] }, BASE_S2);
    const ours = checklist({ id: 'S1', rows: [['a', 'Machine a'], 'b', 'c'] }, BASE_S2);
    const kept = merge({ base: BASE, theirs, ours });
    expect(itemOf(kept.checklist, 'a')?.text).toBe('Machine a');
    expect(kept.report.conflicts).toEqual([
      expect.objectContaining({
        kind: 'row',
        itemId: 'a',
        ref: '1.a',
        fields: ['text'],
        taken: 'machine',
      }),
    ]);
    expect(kept.report.totals.reworded).toBe(0);

    const taken = merge({ base: BASE, theirs, ours, choices: { takeTemplate: ['a'] } });
    expect(itemOf(taken.checklist, 'a')?.text).toBe('Template a');
    expect(taken.report.conflicts[0]).toMatchObject({ taken: 'template' });
    expect(taken.report.totals.reworded).toBe(1);
  });

  it('takes only the conflicting fields from the side picked; the rest merge as usual', () => {
    const base = checklist({ id: 'S1', rows: [{ id: 'a', text: 'A', how: 'H', timeHours: 1 }] });
    const theirs = checklist({ id: 'S1', rows: [{ id: 'a', text: 'A2', how: 'H', timeHours: 2 }] });
    const ours = checklist({ id: 'S1', rows: [{ id: 'a', text: 'A3', how: 'H3', timeHours: 1 }] });
    const { checklist: merged } = merge({
      base,
      theirs,
      ours,
      choices: { takeTemplate: ['a'] },
    });
    expect(itemOf(merged, 'a')).toEqual({ id: 'a', text: 'A2', how: 'H3', timeHours: 2 });
  });

  it('does not count the same change made on both sides', () => {
    const same = checklist({ id: 'S1', rows: [['a', 'Same'], 'b', 'c'] }, BASE_S2);
    const { report } = merge({ base: BASE, theirs: same, ours: same });
    expect(report.conflicts).toEqual([]);
    expect(report.unchanged).toBe(true);
  });

  it('treats a blank how and no references as none', () => {
    const base = checklist({ id: 'S1', rows: [{ id: 'a', text: 'A' }] });
    const ours = checklist({ id: 'S1', rows: [{ id: 'a', text: 'A', how: ' ', references: [] }] });
    expect(sameRowContent(base.sections[0]!.items[0]!, ours.sections[0]!.items[0]!)).toBe(true);
    const theirs = checklist({ id: 'S1', rows: [{ id: 'a', text: 'A', how: 'New' }] });
    expect(itemOf(merge({ base, theirs, ours }).checklist, 'a')?.how).toBe('New');
  });
});

describe('mergeChecklists: rows removed', () => {
  it('removes a row the template removed', () => {
    const theirs = checklist({ id: 'S1', rows: ['a', 'c'] }, BASE_S2);
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours: BASE });
    expect(shape(merged)).toEqual(['S1: a c', 'S2: d e']);
    expect(report.sections).toEqual([
      expect.objectContaining({ sectionId: 'S1', removed: 1, change: 'changed' }),
    ]);
    expect(report.flagged).toEqual([]);
  });

  it('flags and keeps a removed row that has a result, unless picked to remove', () => {
    const theirs = checklist({ id: 'S1', rows: ['a', 'c'] }, BASE_S2);
    const resultIds = new Set(['b']);
    const kept = merge({ base: BASE, theirs, ours: BASE, resultIds });
    expect(shape(kept.checklist)).toEqual(['S1: a b c', 'S2: d e']);
    expect(kept.report.flagged).toEqual([
      expect.objectContaining({
        itemId: 'b',
        ref: '1.b',
        hasResult: true,
        changedHere: false,
        kept: true,
      }),
    ]);
    expect(kept.report.totals.removed).toBe(0);

    const removed = merge({
      base: BASE,
      theirs,
      ours: BASE,
      resultIds,
      choices: { removeRows: ['b'] },
    });
    expect(shape(removed.checklist)).toEqual(['S1: a c', 'S2: d e']);
    expect(removed.report.flagged[0]).toMatchObject({ kept: false });
    expect(removed.report.totals.removed).toBe(1);
  });

  it('flags a removed row the machine edited (deleted on one side, edited on the other)', () => {
    const theirs = checklist({ id: 'S1', rows: ['a', 'c'] }, BASE_S2);
    const ours = checklist({ id: 'S1', rows: ['a', ['b', 'Our b'], 'c'] }, BASE_S2);
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours });
    expect(itemOf(merged, 'b')?.text).toBe('Our b');
    expect(report.flagged).toEqual([
      expect.objectContaining({ itemId: 'b', hasResult: false, changedHere: true, kept: true }),
    ]);
  });

  it('keeps a row the machine removed removed, and says so when the template changed it', () => {
    const theirs = checklist({ id: 'S1', rows: ['a', ['b', 'Better b'], 'c'] }, BASE_S2);
    const ours = checklist({ id: 'S1', rows: ['a', 'c'] }, BASE_S2);
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours });
    expect(shape(merged)).toEqual(['S1: a c', 'S2: d e']);
    expect(report.skipped).toEqual([
      { kind: 'row', itemId: 'b', text: 'Better b', sectionTitle: 'Loading area' },
    ]);
    expect(report.unchanged).toBe(true);
  });

  it('does not report a row the machine removed and the template left alone', () => {
    const ours = checklist({ id: 'S1', rows: ['a', 'c'] }, BASE_S2);
    const theirs = checklist(
      { id: 'S1', rows: ['a', 'b', 'c'] },
      { id: 'S2', rows: ['d', 'e', 'f'] },
    );
    expect(merge({ base: BASE, theirs, ours }).report.skipped).toEqual([]);
  });
});

describe('mergeChecklists: moves', () => {
  it('moves a row as the template did, within a section and into another', () => {
    const theirs = checklist({ id: 'S1', rows: ['c', 'a'] }, { id: 'S2', rows: ['d', 'b', 'e'] });
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours: BASE });
    expect(shape(merged)).toEqual(['S1: c a', 'S2: d b e']);
    expect(report.sections.map((section) => [section.sectionId, section.rowsMoved])).toEqual([
      ['S1', 1],
      ['S2', 1],
    ]);
  });

  it('keeps a row where the machine moved it, whatever the template did', () => {
    const theirs = checklist({ id: 'S1', rows: ['b', 'c'] }, { id: 'S2', rows: ['d', 'e', 'a'] });
    const ours = checklist({ id: 'S1', rows: ['b', 'c', 'a'] }, BASE_S2);
    const { checklist: merged } = merge({ base: BASE, theirs, ours });
    expect(shape(merged)).toEqual(['S1: b c a', 'S2: d e']);
  });

  it('moved on one side and edited on the other: moved, with the edit', () => {
    // The template moves a into S2; the machine rewords a where it is.
    const theirs = checklist({ id: 'S1', rows: ['b', 'c'] }, { id: 'S2', rows: ['a', 'd', 'e'] });
    const ours = checklist({ id: 'S1', rows: [['a', 'Our a'], 'b', 'c'] }, BASE_S2);
    const one = merge({ base: BASE, theirs, ours });
    expect(shape(one.checklist)).toEqual(['S1: b c', 'S2: a d e']);
    expect(itemOf(one.checklist, 'a')?.text).toBe('Our a');
    expect(one.report.conflicts).toEqual([]);

    // The other way round: the machine moves b to the end; the template rewords it.
    const theirs2 = checklist({ id: 'S1', rows: ['a', ['b', 'New b'], 'c'] }, BASE_S2);
    const ours2 = checklist({ id: 'S1', rows: ['a', 'c'] }, { id: 'S2', rows: ['d', 'e', 'b'] });
    const two = merge({ base: BASE, theirs: theirs2, ours: ours2 });
    expect(shape(two.checklist)).toEqual(['S1: a c', 'S2: d e b']);
    expect(itemOf(two.checklist, 'b')?.text).toBe('New b');
  });

  it('moves a section as the template did, unless the machine moved it', () => {
    const three = checklist(...BASE_SECTIONS, { id: 'S3', rows: ['f'] });
    const theirs = checklist({ id: 'S3', rows: ['f'] }, ...BASE_SECTIONS);
    expect(shape(merge({ base: three, theirs, ours: three }).checklist)).toEqual([
      'S3: f',
      'S1: a b c',
      'S2: d e',
    ]);
    // Four sections. The machine moves S4 up, after S1; the template moves S1 down, after S2.
    const four = checklist(...BASE_SECTIONS, { id: 'S3', rows: ['f'] }, { id: 'S4', rows: ['g'] });
    const ours = checklist(BASE_SECTIONS[0]!, { id: 'S4', rows: ['g'] }, BASE_S2, {
      id: 'S3',
      rows: ['f'],
    });
    const theirs2 = checklist(
      BASE_S2,
      BASE_SECTIONS[0]!,
      { id: 'S3', rows: ['f'] },
      { id: 'S4', rows: ['g'] },
    );
    // Both moves are made: S4 before S2, as the machine has it; S1 after S2, as the template.
    expect(shape(merge({ base: four, theirs: theirs2, ours }).checklist)).toEqual([
      'S4: g',
      'S2: d e',
      'S1: a b c',
      'S3: f',
    ]);
    // Moved on both sides: where the machine put it.
    const both = checklist(BASE_S2, { id: 'S3', rows: ['f'] }, BASE_SECTIONS[0]!, {
      id: 'S4',
      rows: ['g'],
    });
    expect(shape(merge({ base: four, theirs: both, ours: four }).checklist)).toEqual(shape(both));
  });

  it('places a row the template added after one it moved', () => {
    const theirs = checklist(
      { id: 'S1', rows: ['b', 'c'] },
      { id: 'S2', rows: ['d', 'a', 'n', 'e'] },
    );
    expect(shape(merge({ base: BASE, theirs, ours: BASE }).checklist)).toEqual([
      'S1: b c',
      'S2: d a n e',
    ]);
  });
});

describe('mergeChecklists: sections', () => {
  it('takes the template’s new title, and keeps the machine’s where both renamed it', () => {
    const theirs = checklist(
      { id: 'S1', title: 'Loading', rows: ['a', 'b', 'c'] },
      {
        ...BASE_S2,
        title: 'Tools',
      },
    );
    const ours = checklist(
      { id: 'S1', title: 'Loading area', rows: ['a', 'b', 'c'] },
      {
        ...BASE_S2,
        title: 'Tool arena (MG)',
      },
    );
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours });
    expect(merged.sections.map((section) => section.title)).toEqual(['Loading', 'Tool arena (MG)']);
    expect(report.sections).toEqual([
      expect.objectContaining({ sectionId: 'S1', title: 'Loading', renamed: true }),
    ]);
    expect(report.conflicts).toEqual([
      {
        kind: 'section',
        sectionId: 'S2',
        base: 'Tool arena',
        ours: 'Tool arena (MG)',
        theirs: 'Tools',
        taken: 'machine',
      },
    ]);
    const taken = merge({ base: BASE, theirs, ours, choices: { takeTemplate: ['S2'] } });
    expect(taken.checklist.sections[1]?.title).toBe('Tools');
  });

  it('removes a section the template removed', () => {
    const theirs = checklist({ id: 'S1', rows: ['a', 'b', 'c'] });
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours: BASE });
    expect(shape(merged)).toEqual(['S1: a b c']);
    expect(report.sections).toEqual([
      expect.objectContaining({
        sectionId: 'S2',
        title: 'Tool arena',
        change: 'removed',
        removed: 2,
      }),
    ]);
  });

  it('whole section removed by the template while the machine added rows to it: kept with them', () => {
    const theirs = checklist({ id: 'S1', rows: ['a', 'b', 'c'] });
    const ours = checklist(...BASE_SECTIONS.slice(0, 1), { ...BASE_S2, rows: ['d', 'o1', 'e'] });
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours });
    expect(shape(merged)).toEqual(['S1: a b c', 'S2: o1']);
    expect(report.sections).toEqual([
      expect.objectContaining({ sectionId: 'S2', change: 'changed', removed: 2 }),
    ]);
  });

  it('a section removed by the template keeps its rows with results', () => {
    const theirs = checklist({ id: 'S1', rows: ['a', 'b', 'c'] });
    const { checklist: merged } = merge({
      base: BASE,
      theirs,
      ours: BASE,
      resultIds: new Set(['e']),
    });
    expect(shape(merged)).toEqual(['S1: a b c', 'S2: e']);
  });

  it('whole section removed by the machine while the template added rows to it: stays removed', () => {
    const theirs = checklist(...BASE_SECTIONS.slice(0, 1), {
      ...BASE_S2,
      rows: ['d', 'e', 'n1', 'n2'],
    });
    const ours = checklist(...BASE_SECTIONS.slice(0, 1));
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours });
    expect(shape(merged)).toEqual(['S1: a b c']);
    expect(report.skipped).toEqual([
      { kind: 'rows-added', sectionId: 'S2', sectionTitle: 'Tool arena', count: 2 },
    ]);
    expect(report.unchanged).toBe(true);
  });

  it('a row the template moves into a section the machine removed stays where it is', () => {
    const theirs = checklist({ id: 'S1', rows: ['b', 'c'] }, { ...BASE_S2, rows: ['a', 'd', 'e'] });
    const ours = checklist(...BASE_SECTIONS.slice(0, 1));
    expect(shape(merge({ base: BASE, theirs, ours }).checklist)).toEqual(['S1: a b c']);
  });

  it('a new section the template added keeps the rows it moved into it', () => {
    const theirs = checklist(
      { id: 'S1', rows: ['b', 'c'] },
      { id: 'S9', title: 'New', rows: ['a', 'n'] },
      BASE_S2,
    );
    const { checklist: merged, report } = merge({ base: BASE, theirs, ours: BASE });
    expect(shape(merged)).toEqual(['S1: b c', 'S9: a n', 'S2: d e']);
    // A row moved out of a section counts where it lands.
    expect(report.sections).toEqual([
      expect.objectContaining({ sectionId: 'S9', change: 'added', added: 1, rowsMoved: 1 }),
    ]);
  });
});

describe('mergeChecklists: the name and front page', () => {
  it('takes the template’s new title and department', () => {
    const theirs: ChecklistContent = {
      ...BASE,
      name: 'Quality check – Before start',
      quality: { name: 'Before start', department: 'Assembly' },
    };
    const { checklist: merged } = merge({ base: BASE, theirs, ours: BASE });
    expect(merged.name).toBe('Quality check – Before start');
    expect(merged.quality).toEqual({ name: 'Before start', department: 'Assembly' });
  });

  it('a final inspection has no front page', () => {
    const final = { name: 'Final inspection – RigiMill MG', sections: BASE.sections };
    const { checklist: merged } = merge({ base: final, theirs: final, ours: final });
    expect(merged).toEqual(final);
  });
});

describe('checklistChanges', () => {
  it('counts the rows the machine added, removed and changed since the base', () => {
    const copy = checklist(
      { id: 'S1', rows: [['a', 'Changed a'], 'c', 'x'] },
      { id: 'S3', rows: ['y', 'd'] },
    );
    const changes = checklistChanges(BASE.sections, copy.sections);
    expect(changes).toEqual({ added: 2, removed: 2, changed: 1 });
    expect(checklistChangesText(changes)).toBe('2 rows added, 2 removed, 1 changed');
  });

  it('says nothing about a copy as its base, and counts moves as no change', () => {
    const moved = checklist({ id: 'S2', rows: ['e', 'd'] }, { id: 'S1', rows: ['c', 'b', 'a'] });
    const changes = checklistChanges(BASE.sections, moved.sections);
    expect(changes).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(checklistChangesText(changes)).toBe('');
    expect(checklistChangesText({ added: 1, removed: 0, changed: 0 })).toBe('1 row added');
    expect(checklistChangesText({ added: 0, removed: 1, changed: 0 })).toBe('1 row removed');
  });
});

describe('mergeCountsText', () => {
  it('says what comes in, the first count with its noun', () => {
    expect(mergeCountsText({ added: 3, reworded: 1, changed: 0, removed: 1 })).toBe(
      '3 rows added, 1 reworded, 1 removed',
    );
    expect(mergeCountsText({ added: 0, reworded: 1, changed: 0, removed: 0 })).toBe(
      '1 row reworded',
    );
    expect(mergeCountsText({ added: 0, reworded: 0, changed: 0, removed: 0 })).toBe('');
  });
});
