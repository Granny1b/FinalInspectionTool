import { ID_PATTERN, validateForPublish, type Section } from '@modig/shared';
import { describe, expect, it } from 'vitest';
import { indexIssues } from './issues';
import {
  addRow,
  addRowAfter,
  addSection,
  adjacentField,
  deleteRow,
  deleteSection,
  duplicateRow,
  duplicateSection,
  findRow,
  focusAfterRowDelete,
  focusAfterSectionDelete,
  moveRow,
  moveSection,
  renameSection,
  restoreRow,
  restoreSection,
  setRowText,
  singleLine,
} from './ops';

/** Two sections with rows a1..a3 / b1..b2, plus an empty third section. */
function fixture(): Section[] {
  return [
    {
      id: 'sA',
      title: 'Loading area',
      items: [
        { id: 'a1', text: 'Lifting columns - Marked screws' },
        {
          id: 'a2',
          text: 'Light curtains - Correct height',
          guide: {
            description: 'Both sides',
            images: [{ imageId: 'img1', verdict: 'good', annotations: [] }],
          },
        },
        { id: 'a3', text: 'Pallet mover - Chains slack' },
      ],
    },
    {
      id: 'sB',
      title: 'Tool Arena',
      items: [
        { id: 'b1', text: 'Tool changer - Labels' },
        { id: 'b2', text: 'Magazine - Doors' },
      ],
    },
    { id: 'sC', title: 'Gantry', items: [] },
  ];
}

/** "sA:a1,a2,a3 | sB:b1,b2 | sC:" — order at a glance. */
function layout(sections: Section[]): string {
  return sections.map((s) => `${s.id}:${s.items.map((i) => i.id).join(',')}`).join(' | ');
}

describe('sections', () => {
  it('addSection appends an empty, untitled section with a fresh id', () => {
    const before = fixture();
    const { sections, id } = addSection(before);
    expect(sections).toHaveLength(4);
    expect(sections[3]).toEqual({ id, title: '', items: [] });
    expect(id).toMatch(ID_PATTERN);
    expect(before).toHaveLength(3);
    // Untouched sections keep their identity (memoised rows don't re-render).
    expect(sections[0]).toBe(before[0]);
  });

  it('renameSection changes only that title, and is a no-op for the same title or an unknown id', () => {
    const before = fixture();
    const after = renameSection(before, 'sB', 'Tool arena');
    expect(after[1]?.title).toBe('Tool arena');
    expect(after[1]?.items).toBe(before[1]?.items);
    expect(after[0]).toBe(before[0]);
    expect(before[1]?.title).toBe('Tool Arena');
    expect(renameSection(before, 'sB', 'Tool Arena')).toBe(before);
    expect(renameSection(before, 'nope', 'x')).toBe(before);
  });

  it('duplicateSection deep-copies right after the original with fresh section and item ids', () => {
    const before = fixture();
    const result = duplicateSection(before, 'sA');
    if (!result) throw new Error('expected a copy');
    const { sections, id } = result;
    expect(sections.map((s) => s.id)).toEqual(['sA', id, 'sB', 'sC']);
    const original = before[0]!;
    const copy = sections[1]!;
    expect(copy.title).toBe(original.title);
    expect(copy.items.map((i) => i.text)).toEqual(original.items.map((i) => i.text));

    const allIds = sections.flatMap((s) => [s.id, ...s.items.map((i) => i.id)]);
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const item of copy.items) expect(item.id).toMatch(ID_PATTERN);

    // Deep: editing the copy's guide must not reach the original.
    expect(copy.items[1]?.guide).toEqual(original.items[1]?.guide);
    expect(copy.items[1]?.guide).not.toBe(original.items[1]?.guide);
    expect(copy.items[1]?.guide?.images).not.toBe(original.items[1]?.guide?.images);
  });

  it('duplicateSection copies an empty section and returns null for an unknown id', () => {
    const result = duplicateSection(fixture(), 'sC');
    expect(result?.sections.map((s) => s.items.length)).toEqual([3, 2, 0, 0]);
    expect(duplicateSection(fixture(), 'nope')).toBeNull();
  });

  it('deleteSection removes the section and its rows', () => {
    const before = fixture();
    expect(layout(deleteSection(before, 'sA'))).toBe('sB:b1,b2 | sC:');
    expect(layout(before)).toBe('sA:a1,a2,a3 | sB:b1,b2 | sC:');
    expect(deleteSection(before, 'nope')).toBe(before);
    expect(deleteSection([{ id: 'only', title: '', items: [] }], 'only')).toEqual([]);
  });

  it('restoreSection puts a deleted section back as it was (undo), at a clamped index', () => {
    const before = fixture();
    const section = before[0]!;
    const deleted = deleteSection(before, 'sA');
    const restored = restoreSection(deleted, 0, section);
    expect(restored).toEqual(before);
    expect(restored[0]).toBe(section);
    expect(layout(restoreSection(deleted, 9, section))).toBe('sB:b1,b2 | sC: | sA:a1,a2,a3');
    expect(restoreSection(before, 0, section)).toBe(before); // already there
  });

  it('moveSection moves up and down, keeps ids and clamps out-of-range targets', () => {
    const before = fixture();
    expect(moveSection(before, 'sB', 0).map((s) => s.id)).toEqual(['sB', 'sA', 'sC']);
    expect(moveSection(before, 'sB', 2).map((s) => s.id)).toEqual(['sA', 'sC', 'sB']);
    expect(moveSection(before, 'sA', 99).map((s) => s.id)).toEqual(['sB', 'sC', 'sA']);
    expect(moveSection(before, 'sC', -5).map((s) => s.id)).toEqual(['sC', 'sA', 'sB']);
    // Moving keeps the section object (and its rows) as is.
    expect(moveSection(before, 'sB', 0)[0]).toBe(before[1]);
  });

  it('moveSection is a no-op at the ends and for unknown ids', () => {
    const before = fixture();
    expect(moveSection(before, 'sA', -1)).toBe(before);
    expect(moveSection(before, 'sC', 3)).toBe(before);
    expect(moveSection(before, 'sB', 1)).toBe(before);
    expect(moveSection(before, 'nope', 0)).toBe(before);
  });
});

describe('rows', () => {
  it('addRow inserts an empty row at the index, clamped to the section', () => {
    const before = fixture();
    const first = addRow(before, 'sB', 0);
    expect(first && layout(first.sections)).toBe(`sA:a1,a2,a3 | sB:${first?.id},b1,b2 | sC:`);
    const end = addRow(before, 'sB', 99);
    expect(end && layout(end.sections)).toBe(`sA:a1,a2,a3 | sB:b1,b2,${end?.id} | sC:`);
    const negative = addRow(before, 'sB', -3);
    expect(negative?.sections[1]?.items[0]?.id).toBe(negative?.id);
    const intoEmpty = addRow(before, 'sC', 0);
    expect(intoEmpty?.sections[2]?.items).toEqual([{ id: intoEmpty?.id, text: '' }]);
    expect(intoEmpty?.sections[0]).toBe(before[0]);
    expect(addRow(before, 'nope', 0)).toBeNull();
  });

  it('addRowAfter (Enter) inserts right after the row, also after the last one', () => {
    const middle = addRowAfter(fixture(), 'a1');
    expect(middle && layout(middle.sections)).toBe(`sA:a1,${middle?.id},a2,a3 | sB:b1,b2 | sC:`);
    const last = addRowAfter(fixture(), 'b2');
    expect(last && layout(last.sections)).toBe(`sA:a1,a2,a3 | sB:b1,b2,${last?.id} | sC:`);
    expect(addRowAfter(fixture(), 'nope')).toBeNull();
  });

  it('setRowText replaces only that item and keeps everything else', () => {
    const before = fixture();
    const after = setRowText(before, 'a2', 'Light curtains - Height');
    expect(after[0]?.items[1]).toEqual({ ...before[0]?.items[1], text: 'Light curtains - Height' });
    expect(after[0]?.items[1]?.id).toBe('a2');
    expect(after[0]?.items[1]?.guide).toBe(before[0]?.items[1]?.guide);
    expect(after[0]?.items[0]).toBe(before[0]?.items[0]);
    expect(after[1]).toBe(before[1]);
    expect(before[0]?.items[1]?.text).toBe('Light curtains - Correct height');
    expect(setRowText(before, 'a2', 'Light curtains - Correct height')).toBe(before);
    expect(setRowText(before, 'nope', 'x')).toBe(before);
  });

  it('duplicateRow deep-copies right after the original with a fresh id', () => {
    const before = fixture();
    const result = duplicateRow(before, 'a2');
    if (!result) throw new Error('expected a copy');
    expect(layout(result.sections)).toBe(`sA:a1,a2,${result.id},a3 | sB:b1,b2 | sC:`);
    expect(result.id).toMatch(ID_PATTERN);
    expect(result.id).not.toBe('a2');
    const original = before[0]!.items[1]!;
    const copy = result.sections[0]!.items[2]!;
    expect(copy.text).toBe(original.text);
    expect(copy.guide).toEqual(original.guide);
    expect(copy.guide).not.toBe(original.guide);
    expect(duplicateRow(before, 'nope')).toBeNull();
  });

  it('deleteRow removes the row, including the last row of a section', () => {
    const before = fixture();
    expect(layout(deleteRow(before, 'a2'))).toBe('sA:a1,a3 | sB:b1,b2 | sC:');
    expect(layout(deleteRow(deleteRow(before, 'b1'), 'b2'))).toBe('sA:a1,a2,a3 | sB: | sC:');
    expect(deleteRow(before, 'nope')).toBe(before);
  });

  it('restoreRow puts a deleted row back with its id, text and guide (undo)', () => {
    const before = fixture();
    const row = before[0]!.items[1]!;
    const deleted = deleteRow(before, 'a2');
    expect(restoreRow(deleted, 'sA', 1, row)).toEqual(before);
    expect(restoreRow(deleted, 'sA', 1, row)[0]!.items[1]).toBe(row);
    expect(layout(restoreRow(deleted, 'sA', 9, row))).toBe('sA:a1,a3,a2 | sB:b1,b2 | sC:');
    expect(restoreRow(deleted, 'nope', 0, row)).toBe(deleted); // its section is gone
    expect(restoreRow(before, 'sB', 0, row)).toBe(before); // already there: ids stay unique
  });
});

describe('moveRow', () => {
  it('reorders within a section, keeping the item object and its id', () => {
    const before = fixture();
    const down = moveRow(before, 'a1', { sectionId: 'sA', index: 2 });
    expect(layout(down)).toBe('sA:a2,a3,a1 | sB:b1,b2 | sC:');
    expect(down[0]?.items[2]).toBe(before[0]?.items[0]);
    expect(layout(moveRow(before, 'a3', { sectionId: 'sA', index: 0 }))).toBe(
      'sA:a3,a1,a2 | sB:b1,b2 | sC:',
    );
    expect(down[1]).toBe(before[1]);
  });

  it('moves between sections, keeping the id and the guide', () => {
    const before = fixture();
    const after = moveRow(before, 'a2', { sectionId: 'sB', index: 1 });
    expect(layout(after)).toBe('sA:a1,a3 | sB:b1,a2,b2 | sC:');
    expect(after[1]?.items[1]).toBe(before[0]?.items[1]);
    expect(findRow(after, 'a2')).toEqual({ sectionIndex: 1, rowIndex: 1 });
    expect(layout(moveRow(before, 'b2', { sectionId: 'sA', index: 0 }))).toBe(
      'sA:b2,a1,a2,a3 | sB:b1 | sC:',
    );
  });

  it('moves into an empty section, and can empty a section', () => {
    const before = fixture();
    const once = moveRow(before, 'b1', { sectionId: 'sC', index: 0 });
    expect(layout(once)).toBe('sA:a1,a2,a3 | sB:b2 | sC:b1');
    const twice = moveRow(once, 'b2', { sectionId: 'sC', index: 1 });
    expect(layout(twice)).toBe('sA:a1,a2,a3 | sB: | sC:b1,b2');
  });

  it('clamps the index to the target section', () => {
    const before = fixture();
    expect(layout(moveRow(before, 'a1', { sectionId: 'sB', index: 99 }))).toBe(
      'sA:a2,a3 | sB:b1,b2,a1 | sC:',
    );
    expect(layout(moveRow(before, 'a3', { sectionId: 'sB', index: -1 }))).toBe(
      'sA:a1,a2 | sB:a3,b1,b2 | sC:',
    );
    expect(layout(moveRow(before, 'a1', { sectionId: 'sA', index: 99 }))).toBe(
      'sA:a2,a3,a1 | sB:b1,b2 | sC:',
    );
  });

  it('returns the input for a move to the same place or unknown ids', () => {
    const before = fixture();
    expect(moveRow(before, 'a2', { sectionId: 'sA', index: 1 })).toBe(before);
    expect(moveRow(before, 'a3', { sectionId: 'sA', index: 99 })).toBe(before);
    expect(moveRow(before, 'nope', { sectionId: 'sA', index: 0 })).toBe(before);
    expect(moveRow(before, 'a1', { sectionId: 'nope', index: 0 })).toBe(before);
  });
});

describe('focus', () => {
  it('after deleting a row: end of the previous row, else start of the next, else the title', () => {
    const sections = fixture();
    expect(focusAfterRowDelete(sections, 'a2')).toEqual({
      kind: 'row',
      itemId: 'a1',
      caret: 'end',
    });
    expect(focusAfterRowDelete(sections, 'a1')).toEqual({
      kind: 'row',
      itemId: 'a2',
      caret: 'start',
    });
    const single: Section[] = [{ id: 's', title: 'T', items: [{ id: 'x', text: '' }] }];
    expect(focusAfterRowDelete(single, 'x')).toEqual({ kind: 'title', sectionId: 's' });
    // Never jumps into another section.
    expect(focusAfterRowDelete(sections, 'b1')).toEqual({
      kind: 'row',
      itemId: 'b2',
      caret: 'start',
    });
    expect(focusAfterRowDelete(sections, 'nope')).toBeNull();
  });

  it('after deleting a section: the next title, else the previous, else "Add section"', () => {
    const sections = fixture();
    expect(focusAfterSectionDelete(sections, 'sA')).toEqual({ kind: 'title', sectionId: 'sB' });
    expect(focusAfterSectionDelete(sections, 'sC')).toEqual({ kind: 'title', sectionId: 'sB' });
    expect(focusAfterSectionDelete([{ id: 's', title: '', items: [] }], 's')).toEqual({
      kind: 'add-section',
    });
    expect(focusAfterSectionDelete(sections, 'nope')).toBeNull();
  });

  it('adjacentField walks titles and rows in reading order and stops at the ends', () => {
    const sections = fixture();
    expect(adjacentField(sections, { kind: 'row', itemId: 'a3' }, 'down')).toEqual({
      kind: 'title',
      sectionId: 'sB',
    });
    expect(adjacentField(sections, { kind: 'title', sectionId: 'sB' }, 'up')).toEqual({
      kind: 'row',
      itemId: 'a3',
    });
    expect(adjacentField(sections, { kind: 'title', sectionId: 'sA' }, 'down')).toEqual({
      kind: 'row',
      itemId: 'a1',
    });
    expect(adjacentField(sections, { kind: 'row', itemId: 'b2' }, 'down')).toEqual({
      kind: 'title',
      sectionId: 'sC',
    });
    expect(adjacentField(sections, { kind: 'title', sectionId: 'sA' }, 'up')).toBeNull();
    expect(adjacentField(sections, { kind: 'title', sectionId: 'sC' }, 'down')).toBeNull();
    expect(adjacentField(sections, { kind: 'row', itemId: 'nope' }, 'down')).toBeNull();
  });
});

describe('singleLine', () => {
  it('turns pasted line breaks into single spaces', () => {
    expect(singleLine('Lifting columns -\nMarked screws')).toBe('Lifting columns - Marked screws');
    expect(singleLine('a \r\n\r\n  b\rc')).toBe('a b c');
    expect(singleLine('no breaks  here')).toBe('no breaks  here');
  });
});

describe('indexIssues', () => {
  it('groups publish issues by section and row and leaves template issues to the page', () => {
    const sections = fixture();
    sections[1] = { ...sections[1]!, title: ' ' };
    sections[0] = { ...sections[0]!, items: [{ id: 'a1', text: '' }] };
    const index = indexIssues(validateForPublish({ name: '', sections }));
    expect(index.sections.get('sB')).toEqual(['Section 2 needs a title.']);
    expect(index.sections.get('sC')).toEqual(['Section 3 has no rows.']);
    expect(index.items.get('a1')).toEqual(['Row 1.a is empty.']);
    expect(index.sections.size + index.items.size).toBe(3);
  });

  it('collects several messages for one target', () => {
    const index = indexIssues([
      { target: { kind: 'section', sectionId: 's' }, message: 'one' },
      { target: { kind: 'section', sectionId: 's' }, message: 'two' },
    ]);
    expect(index.sections.get('s')).toEqual(['one', 'two']);
  });
});
